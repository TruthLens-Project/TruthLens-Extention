import os
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from groq import Groq

# --- CONFIGURATION ---
# API Keys
API_KEY = os.environ.get("GROQ_API_KEY") or "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"
GOOGLE_API_KEY = "AIzaSyDRQ7qnFbf2GAlqEBW43nt2xz39Ul50_FM"
TAVILY_API_KEY = "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"

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

    async def verify_claim(self, claim, google_context, tavily_context):
        if not client: return {"score": 50, "verdict": "Error", "reasoning": "No AI Client"}
        
        system_prompt = """
        You are the "TruthLens Final Judge".
        Your task is to verify a claim by weighing ARCHIVED Fact-Checks vs. LIVE News Reports.
        
        CRITICAL RULE: TEMPORAL GROUNDING
        - New events supercede old fact-checks.
        - If Archive and Live sources conflict, prioritize the most recent Live News (Stage 3).
        
        SCORING MATRIX:
        1. [Verified Match] (90-100): Confirmed by reputable Live News sources OR recent Fact Checks.
        2. [Likely True] (70-89): Supported by reliable sources, no major contradictions.
        3. [Unverified] (30-69): No reliable info found, or sources conflict.
        4. [Likely False] (10-29): Contradicted by reliable sources.
        5. [Verified False] (0-9): Debunked by Fact Checkers or widely reported as false.
        
        OUTPUT FORMAT:
        Provide the output as a valid JSON object.
        {"score": int, "verdict": "str", "reasoning": "str"}
        """
        
        user_prompt = f"""
        CLAIM: {claim}
        EVIDENCE 1: Google Fact Check Archives (Past):
        {google_context or "No Archive Matches"}
        EVIDENCE 2: Tavily Live Search (Present):
        {tavily_context}
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
        
        result = await self.verify_claim(main_claim, google_evidence, tavily_evidence)
        return result

# Endpoint now uses the Class
@app.post("/analyze")
async def analyze_text(request: AnalyzeRequest):
    # Create a BRAND NEW instance for this request (Isolation)
    engine = TruthLensEngine()
    result = await engine.run_pipeline(request.text, request.source_url)
    return result

if __name__ == "__main__":
    import uvicorn
    print("Starting TruthLens Backend on http://localhost:8000")
    if not API_KEY:
        print("!!! WARNING: GROQ_API_KEY IS MISSING !!!")
    uvicorn.run(app, host="0.0.0.0", port=8000)
