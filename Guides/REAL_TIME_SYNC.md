# Real-Time Sync Between Admin & Staff — WebSocket Implementation

When Admin creates a bill, Staff's screen updates instantly (without manual refresh).

## How It Works

We'll use **Flask-SocketIO** (WebSocket):
- Admin laptop creates bill → Python emits event → Staff's browser gets real-time notification
- No polling, no delay, instant sync

---

## Step 1: Install WebSocket Library

```bash
pip install flask-socketio python-socketio python-engineio
```

Add to `requirements.txt`:
```
flask-socketio==5.3.5
python-socketio==5.9.0
python-engineio==4.8.0
```

---

## Step 2: Update app.py

Replace the last part of `app.py` with:

```python
from flask_socketio import SocketIO, emit, join_room, leave_room

# After app creation:
socketio = SocketIO(app, cors_allowed_origins="*")

# At the end, replace the old app.run() with:

@socketio.on('connect')
def handle_connect():
    username = session.get('username', 'unknown')
    print(f"User connected: {username}")
    emit('notification', {'msg': f'{username} is online', 'type': 'user_join'})

@socketio.on('disconnect')
def handle_disconnect():
    username = session.get('username', 'unknown')
    print(f"User disconnected: {username}")
    emit('notification', {'msg': f'{username} went offline', 'type': 'user_leave'}, broadcast=True)

# Broadcast bill creation to all connected users
def notify_bill_created(bill_no, customer, total):
    socketio.emit('bill_created', {
        'bill_no': bill_no,
        'customer': customer,
        'total': total,
        'timestamp': datetime.now().isoformat()
    }, broadcast=True)

# In your @app.route('/generate_pdf', ...) after saving bill:
# Add this line after excel_manager.save_bill_data(...):
notify_bill_created(bill_no, customer_name, grand_total)

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5004))
    socketio.run(app, host='0.0.0.0', port=port, debug=False)
```

---

## Step 3: Update static/js/script.js

At the top of the `UniversalBilling` class constructor, add:

```javascript
// WebSocket for real-time sync
this.initWebSocket();
```

Add this method to the class:

```javascript
initWebSocket() {
    try {
        const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.socket = io(undefined, {
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5
        });

        // Listen for bill created event
        this.socket.on('bill_created', (data) => {
            this.showToast(`Bill created: ${data.bill_no} (${data.customer})`, 'success');
            // Auto-refresh if on history page
            if (this.currentPage === 'history') this.loadHistory();
            if (this.currentPage === 'home') this.loadSummary();
        });

        // Listen for user online/offline
        this.socket.on('notification', (data) => {
            console.log(`[${data.type}] ${data.msg}`);
        });

        this.socket.on('connect', () => {
            console.log('WebSocket connected');
            this.showToast('Connected to server', 'success');
        });

        this.socket.on('disconnect', () => {
            console.log('WebSocket disconnected');
            this.showToast('Disconnected. Retrying...', 'warning');
        });

        this.socket.on('connect_error', (error) => {
            console.error('WebSocket error:', error);
        });
    } catch(e) {
        console.log('WebSocket not available (local mode)', e);
    }
}
```

---

## Step 4: Add Socket.IO Client Library to index.html

In `<head>` of templates/index.html, add:

```html
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
```

---

## Step 5: Update generatePDF Function

In script.js, in the `generatePDF()` method, after getting success response:

```javascript
// Existing code:
if (data.success) {
    this.showToast('Bill generated! Downloading…', 'success');
    window.open(data.filepath, '_blank');
    
    // NEW: Notify other users via WebSocket
    if (this.socket && this.socket.connected) {
        this.socket.emit('bill_created', {
            bill_no: billNo,
            customer: customerName,
            total: grand
        });
    }
    
    this.clearBill();
    this.loadSummary();
}
```

---

## Test It

### Terminal 1 (Admin Laptop):
```bash
python run_app.py
```

### Browser 1 (Admin, same computer):
- Go to `http://localhost:5004`
- Log in as `admin`
- Create a test bill
- Keep this window open

### Browser 2 (Staff, same or different computer):
- Go to `http://192.168.1.105:5004` (Admin's IP)
- Log in as `staff`
- Watch for real-time toast notification when Admin creates bill
- Bill History updates instantly

---

## What Happens

1. **Admin** fills form, clicks "Generate Bill"
2. **Flask** creates PDF, saves to Excel, sends WebSocket event
3. **Staff's browser** receives WebSocket message instantly
4. **Toast notification** appears: "Bill created: BILL-20240422-0001 (John)"
5. If Staff is on History page, it auto-refreshes
6. Both see the same data in real-time

---

## Advanced: Notify on Settings Changes

You can also broadcast when Admin changes settings:

```python
@app.route('/update_store_settings', methods=['POST'])
@admin_required
@csrf_required
def update_store_settings():
    # ... existing code ...
    
    # Add this:
    socketio.emit('settings_updated', {
        'timestamp': datetime.now().isoformat()
    }, broadcast=True)
    
    return jsonify({'success': True})
```

Then in script.js:

```javascript
this.socket.on('settings_updated', (data) => {
    this.loadSummary();
    this.showToast('Store settings updated by Admin', 'info');
});
```

---

## Troubleshooting

| Issue | Fix |
|---|---|
| "ModuleNotFoundError: No module named 'socketio'" | Run `pip install flask-socketio` |
| WebSocket connects but no events | Check browser console for errors |
| Toast appears twice | Remove duplicate emit (client + server) |
| Works locally but not on network | Render.com free tier has WebSocket limitations; use paid tier or local network |

---

## For Render.com Deployment

WebSocket on free Render tier is limited. For production:

1. **Upgrade Render to paid** ($7-12/month)
2. Or **use Render + Redis for pub/sub** (more complex)
3. Or **use Pusher.com** (third-party WebSocket service)

For now, stick with **local network** for real-time, or **poll every 5 seconds** on Render free tier.

---

## Fallback: Polling (No WebSocket)

If WebSocket doesn't work, use polling instead (less efficient but works everywhere):

```javascript
// In initWebSocket() if socket fails:
setInterval(() => {
    if (this.currentPage === 'history') this.loadHistory();
    if (this.currentPage === 'home') this.loadSummary();
}, 5000); // Check every 5 seconds
```

This way, Staff's page updates every 5 seconds even without WebSocket.

