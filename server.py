import os
from fastapi import FastAPI, HTTPException, WebSocket, WebSocketDisconnect, Request
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
import asyncio
from groq import Groq
from exa_py import Exa

import json
import requests
import time # Added for timestamp

# --- CONFIGURATION ---
# API Keys
API_KEY = os.environ.get("GROQ_API_KEY") or "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"
GOOGLE_API_KEY = "AIzaSyDRQ7qnFbf2GAlqEBW43nt2xz39Ul50_FM"
TAVILY_API_KEY = "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"
EXA_API_KEY = os.environ.get("EXA_API_KEY") or "750d244e-525b-4288-b415-166065bbca48"

import json
import requests

# Load Sources
try:
    with open("sources.json", "r") as f:
        SOURCES = json.load(f)
except:
    SOURCES = {"blacklisted": [], "trusted": [], "satire": []}

app = FastAPI()

# Allow CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize Groq Client
client = None
if API_KEY:
    try:
        client = Groq(api_key=API_KEY)
    except Exception as e:
        print(f"Groq Init Error: {e}")

# Initialize Exa Client
exa = Exa(api_key=EXA_API_KEY)

class AnalyzeRequest(BaseModel):
    text: str
    source_url: str = None

# ==========================================
# TRUTHLENS ENGINE (Per-Request Isolation)
# ==========================================
class TruthLensEngine:
    def __init__(self):
        # Fresh state for every request
        self.claims = []
        self.evidence = {}
        
    async def is_claim_checkable(self, text):
        if not client: return True # Fail open if no AI
        
        system_prompt = """
        You are a Checkability Filter.
        Analyze the text and answer ONLY 'YES' or 'NO'.
        
        Criteria for YES:
        1. It contains a factual claim about real-world events, people, history, or science.
        2. It is not a hypothetical question ("What if...").
        3. It is not a subjective opinion ("I like...").
        4. It is not creative fiction/sci-fi.
        """
        
        try:
            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Is this a checkable factual claim? '{text}'"}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.0
            )
            ans = completion.choices[0].message.content.strip().upper()
            return "YES" in ans
        except:
            return True # Fallback

    async def extract_claims(self, text):
        if not client: return [text] 
        
        system_prompt = """
        You are an expert Claim Extractor.
        Your goal is to convert raw text into "ATOMIC CHECKABLE CLAIMS".
        
        RULES:
        1. Decontextualize: Replace "He", "She", "It", "They" with actual entity names found in the text.
        2. Atomicity: Split complex sentences into individual facts.
        3. Specificity: Include dates, locations, and specific details if available.
        4. Ignore: Opinions, questions, greetings, or vague statements.
        5. TRANSLATION (CRITICAL):
           - The input might be in Hindi, "Hinglish" (Hindi written in English), or mixed.
           - YOU MUST TRANSLATE EVERYTHING TO PURE ENGLISH CLAIMS.
           - Example Input: "Modi ji ne note band kar diya." -> Claim: "Narendra Modi announced demonetization of currency notes."
        6. IGNORE: "Verdict: Uncheckable" or meta-commentary. Just extract the core claim asserted.
        
        Return a valid JSON object: {"claims": ["string", "string"]}
        """
        
        try:
            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": text}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.0,
                response_format={"type": "json_object"}
            )
            data = json.loads(completion.choices[0].message.content)
            return data.get("claims", [text])
        except Exception as e:
            print(f"Stage 0 Error: {e}")
            return [text]

    def check_credibility(self, url):
        if not url: return None
        for domain in SOURCES.get("blacklisted", []):
            if domain in url:
                return {"score": 10, "verdict": "High Risk Source", "reasoning": f"Domain '{domain}' is flagged as unreliable."}
        for domain in SOURCES.get("satire", []):
            if domain in url:
                return {"score": 0, "verdict": "Satire", "reasoning": f"Domain '{domain}' is a known satire site."}
        return None

    async def check_google_facts(self, claim):
        if not GOOGLE_API_KEY: return None
        print(f"Searching Google Archives for: {claim}")
        try:
            url = "https://factchecktools.googleapis.com/v1alpha1/claims:search"
            params = {
                "query": claim,
                "key": GOOGLE_API_KEY,
                "languageCode": "en",
                "pageSize": 3
            }
            resp = requests.get(url, params=params)
            if resp.status_code == 200:
                data = resp.json()
                if "claims" in data and data["claims"]:
                    results = []
                    for item in data["claims"]:
                        review = item["claimReview"][0]
                        results.append(f"- [ARCHIVE] {item['claimDate']}: {review['publisher']['site']} rated it '{review.get('textualRating', 'Unknown')}'")
                    return "\n".join(results)
        except Exception as e:
            print(f"Google API Error: {e}")
        return None

    async def search_tavily(self, claim):
        if not TAVILY_API_KEY: return "Tavily Key Missing."
        print(f"Searching Live News for: {claim}")
        try:
            url = "https://api.tavily.com/search"
            payload = {
                "api_key": TAVILY_API_KEY,
                "query": claim,
                "search_depth": "advanced", 
                "include_answer": True,
                "max_results": 5
            }
            resp = requests.post(url, json=payload)
            if resp.status_code == 200:
                data = resp.json()
                context = ""
                if data.get("answer"):
                    context += f"Tavily Summary: {data['answer']}\n\n"
                for result in data.get("results", []):
                    pub_date = result.get('published_date', 'Unknown Date')
                    context += f"- [LIVE NEWS] ({pub_date}) {result['url']}: {result['content']}\n"
                return context
        except Exception as e:
            print(f"Tavily API Error: {e}")
        return "Error getting live news."

    async def search_exa(self, claim):
        if not EXA_API_KEY: return "Exa Key Missing."
        print(f"Searching Exa (Deep Search) for: {claim}")
        try:
            # SDK usage
            result = exa.search(
                query=claim,
                type="auto",
                num_results=3,
                contents={"text": {"max_characters": 1000}}
            )
            
            context = ""
            for res in result.results:
                pub_date = getattr(res, "published_date", "Unknown Date")
                context += f"- [EXA DEEP SEARCH] ({pub_date}) {res.url}: {res.text[:300]}...\n"
            return context
        except Exception as e:
            print(f"Exa API Error: {e}")
            return "Error getting Exa results."

    async def verify_claim(self, claim, google_context, tavily_context, exa_context):
        if not client: return {"score": 50, "verdict": "Error", "reasoning": "No AI Client"}
        
        system_prompt = """
        You are the "TruthLens Final Judge".
        Your task is to verify a claim by weighing ARCHIVED Fact-Checks vs. LIVE News Reports (Tavily) vs. deep semantic search (Exa).
        
        CRITICAL RULE: TEMPORAL GROUNDING
        - New events supercede old fact-checks.
        - If Archive and Live sources conflict, prioritize the most recent Live News/Exa results (Stage 3).
        
        SCORING MATRIX:
        1. [Verified Match] (90-100): Confirmed by reputable Live News sources OR recent Fact Checks.
        2. [Likely True] (70-89): Supported by reliable sources, no major contradictions.
        3. [Unverified] (30-69): No reliable info found, or sources conflict.
        4. [Likely False] (10-29): Contradicted by reliable sources.
        5. [Verified False] (0-9): Debunked by Fact Checkers or widely reported as false.
        
        SPECIAL RULE FOR "UNCHECKABLE":
        - Do NOT return "Uncheckable" just because the claim is vague. Attempt to infer the context (e.g., "DC Blinked" -> "US Government yielded").
        - Only return "Uncheckable" if the text is pure gibberish or purely personal opinion (e.g., "I like tea").
        
        OUTPUT FORMAT:
        Provide the output as a valid JSON object.
        {"score": int, "verdict": "str", "reasoning": "str"}
        
        BHARAT MODE (MULTI-LINGUAL):
        - If the claim is relevant to India or the input language seems to be Hindi/Indian-Regional, provide the 'reasoning' value in this format:
          "English Explanation... \n\n🇮🇳 Hindi: [Hindi Translation of Exception]"
        - Otherwise, just provide English.
        """
        
        user_prompt = f"""
        CLAIM: {claim}
        EVIDENCE 1: Google Fact Check Archives (Past):
        {google_context or "No Archive Matches"}
        EVIDENCE 2: Tavily Live Search (Present):
        {tavily_context}
        EVIDENCE 3: Exa Deep Search (Context):
        {exa_context}
        """
        
        try:
            completion = client.chat.completions.create(
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt}
                ],
                model="llama-3.3-70b-versatile",
                temperature=0.1,
                response_format={"type": "json_object"}
            )
            return json.loads(completion.choices[0].message.content)
        except Exception as e:
            return {"score": 50, "verdict": "Error", "reasoning": str(e)}

    async def transcribe_audio(self, audio_file):
        if not client: return "No AI Client for transcription."
        print(f"Transcribing audio file...")
        try:
            # Create a temporary file to save the uploaded audio
            with open("temp_audio.wav", "wb") as f:
                f.write(await audio_file.read())
            
            with open("temp_audio.wav", "rb") as file:
                transcription = client.audio.transcriptions.create(
                    file=(file.name, file.read()),
                    model="whisper-large-v3",
                    response_format="text"
                )
            return transcription
        except Exception as e:
            print(f"Transcription Error: {e}")
            return f"Error transcribing audio: {e}"
        finally:
            if os.path.exists("temp_audio.wav"):
                os.remove("temp_audio.wav")

    async def run_pipeline(self, text, source_url):
        print(f"Pipeline started for: {text[:50]}...")
        
        # 1. Pre-Flight Check (Checkability)
        checkable = await self.is_claim_checkable(text)
        if not checkable:
            return {
                "score": 0, 
                "verdict": "Uncheckable", 
                "reasoning": "This text appears to be hypothetical, creative fiction, or a subjective opinion. TruthLens only checks factual claims about real-world events."
            }

        # 2. Credibility Check
        credibility = self.check_credibility(source_url)
        if credibility: return credibility
        
        # 3. Extract Claims
        self.claims = await self.extract_claims(text)
        print(f"Extracted Claims: {self.claims}")
        
        if not self.claims:
            return {"score": 50, "verdict": "Unclear", "reasoning": "No testable claims found."}

        # 4. Analyze Main Claim
        main_claim = self.claims[0]
        google_evidence = await self.check_google_facts(main_claim)
        tavily_evidence = await self.search_tavily(main_claim)
        exa_evidence = await self.search_exa(main_claim)
        
        result = await self.verify_claim(main_claim, google_evidence, tavily_evidence, exa_evidence)
        
        try:
            forward_data_time = str(int(time.time()))
            # Send to Pathway Brain for Real-Time Dashboard (FILE STREAMING)
            forward_data = {
                "text": main_claim,
                "verdict": result.get("verdict", "Unknown"),
                "score": result.get("score", 0),
                "source": source_url or "Unknown",
                "timestamp": forward_data_time 
            }
            # Append to the file that Pathway is watching
            with open("live_stream.jsonl", "a") as f:
                f.write(json.dumps(forward_data) + "\n")
        except Exception: pass
        # ------------------------------------------

        return result

    async def analyze_image(self, image_data):
        if not client: return {"error": "No AI Client"}
        print("Analyzing Image with Llama 3.2 Vision...")
        
        try:
            # 1. Vision Analysis (OCR + Claim Extraction)
            completion = client.chat.completions.create(
                model="llama-3.2-11b-vision-preview",
                messages=[
                    {
                        "role": "user",
                        "content": [
                            {"type": "text", "text": "Extract the main text/headline from this image. Then, just like a fact-checker, identify the core claim. Return ONLY the claim text."},
                            {
                                "type": "image_url",
                                "image_url": {
                                    "url": image_data
                                }
                            }
                        ]
                    }
                ],
                temperature=0.0,
                max_tokens=200
            )
            extracted_claim = completion.choices[0].message.content.strip()
            print(f"Extracted Claim: {extracted_claim}")
            
            # 2. Verify the extracted claim
            return await self.run_pipeline(extracted_claim, source_url="Image/Screenshot")
            
        except Exception as e:
            print(f"Vision Error: {e}")
            return {"error": str(e)}

