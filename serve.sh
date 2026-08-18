#!/bin/bash
# Serves this folder so your iPhone can open it over your home Wi-Fi.
# Stop it with Ctrl+C. Nothing leaves your network.
cd "$(dirname "$0")"
PORT=${1:-8080}
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo ""
echo "  On this Mac:    http://localhost:$PORT/budget/"
[ -n "$IP" ] && echo "  On your iPhone: http://$IP:$PORT/budget/" || echo "  (Could not detect your Wi-Fi address — check System Settings > Wi-Fi > Details.)"
echo ""
python3 -m http.server "$PORT" --bind 0.0.0.0
