import os
from groq import Groq


API_KEY = "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"

try:
    print(f"Testing API Key: {API_KEY[:10]}...")
    client = Groq(api_key=API_KEY)
    
    completion = client.chat.completions.create(
        messages=[{"role": "user", "content": "Hello"}],
        model="llama3-8b-8192"
    )
    print("Success! Response:", completion.choices[0].message.content)
except Exception as e:
    print("API Key Failed:", e)
