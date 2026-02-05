import pathway as pw
import json

# 1. Define Input Schema
# This matches the data sent by server.py
class ClaimData(pw.Schema):
    text: str
    verdict: str
    score: int
    source: str
    timestamp: str

# 2. Input Connector (HTTP Connector)
# This creates an HTTP server on port 8081 that accepts POST requests with JSON data.
# Each POST request is a "row" in the streaming table.
input_table = pw.io.http.read(
    host="0.0.0.0",
    port=8081,
    schema=ClaimData,
    input_format="json",
    autocommit_duration_ms=1000
)

# 3. Processing (Real-time Analytics)

# A. Recent Claims Window (Just passing through for the ticker)
recent_claims = input_table

# B. Aggregated Stats (Count verdicts in real-time)
# Group by 'verdict' and count
stats_table = input_table.groupby(pw.this.verdict).reduce(
    count=pw.reducers.count(),
    avg_score=pw.reducers.avg(pw.this.score)
)

# 4. Output Connectors
# We will write the processed stream to JSONL files that the dashboard can read (served by server.py)
# Note: In a real production setup, we'd use WebSockets or Redis, but for a Hackathon/File-based demo:

# Write recent claims to a file
pw.io.jsonlines.write(
    recent_claims,
    "stream_claims.jsonl"
)

# Write stats to a separate file
pw.io.jsonlines.write(
    stats_table,
    "stream_stats.jsonl"
)

if __name__ == "__main__":
    print("------------------------------------------------")
    print("🚀 PROCESSED BY PATHWAY (REAL-TIME ENGINE)")
    print("Listening for claims on http://localhost:8081...")
    print("Writing live updates to stream_claims.jsonl")
    print("------------------------------------------------")
    pw.run()
