# Multi-User Setup — Admin + Staff Connection Guide

## What You're Setting Up

Two laptops, one Admin and one Staff, sharing the same billing database in real-time.

---

## Quick Setup (5 minutes)

### 1. Admin Laptop — Start the Server

```bash
# In terminal:
cd billing_secure
python run_app.py
```

You'll see:
```
Running on http://0.0.0.0:5004
Opening http://localhost:5004 in your browser...
```

**Keep this terminal open.** The server runs while you work.

### 2. Find Admin's IP Address

**Windows:** Open Command Prompt
```cmd
ipconfig
```
Look for "IPv4 Address" → copy it (e.g., `192.168.1.105`)

**Mac/Linux:** Open Terminal
```bash
ifconfig | grep inet
```

### 3. Staff Laptop — Connect to Admin

Open any browser and go to:
```
http://192.168.1.105:5004
```
(Replace `192.168.1.105` with your Admin's IP)

You'll see the login screen. Log in as `staff / Staff@1234`.

### 4. Test It

**Admin's laptop:**
- Create a test bill (fill form, click "Generate Bill")
- See the PDF download

**Staff's laptop:**
- Go to "Bill History"
- See the new bill appear instantly ✅

---

## Architecture

```
┌─────────────────┐
│  Admin Laptop   │
├─────────────────┤
│   Python/Flask  │
│    Server       │
│   (Port 5004)   │
├─────────────────┤
│ store_bills.xlsx│ ← Central database
└────────┬────────┘
         │ WiFi (192.168.1.105:5004)
         │
┌────────▼────────┐
│  Staff Laptop   │
├─────────────────┤
│   Web Browser   │
│   (Any browser) │
└─────────────────┘
```

---

## Data Flow

1. **Admin creates bill** → Flask saves to Excel → WebSocket notifies all users
2. **Staff's browser gets notification** → Automatically loads latest bills
3. **Both see the same data** in real-time

---

## Three Connection Options

### Option A: Local Network (Same WiFi) ⭐⭐⭐ RECOMMENDED

**Best for:** Same office, same building
- ✅ Instant real-time sync
- ✅ No internet required
- ✅ Free
- ✅ Fast (local connection)

**Setup:** See "Quick Setup" above

**Cons:** Admin's laptop must stay on and connected

---

### Option B: Cloud Server (Render.com) ⭐⭐

**Best for:** Remote locations, different cities
- ✅ Works anywhere with internet
- ✅ No local network setup
- ✅ Both can be offline anytime
- ✅ 24/7 uptime (if you upgrade past free tier)

**Setup:**

1. Push to GitHub
2. Go to render.com → Create free account
3. Click "New Web Service" → Connect your GitHub repo
4. Deploy settings:
   - **Build:** `pip install -r requirements.txt`
   - **Start:** `gunicorn app:app`
   - **Env var:** `SECRET_KEY=` (generate long random string)
5. Wait 2 minutes → Get URL like `https://your-app.onrender.com`
6. Both laptops go to that URL

**Cons:**
- Free tier sleeps after 15 min inactivity (costs $7/month for always-on)
- Requires internet
- Slower than local network

---

### Option C: Dedicated Server ⭐

**Best for:** 24/7 operation, multiple users
- ✅ Always-on (never sleeps)
- ✅ Centralized data
- ✅ Can grow to many users

**Setup:**
- Have a server/desktop that's always on
- Install Python there
- Run `python run_app.py` on the server
- Both laptops connect to server IP

---

## Common Issues & Fixes

| Problem | Cause | Fix |
|---------|-------|-----|
| Staff sees "Connection refused" | Admin server isn't running | Terminal: `python run_app.py` on Admin laptop |
| Staff sees "Connection timed out" | Different WiFi or firewall blocked | Check same WiFi, add Python to firewall exception |
| Data doesn't update on Staff laptop | Not using WebSocket | Refresh page (F5) or wait 5 sec for polling |
| "Address already in use" error | Flask already running | Kill old process: `taskkill /im python.exe` (Windows) |
| Can't find Admin's IP | Network issue | Use `ipconfig` on Admin, try pinging first |

---

## Security Notes

- Both log in separately with their own accounts
- Staff can't access Admin functions (enforced on server)
- All requests use CSRF tokens
- Session expires after 10 minutes inactivity
- Every action is logged to `audit.log`

---

## Real-Time Sync Details

### With WebSocket (Instant):
- Admin creates bill
- Flask sends WebSocket message to all connected browsers
- Staff's browser pops a toast notification
- Bill History auto-refreshes
- Zero delay

**To enable:** See `REAL_TIME_SYNC.md`

### Without WebSocket (Every 5 seconds):
- Staff's page auto-refreshes every 5 seconds
- Shows latest bills without manual refresh
- Works on all networks including Render

---

## File Sharing

Both laptops access the **same** `store_bills.xlsx` file:

```
Admin Laptop
    ↓
  store_bills.xlsx
    ↑
Staff Laptop (via Flask server)
```

When Admin saves a bill → Excel file updates → Staff queries same file.

⚠️ **Excel concurrency note:** If both write at the exact same time, last one wins. This is rare. If you need true concurrent multi-user, switch to a SQL database (PostgreSQL).

---

## Scale Up Later

If you grow to 3+ users:

1. **SQL Database** (PostgreSQL)
   - Replace Excel with proper database
   - True concurrent edits
   - Better security
   - More complex setup

2. **Multiple Servers**
   - Load balancer (nginx)
   - Database replicas
   - Auto-scaling

For now, 2 users + Excel works great.

---

## Upgrade Checklist

When you're ready for production:

- [ ] Change default passwords (`admin` / `staff`)
- [ ] Enable HTTPS (buy SSL cert or use free Let's Encrypt)
- [ ] Deploy to cloud (Render, AWS, Heroku, DigitalOcean)
- [ ] Set strong `SECRET_KEY` environment variable
- [ ] Review `audit.log` regularly
- [ ] Backup `store_bills.xlsx` daily
- [ ] Add database user accounts (Admin + Staff locked to those users)

---

## Support

**Works but confused?** Check these files:
- `NETWORK_SETUP.md` — Detailed network options
- `REAL_TIME_SYNC.md` — WebSocket setup
- `README.md` — General features + security

