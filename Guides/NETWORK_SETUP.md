# Connect Two Laptops — Network Guide

There are 3 ways to do this:

## Option 1: Local Network (LAN) — EASIEST & FREE ⭐

Both laptops on same WiFi. Admin laptop runs the server, Staff laptop connects to it.

### Step 1: Find Admin's IP Address

**On Admin Laptop (Windows):**
- Open Command Prompt (`Win + R` → type `cmd`)
- Type: `ipconfig`
- Look for "IPv4 Address" (usually starts with 192.168.x.x)
- Example: `192.168.1.105`

**On Admin Laptop (Mac/Linux):**
```bash
ifconfig | grep inet
```

### Step 2: Admin Laptop — Start Server

Run the app normally:
```bash
python run_app.py
```
Server starts at `http://localhost:5004`

But we need to make it accessible from the Staff laptop. Open `app.py` and find the last line:

```python
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5004))
    app.run(host='0.0.0.0', port=port, debug=False)
```

The `host='0.0.0.0'` already allows all devices on the network to connect. Good!

### Step 3: Staff Laptop — Connect to Admin

On Staff laptop, open any browser and go to:
```
http://192.168.1.105:5004
```
(Replace `192.168.1.105` with Admin's actual IP)

You'll see the login page. Log in as Staff.

### Step 4: Keep Admin Laptop Running

Admin's laptop must stay on and running the Flask server the whole time Staff is working.

---

## Option 2: Cloud Server (Render.com) — BETTER FOR REMOTE ⭐⭐

Both laptops connect to a cloud server instead of direct P2P. Works even if they're in different cities.

### Step 1: Deploy to Render (Free Tier)

1. Push your code to GitHub
2. Go to https://render.com (create free account)
3. Click "New +" → "Web Service"
4. Connect your GitHub repo
5. Leave most settings default, just:
   - **Name:** `billing-system`
   - **Runtime:** Python 3
   - **Build command:** `pip install -r requirements.txt`
   - **Start command:** `gunicorn app:app`
   - **Environment variable:** `SECRET_KEY` = (long random string)

6. Click Deploy
7. Wait 2 minutes. You'll get a URL like `https://billing-system-abc123.onrender.com`

### Step 2: Both Laptops Connect to Cloud

Admin laptop → Open browser → `https://billing-system-abc123.onrender.com`
Staff laptop → Open browser → `https://billing-system-abc123.onrender.com`

Both log in with their own accounts. Real-time updates!

**Pros:**
- Works anywhere (no local network needed)
- Both laptops can be offline or online anytime
- Data is centralized in the cloud
- Secure HTTPS

**Cons:**
- Requires internet
- Free tier has limits (free tier sleeps after 15 min inactivity)
- For production, pay ~$7/month

---

## Option 3: Windows Server / Dedicated Machine — ENTERPRISE ⭐⭐⭐

If you have a server machine that's always on, deploy there and both laptops connect.

### Setup

1. Install Python on the server
2. Copy all files from `billing_secure/` to the server
3. On server, run: `python run_app.py` or better, use a service manager
4. Both laptops connect to `http://server-ip:5004`

**For always-on (Windows Server):**
- Install `NSSM` (Non-Sucking Service Manager)
- Run Flask as a Windows Service
- Auto-restart if it crashes

---

## RECOMMENDED SETUP FOR YOUR CASE

Since you have 2 laptops (admin + staff):

### Scenario 1: Same Location (Same Office/Home WiFi)
✅ **Use Option 1 (Local Network)**
- Admin's laptop runs the server 24/7
- Staff connects via Admin's IP address
- No internet required, fast, free

### Scenario 2: Different Locations (Remote)
✅ **Use Option 2 (Render Cloud)**
- Deploy once to Render
- Both laptops access the cloud URL
- Works anywhere with internet
- Real-time sync

### Scenario 3: Always-On Requirement
✅ **Use Option 3 (Dedicated Server)**
- A always-on desktop/server machine
- Both laptops connect to it
- Database stays centralized

---

## Real-Time Sync — How It Works

When Admin creates a bill, the Excel file updates instantly. When Staff opens Bill History, they see it immediately because:

1. Both connect to the **same `store_bills.xlsx` file**
2. When either saves a bill, it writes to that file
3. When the other loads history, they read the latest file

⚠️ **Warning:** If both try to edit the same Excel file at the exact same microsecond, the last one to save wins. This is rare. If you need true concurrent edits, use a SQL database instead (PostgreSQL + SQLAlchemy).

---

## Testing the Connection

### Admin Laptop:
```bash
python run_app.py
# Output: "Running on http://0.0.0.0:5004"
```

### Staff Laptop (same WiFi):
Open browser: `http://192.168.1.105:5004`

If it doesn't load:
1. Check both are on same WiFi
2. Check firewall isn't blocking port 5004 (Admin: add exception)
3. Try pinging Admin: `ping 192.168.1.105`

---

## Firewall Setup (Windows)

If Staff can't connect, Admin's firewall is blocking it.

**On Admin Laptop:**
1. Open Settings → Privacy & Security → Windows Defender Firewall
2. Click "Allow an app through firewall"
3. Click "Change settings" (admin)
4. Click "Allow another app"
5. Browse to your Python.exe (usually in AppData\Local\Programs\Python\...)
6. Click Add
7. Restart Flask

Now Staff can connect!

---

## Troubleshooting

| Problem | Solution |
|---|---|
| Staff sees "Connection refused" | Admin laptop isn't running the server |
| Staff sees "Connection timed out" | Firewall blocking (see above) or different WiFi networks |
| Staff can connect but loses connection | Admin laptop went to sleep or WiFi disconnected |
| Data doesn't sync | Both aren't accessing the same `store_bills.xlsx` file |
| "Address already in use" error | Flask is already running. Kill old process or use different port |

---

## Upgrade: Use a Real Database (Optional, Advanced)

For true multi-user with concurrent edits, switch from Excel to PostgreSQL:

1. Install PostgreSQL
2. Install SQLAlchemy: `pip install sqlalchemy psycopg2-binary`
3. Rewrite database.py to use SQL instead of Excel
4. Benefits: True row-level locking, concurrent edits, transactions, backups

This is a bigger change but future-proof if you scale to 10+ users.

---

## Quick Start Commands

### Local Network (Option 1)
**Admin laptop:**
```bash
python run_app.py
```

**Staff laptop:**
Open browser: `http://<admin-ip>:5004`

### Cloud (Option 2)
Deploy to Render once, then both go to: `https://your-app.onrender.com`

---

## My Recommendation

**Start with Option 1 (Local Network)** because:
- ✅ Free
- ✅ No setup
- ✅ Works offline
- ✅ Fast (no internet latency)

When you need remote access or 24/7 uptime, **upgrade to Option 2 (Render)**.

