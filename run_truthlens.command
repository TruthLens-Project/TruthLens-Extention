#!/bin/bash
cd "$(dirname "$0")" || exit
echo "Starting TruthLens Backend..."
echo "Keep this window open while using the extension."
echo "---------------------------------------------"

# Kill any existing instance of the server (optional, to avoid port conflicts)
pkill -f "python3 server.py" 2>/dev/null

# Check for dependencies
echo "Checking dependencies..."
if ! python3 -c "import exa_py, fastapi, uvicorn" &> /dev/null; then
    echo "Installing missing dependencies..."
    pip3 install exa-py fastapi uvicorn requests python-dotenv groq python-multipart websockets
fi

# Run server
echo "Launching server..."
python3 server.py

# Keep window open if server crashes
echo ""
echo "---------------------------------------------"
echo "Server stopped unexpectedly."
read -p "Press [Enter] key to close..."
