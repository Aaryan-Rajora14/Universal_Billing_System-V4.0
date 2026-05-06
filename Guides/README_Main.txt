# Universal Billing System v4.0 — Secure Edition

## Default Login Credentials
| Role  | Username | Password   |
|-------|----------|------------|
| Admin | admin    | Admin@1234 |
| Staff | staff    | Staff@1234 |

> **Change these immediately after first login** via Settings → Change Password.

---

## Quick Start

### Local / Desktop (Windows)
Double-click `run_windows.bat` — it installs dependencies and opens the browser automatically.

Or from terminal:
```
pip install -r requirements.txt
python run_app.py
```
Then open http://localhost:5004

### Deploy to Render (free cloud hosting)
1. Push to GitHub
2. Create new Web Service on render.com
3. Connect your repo — Render reads `render.yaml` automatically
4. Set env var `SECRET_KEY` to a long random string in Render dashboard
5. Deploy — live at `https://your-app.onrender.com`

---

## Role Permissions

| Feature                  | Admin | Staff |
|--------------------------|-------|-------|
| Create bills / PDF       | ✅    | ✅    |
| View bill history        | ✅    | ✅    |
| View dashboard stats     | ✅    | ✅    |
| View estimated profit    | ✅    | ❌    |
| Export Excel             | ✅    | ❌    |
| View database            | ✅    | ❌    |
| Data Control page        | ✅    | ❌    |
| Change store settings    | ✅    | ❌    |
| Set profit margin        | ✅    | ❌    |
| View audit log           | ✅    | ❌    |
| Erase all bills          | ✅    | ❌    |
| Factory reset            | ✅    | ❌    |
| Change own password      | ✅    | ✅    |

---

## Security Features

1. **Hashed Passwords** — Werkzeug PBKDF2-SHA256, never stored in plain text
2. **CSRF Protection** — Every POST request requires a matching token from the session
3. **Session Timeout** — Auto-expires after 10 minutes of inactivity; shows countdown
4. **Manual Refresh** — Click the ↻ button in the top bar to reset the 10-min timer
5. **Rate Limiting** — 5 failed login attempts per IP triggers a 15-minute lockout
6. **Role-Based Access** — Admin vs Staff enforced on every API route server-side
7. **Security Headers** — X-Frame-Options, X-XSS-Protection, Content-Security-Policy, etc.
8. **Audit Log** — Every login, logout, bill generation, and admin action is logged to `audit.log`
9. **Input Sanitisation** — All inputs stripped, length-limited, and HTML-escaped before use
10. **Session Fixation Prevention** — Session is cleared and regenerated on every login
11. **Path Traversal Prevention** — `os.path.basename()` used on all file-serving routes
12. **HttpOnly Cookies** — Session cookie is not accessible from JavaScript

---

## Making It a Windows Desktop App (3 Methods)

### Method 1 — Simple Launcher (Recommended, No Install Needed)
Just use `run_windows.bat`. Double-click it and the app opens in the browser like a native app.
Works on any Windows PC that has Python installed.

### Method 2 — PyInstaller (Single .exe File)
Package the entire app into one `.exe` that runs without Python installed:

```bash
pip install pyinstaller
pyinstaller --onefile --noconsole --name "BillingSystem" run_app.py
```

The `.exe` will be in the `dist/` folder. Double-click it — it starts the server and opens the browser automatically.

**Important:** Also copy these folders next to the `.exe`:
- `templates/`
- `static/`
- `database.py`
- `requirements.txt`

### Method 3 — Electron Wrapper (Looks Like a Real Desktop App)
Wraps the Flask app in a proper desktop window with no browser address bar:

1. Install Node.js from nodejs.org
2. In your project folder:
```bash
npm init -y
npm install electron
```

3. Create `main.js`:
```javascript
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const path = require('path');

let flaskProcess = null;

function createWindow() {
    const win = new BrowserWindow({
        width: 1400, height: 900,
        title: 'Universal Billing System',
        webPreferences: { nodeIntegration: false }
    });
    win.loadURL('http://localhost:5004');
    win.setMenuBarVisibility(false);
}

app.whenReady().then(() => {
    // Start Flask server
    flaskProcess = spawn('python', ['app.py'], { cwd: __dirname });

    // Wait 2s for Flask to start, then open window
    setTimeout(createWindow, 2000);
});

app.on('window-all-closed', () => {
    if (flaskProcess) flaskProcess.kill();
    app.quit();
});
```

4. Add to `package.json`:
```json
"main": "main.js",
"scripts": { "start": "electron ." }
```

5. Run: `npm start`

To package into an installer: `npm install electron-builder --save-dev` then `npx electron-builder`

---

## File Structure
```
billing_secure/
├── app.py              # Flask backend with all security logic
├── database.py         # Excel database manager
├── run_app.py          # Cross-platform launcher (auto-opens browser)
├── run_windows.bat     # Windows double-click launcher
├── requirements.txt    # Python dependencies
├── render.yaml         # Render.com deployment config
├── .python-version     # Python version pin (3.11.9)
├── audit.log           # Auto-created — security event log
├── store_bills.xlsx    # Auto-created — database file
├── templates/
│   ├── login.html      # Secure login page
│   └── index.html      # Main app (role-aware UI)
└── static/
    ├── css/style.css   # All styles + mobile responsive
    ├── js/script.js    # App logic + session timer + CSRF
    ├── bills/          # Generated PDFs
    └── qr_codes/       # QR code images
```

---

## Multi-User Setup — Admin + Staff On Separate Laptops

### Quick Start (Same WiFi)

**Admin Laptop:**
```bash
python run_app.py
```

**Staff Laptop:**
Open browser → `http://192.168.1.105:5004` (use Admin's IP address)

Both log in with separate accounts. Shared Excel database. Real-time sync.

**See:** `MULTI_USER_SETUP.md` for detailed instructions.

### Three Connection Options

| Option | Use Case | Real-Time | Setup |
|--------|----------|-----------|-------|
| **Local Network** | Same office, same WiFi | ✅ WebSocket instant | Easiest |
| **Cloud (Render)** | Remote locations | ⚠️ Polling only | Free tier |
| **Dedicated Server** | 24/7 always-on | ✅ WebSocket | Advanced |

See `NETWORK_SETUP.md` for pros/cons of each.

### Real-Time Sync (WebSocket)

When Admin creates a bill, Staff sees it pop up instantly. See `REAL_TIME_SYNC.md` to add WebSocket support.

Without WebSocket, Staff's page refreshes every 5 seconds automatically.

