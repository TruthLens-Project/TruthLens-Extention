# TruthLens - Advanced AI Fact-Verification System

<div align="center">
  <video src="https://drive.google.com/uc?export=download&id=1_rrHd1ir3929VBhhkNfu-StvqdPLOqJk" width="100%" height="auto" autoplay muted loop>
    Your browser does not support the video tag.
  </video>
</div>


TruthLens is a professional-grade Chrome Extension that brings "Search-Before-Talk" AI verification to your browser. Unlike generic AI wrappers, TruthLens uses a robust 5-stage pipeline to cross-reference claims against Google Fact Check archives and live web search results before generating a verdict.

## 🚀 Key Features

- **🔍 Smart Context Menu**: Right-click any text or link to instantly verify it.
- **🐦 Social Media Integration**: Adds a "Verify" lens icon directly to Twitter/X posts and WhatsApp messages.
- **📸 Smart Screenshot**: Capture and crop specific areas of the screen (e.g., news headlines in images) for analysis.
- **🧠 "Search-Before-Talk" Architecture**: Does not rely solely on LLM training data. It searches the ground truth first.

---

## 🏗️ The 5-Stage Verification Pipeline

TruthLens runs a sophisticated Python backend (`TruthLensEngine`) that isolates every request to prevent data contamination.

1.  **Stage 0: "The Atomizer" (Claim Extraction)**
    *   Uses Groq (Llama 3) to convert raw text into "Atomic Checkable Claims".
    *   *Example*: "He died today" -> "Ajit Pawar died in Baramati on Jan 28, 2026."
    
2.  **Stage 1: "The Gatekeeper" (Credibility Check)**
    *   Instantly flags known satire sites (*The Onion, The Fauxy*) or blacklisted domains using `sources.json`.
    
3.  **Stage 2: "The Archives" (Google Fact Check)**
    *   Queries the **Google Fact Check Tools API** for existing expert verifications.
    
4.  **Stage 3: "The Newsroom" (Live Triangulation)**
    *   Uses **Tavily API** (Advanced Search) to fetch real-time news from reputable sources (Reuters, PIB, etc.) to handle breaking news.
    
5.  **Stage 4: "The Judge" (Temporal Synthesis)**
    *   Comparing Archive vs. Live evidence.
    *   **Temporal Grounding**: If an old fact-check says "False" but new live reporting confirms the event, the "True" verdict wins.

---

## 🛠️ Installation & Setup

### Prerequisites
- Python 3.9+
- Google Chrome (or Chromium-based browser)

### 1. Backend Setup
Navigate to the extension directory:
```bash
cd TruthLens-Extention
```

Install dependencies:
```bash
pip install fastapi uvicorn groq requests
```

**Configure API Keys**:
Open `server.py` and ensure the keys are set (or set them as Environment Variables):
- `GROQ_API_KEY`: For Llama 3 intelligence.
- `GOOGLE_API_KEY`: For Google Fact Check Tools.
- `TAVILY_API_KEY`: For Live Web Search.

Run the server:
```bash
python server.py
# Server runs on http://localhost:8000
```

### 2. Extension Setup
1.  Open Chrome and go to `chrome://extensions`.
2.  Enable **Developer Mode** (top right toggle).
3.  Click **Load Unpacked**.
4.  Select the `TruthLens-Extention` folder.

---

## 📂 Project Structure

- `manifest.json`: Extension configuration (Manifest V3).
- `popup.html/.js`: The extension UI.
- `content.js`: Handles page interaction.
- `social_overlay.js`: Injects icons into Twitter/WhatsApp.
- `server.py`: The FastAPI Backend (The Brain).
- `sources.json`: Dictionary of Trusted, Blacklisted, and Satire domains.

## 🤝 Contributing
Feel free to open issues or PRs.