@app.post("/analyze-image")
async def api_analyze_image(request: Request):
    data = await request.json()
    image_data = data.get("image") # Base64 data url
    
    if not image_data:
        raise HTTPException(status_code=400, detail="No image provided")
        
    engine = TruthLensEngine()
    return await engine.analyze_image(image_data)

# Endpoint now uses the Class
@app.post("/analyze")
async def analyze_text(request: AnalyzeRequest):
    # Create a BRAND NEW instance for this request (Isolation)
    engine = TruthLensEngine()
    result = await engine.run_pipeline(request.text, request.source_url)
    return result

from fastapi import UploadFile, File

@app.post("/analyze-audio")
async def analyze_audio(file: UploadFile = File(...)):
    engine = TruthLensEngine()
    
    # 1. Transcribe
    transcription = await engine.transcribe_audio(file)
    print(f"Transcription: {transcription[:100]}...")
    
    # 2. Run Pipeline on Transcribed Text
    # We use a dummy URL or the filename for context
    result = await engine.run_pipeline(transcription, source_url="Audio Transcription")
    
    # Attach transcription to debug (optional)
    result["transcription_snippet"] = transcription[:200]
    return result

# ==========================================
# REAL-TIME WEBSOCKET ENDPOINT
# ==========================================
@app.websocket("/ws/live-monitor")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("WebSocket Connected: Receiving Live Audio Stream...")
    
    engine = TruthLensEngine()
    
    try:
        while True:
            # Receive a complete audio chunk (blob) from frontend
            # Frontend will now send ~3s valid clips
            data = await websocket.receive_bytes()
            
            print(f"Received Audio Chunk: {len(data)} bytes")
            
            # 1. Save to temp file
            temp_filename = f"live_chunk_{id(websocket)}.webm"
            with open(temp_filename, "wb") as f:
                f.write(data)
            
            # 2. Transcribe
            transcription = ""
            try:
                with open(temp_filename, "rb") as file:
                    if client:
                        transcription = client.audio.transcriptions.create(
                            file=(temp_filename, file.read()),
                            model="whisper-large-v3",
                            response_format="text"
                        )
                    else:
                         # Fallback purely for testing if API fails
                        transcription = "" 
            except Exception as e:
                print(f"Live Transcribe Error: {e}")
            
            # Clean up
            if os.path.exists(temp_filename):
                os.remove(temp_filename)

            # 3. Verify
            clean_text = str(transcription).strip()
            print(f"Transcription Result: '{clean_text}'")

            if len(clean_text) > 5: # Lower threshold causing issues?
                # Send "Processing" status
                await websocket.send_json({"status": "processing", "text": clean_text})
                
                # Check claim
                result = await engine.run_pipeline(clean_text, source_url="Live Stream")
                
                await websocket.send_json({
                    "status": "complete",
                    "text": clean_text,
                    "verdict": result.get("verdict", "Unknown"),
                    "score": result.get("score", 50),
                    "reasoning": result.get("reasoning", "No info")
                })
            else:
                print(f"Skipping: Text too short or empty ({len(clean_text)} chars)")
                # Optional: Send keep-alive or silence notice? 
                # Better to settle for silence to not spam UI
                pass
                    
    except WebSocketDisconnect:
        print("WebSocket Disconnected")
    except Exception as e:
        print(f"WebSocket Error: {e}")

@app.get("/dashboard-data")
async def get_dashboard_data():
    """Reads the latest stats from Pathway's JSONL output."""
    stats_file = "stream_stats.jsonl"
    recent_file = "stream_claims.jsonl"
    
    data = {"stats": [], "recent": []}
    
    # Read Stats
    if os.path.exists(stats_file):
        with open(stats_file, "r") as f:
            lines = f.readlines()
            for line in lines[-10:]: # Last 10 updates
                try:
                   data["stats"].append(json.loads(line))
                except: pass
    
    # Read Recent Claims
    if os.path.exists(recent_file):
         with open(recent_file, "r") as f:
            lines = f.readlines()
            # Reverse order (newest first)
            for line in reversed(lines[-5:]): 
                try:
                   data["recent"].append(json.loads(line))
                except: pass
                
    return data


if __name__ == "__main__":
    import uvicorn
    print("Starting TruthLens Backend on http://localhost:8000")
    if not API_KEY:
        print("!!! WARNING: GROQ_API_KEY IS MISSING !!!")
    uvicorn.run(app, host="0.0.0.0", port=8000)
