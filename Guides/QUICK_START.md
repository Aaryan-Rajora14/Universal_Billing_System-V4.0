# 🚀 Universal Billing System v4.0 — Quick Start Guide

## What You Got

A **secure, multi-user billing app** with:
- ✅ Admin & Staff login (separate roles + permissions)
- ✅ Session timeout (10 min) + auto-refresh
- ✅ CSRF protection + audit log
- ✅ Two laptops work together (real-time sync optional)
- ✅ Windows, Mac, Linux supported
- ✅ Can make it a Windows desktop app

---

## 5-Minute Setup

### 1. Extract the Zip
Unzip `universal_billing_secure_v2.zip` to a folder

### 2. Install Python
If not already installed: https://python.org (Windows/Mac/Linux)

### 3. Open Terminal/Command Prompt
Navigate to the extracted folder:
```bash
cd billing_secure
```

### 4. Install Dependencies
```bash
pip install -r requirements.txt
```

### 5. Start the App
```bash
python run_app.py
```
Browser opens automatically at `http://localhost:5004`

### 6. Login
- **Admin:** `admin` / `Admin@1234`
- **Staff:** `staff` / `Staff@1234`

---

## Windows Users — Click to Run

Instead of terminal, just double-click: **`run_windows.bat`**

It installs dependencies and opens the app automatically.

---

## Two Laptops Setup

### Same Location (Same WiFi)
1. **Admin laptop:** Run `python run_app.py`
2. **Find Admin's IP:** Open Command Prompt → `ipconfig` → look for "IPv4 Address"
3. **Staff laptop:** Open browser → `http://192.168.1.105:5004` (use Admin's IP)
4. **Login as Staff:** `staff` / `Staff@1234`
5. **Both see the same bills in real-time** ✅

### Different Locations (Remote)
Deploy to Render.com for free:
1. Push code to GitHub
2. Create account on render.com
3. Connect GitHub repo → Deploy
4. Both laptops access the cloud URL

**See:** `MULTI_USER_SETUP.md` for detailed instructions.

---

## What Can Each Role Do?

| Feature | Admin | Staff |
|---------|-------|-------|
| Create bills | ✅ | ✅ |
| View history | ✅ | ✅ |
| View profits | ✅ | ❌ |
| Export Excel | ✅ | ❌ |
| Change settings | ✅ | ❌ |
| Erase/Reset | ✅ | ❌ |
| View audit log | ✅ | ❌ |

---

## Security Features

- Hashed passwords (never stored plain text)
- CSRF tokens on all requests
- Session expires after 10 min inactivity
- Rate limiting (5 failed logins = 15 min lockout)
- Audit log records all actions
- Input validation + HTML escaping
- Security headers on every response

---

## File Structure

```
billing_secure/
├── app.py                    # Flask backend (secure)
├── database.py               # Excel manager
├── run_app.py                # Cross-platform launcher
├── run_windows.bat           # Double-click to run (Windows)
├── requirements.txt          # Python packages
├── README.md                 # Full documentation
├── MULTI_USER_SETUP.md       # Connect 2 laptops
├── NETWORK_SETUP.md          # Network options (LAN / Cloud)
├── REAL_TIME_SYNC.md         # WebSocket instant sync
├── templates/
│   ├── login.html            # Secure login page
│   └── index.html            # Main app (role-aware)
├── static/
│   ├── css/style.css         # All styles (6 themes)
│   ├── js/script.js          # App logic + session timer
│   ├── bills/                # Generated PDFs
│   └── qr_codes/             # QR images
└── store_bills.xlsx          # Auto-created database

```

---

## Make It a Windows Desktop App

### Method 1: Simple (No Setup Needed)
Just double-click `run_windows.bat` — it looks like a native app in the browser.

### Method 2: Single .exe File
```bash
pip install pyinstaller
pyinstaller --onefile --noconsole --name "BillingSystem" run_app.py
```
Creates `dist/BillingSystem.exe` — no Python needed on target PC.

### Method 3: Proper Desktop Window (Electron)
See `README.md` for full Electron setup.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| "ModuleNotFoundError: No module named 'flask'" | Run `pip install -r requirements.txt` |
| "Address already in use" | Flask already running. Close other terminals. |
| Staff can't connect to Admin | Different WiFi or firewall blocking port 5004 |
| Password doesn't work | Default: `admin/Admin@1234` or `staff/Staff@1234` |
| Lost session after 10 min | Normal. Log in again (or click ↻ button to reset timer) |

---

## Change Default Passwords

First thing to do after login:
1. Click your name (top right) → "Account"
2. Go to "Settings" → "Change Password"
3. Enter old password, new password, confirm

Do this for both `admin` and `staff` accounts!

---

## Deploy to Cloud (Free)

Skip local network, deploy to cloud instead:

1. Push code to GitHub
2. Create free account on render.com
3. Click "New Web Service" → Connect repo
4. Settings:
   - Build: `pip install -r requirements.txt`
   - Start: `gunicorn app:app`
   - Env var: `SECRET_KEY=<long-random-string>`
5. Deploy → Get URL
6. Both laptops visit the URL

See `NETWORK_SETUP.md` for detailed cloud steps.

---

## Real-Time Sync (Optional)

When Admin creates a bill, Staff sees it pop up instantly.

**Already works:** Page refreshes every 5 seconds automatically

**Faster (WebSocket):** See `REAL_TIME_SYNC.md` to add instant notifications

---

## Next Steps

1. ✅ Extract zip and run `python run_app.py`
2. ✅ Login as admin/staff
3. ✅ Create a test bill
4. ✅ Change default passwords
5. ✅ If 2 laptops: Follow `MULTI_USER_SETUP.md`
6. ✅ If deploying: See `NETWORK_SETUP.md`

---

## Support Files

- **`README.md`** — Full feature list + security details
- **`MULTI_USER_SETUP.md`** — Connect admin + staff laptops
- **`NETWORK_SETUP.md`** — Local network vs Cloud vs Server
- **`REAL_TIME_SYNC.md`** — WebSocket for instant updates

---

## Questions?

Check the `.md` files in the folder for detailed guides. Everything you need is documented!

Good luck! 🎉
