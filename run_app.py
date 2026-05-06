"""
run_app.py — Cross-platform launcher for Universal Billing System
Automatically opens the browser when the server is ready.
Run this instead of app.py for the desktop experience.
"""
import subprocess
import threading
import time
import webbrowser
import sys
import os

PORT = 5004
URL  = f"http://localhost:{PORT}"

def open_browser():
    """Wait for Flask to start, then open the browser."""
    time.sleep(2.0)
    print(f"\n  Opening {URL} in your browser...")
    webbrowser.open(URL)

def main():
    print("\n" + "="*48)
    print("  Universal Billing System v4.0")
    print("  Secure Edition — Admin + Staff Login")
    print("="*48)
    print(f"\n  Starting server at {URL}")
    print("  Press Ctrl+C to stop.\n")

    # Open browser in background thread
    threading.Thread(target=open_browser, daemon=True).start()

    # Start Flask
    os.environ.setdefault('PORT', str(PORT))
    from app import app
    app.run(host='0.0.0.0', port=PORT, debug=False, use_reloader=False)

if __name__ == '__main__':
    main()
