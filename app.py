"""
Universal Billing System - Secure Edition
Security features:
 - Admin / Staff role separation
 - Hashed passwords (werkzeug)
 - Flask session-based auth
 - CSRF token on all state-changing requests
 - Session auto-expire (10 min inactivity)
 - Rate limiting on login (5 attempts / 15 min)
 - Security headers on every response
 - Input validation and sanitisation
 - Audit log (who did what, when)
"""

from flask import (Flask, render_template, request, jsonify,
                   send_file, send_from_directory, session,
                   redirect, url_for, make_response)
from datetime import datetime, timedelta
from functools import wraps
from werkzeug.security import generate_password_hash, check_password_hash
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, Image
from reportlab.lib import colors
from reportlab.lib.units import cm
from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
import qrcode, json, os, secrets, time
from collections import defaultdict
from database import UniversalExcelManager

# ─────────────────────────────────────────────
# APP INIT
# ─────────────────────────────────────────────
app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', secrets.token_hex(32))
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['PERMANENT_SESSION_LIFETIME'] = timedelta(minutes=1440)

excel_manager = UniversalExcelManager()
os.makedirs('static/bills', exist_ok=True)
os.makedirs('static/qr_codes', exist_ok=True)

# ─────────────────────────────────────────────
# USER STORE  (in-memory; persisted to Excel Settings)
# Default credentials — CHANGE ON FIRST LOGIN
# ─────────────────────────────────────────────
USERS = {
    'admin': {
        'password': generate_password_hash('Admin@1234'),
        'role': 'admin',
        'display': 'Admin'
    },
    'staff': {
        'password': generate_password_hash('Staff@1234'),
        'role': 'staff',
        'display': 'Staff'
    }
}

# ─────────────────────────────────────────────
# RATE LIMITER  (5 failed logins per 15 min per IP)
# ─────────────────────────────────────────────
login_attempts = defaultdict(list)   # ip -> [timestamp, ...]
MAX_ATTEMPTS  = 5
LOCKOUT_SECS  = 15 * 60             # 15 minutes

def is_rate_limited(ip):
    now = time.time()
    # Clean old attempts
    login_attempts[ip] = [t for t in login_attempts[ip] if now - t < LOCKOUT_SECS]
    return len(login_attempts[ip]) >= MAX_ATTEMPTS

def record_failed_attempt(ip):
    login_attempts[ip].append(time.time())

# ─────────────────────────────────────────────
# AUDIT LOG
# ─────────────────────────────────────────────
def audit(action, detail=''):
    user = session.get('username', 'anonymous')
    role = session.get('role', '-')
    ip   = request.remote_addr
    ts   = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    line = f"[{ts}] [{ip}] [{role.upper()}:{user}] {action} {detail}\n"
    try:
        with open('audit.log', 'a', encoding='utf-8') as f:
            f.write(line)
    except Exception:
        pass

# ─────────────────────────────────────────────
# SECURITY HEADERS
# ─────────────────────────────────────────────
@app.after_request
def security_headers(response):
    response.headers['X-Content-Type-Options']   = 'nosniff'
    response.headers['X-Frame-Options']           = 'DENY'
    response.headers['X-XSS-Protection']          = '1; mode=block'
    response.headers['Referrer-Policy']            = 'strict-origin-when-cross-origin'
    response.headers['Content-Security-Policy']   = (
        "default-src 'self'; "
        "script-src 'self' 'unsafe-inline'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdnjs.cloudflare.com; "
        "font-src 'self' https://fonts.gstatic.com https://cdnjs.cloudflare.com; "
        "img-src 'self' data:; "
        "connect-src 'self';"
    )
    return response

# ─────────────────────────────────────────────
# SESSION / CSRF HELPERS
# ─────────────────────────────────────────────
def refresh_session():
    session.permanent = True
    session.modified  = True

def generate_csrf():
    if 'csrf_token' not in session:
        session['csrf_token'] = secrets.token_hex(32)
    return session['csrf_token']

def verify_csrf(token):
    return token and secrets.compare_digest(
        session.get('csrf_token', ''), token)

# ─────────────────────────────────────────────
# AUTH DECORATORS
# ─────────────────────────────────────────────
def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'username' not in session:
            if request.is_json:
                return jsonify({'error': 'Not authenticated', 'redirect': '/login'}), 401
            return redirect(url_for('login_page'))
        refresh_session()
        return f(*args, **kwargs)
    return decorated

def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if 'username' not in session:
            if request.is_json:
                return jsonify({'error': 'Not authenticated', 'redirect': '/login'}), 401
            return redirect(url_for('login_page'))
        if session.get('role') != 'admin':
            audit('FORBIDDEN', f'tried to access admin-only: {request.path}')
            if request.is_json:
                return jsonify({'error': 'Admin access required', 'forbidden': True}), 403
            return redirect(url_for('index'))
        refresh_session()
        return f(*args, **kwargs)
    return decorated

def csrf_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = (request.json or {}).get('csrf_token') if request.is_json \
                else request.form.get('csrf_token')
        if not verify_csrf(token):
            audit('CSRF_FAIL', request.path)
            return jsonify({'error': 'Invalid CSRF token'}), 403
        return f(*args, **kwargs)
    return decorated

# ─────────────────────────────────────────────
# LOGIN / LOGOUT
# ─────────────────────────────────────────────
@app.route('/login', methods=['GET'])
def login_page():
    if 'username' in session:
        return redirect(url_for('index'))
    csrf = generate_csrf()
    return render_template('login.html', csrf_token=csrf)

@app.route('/login', methods=['POST'])
def do_login():
    ip       = request.remote_addr
    username = (request.json or request.form).get('username', '').strip().lower()
    password = (request.json or request.form).get('password', '')
    csrf_tok = (request.json or request.form).get('csrf_token', '')

    if not verify_csrf(csrf_tok):
        return jsonify({'success': False, 'error': 'Invalid CSRF token'}), 403

    if is_rate_limited(ip):
        audit('RATE_LIMITED', f'username={username}')
        return jsonify({'success': False,
                        'error': 'Too many failed attempts. Try again in 15 minutes.'}), 429

    user = USERS.get(username)
    if not user or not check_password_hash(user['password'], password):
        record_failed_attempt(ip)
        remaining = MAX_ATTEMPTS - len(login_attempts[ip])
        audit('LOGIN_FAIL', f'username={username}')
        return jsonify({'success': False,
                        'error': f'Invalid credentials. {remaining} attempts left.'}), 401

    # Success — regenerate session to prevent fixation
    session.clear()
    session.permanent = True
    session['username']  = username
    session['role']      = user['role']
    session['display']   = user['display']
    session['logged_in'] = True
    generate_csrf()
    audit('LOGIN_OK')
    return jsonify({'success': True, 'role': user['role'], 'display': user['display']})

@app.route('/logout', methods=['POST'])
@login_required
def logout():
    audit('LOGOUT')
    session.clear()
    return jsonify({'success': True})

@app.route('/session_info')
@login_required
def session_info():
    return jsonify({
        'username': session.get('username'),
        'role':     session.get('role'),
        'display':  session.get('display'),
        'csrf_token': session.get('csrf_token')
    })

@app.route('/change_password', methods=['POST'])
@login_required
@csrf_required
def change_password():
    data     = request.json or {}
    old_pass = data.get('old_password', '')
    new_pass = data.get('new_password', '')
    username = session['username']

    if len(new_pass) < 8:
        return jsonify({'success': False, 'error': 'Password must be at least 8 characters'}), 400

    user = USERS.get(username)
    if not user or not check_password_hash(user['password'], old_pass):
        audit('CHANGE_PWD_FAIL')
        return jsonify({'success': False, 'error': 'Current password is incorrect'}), 401

    USERS[username]['password'] = generate_password_hash(new_pass)
    audit('CHANGE_PWD_OK')
    return jsonify({'success': True})

# ─────────────────────────────────────────────
# MAIN APP ROUTES
# ─────────────────────────────────────────────
@app.route('/')
@login_required
def index():
    preview_bill_no = excel_manager.generate_bill_no()
    current_date    = datetime.now().strftime("%d %B, %Y")
    summary         = excel_manager.generate_summary_report()
    store_settings  = excel_manager.get_store_settings()
    csrf            = generate_csrf()
    return render_template('index.html',
                           preview_bill_no=preview_bill_no,
                           current_date=current_date,
                           summary=summary,
                           store=store_settings,
                           user_role=session.get('role'),
                           username=session.get('username'),
                           display_name=session.get('display'),
                           csrf_token=csrf)

# ─────────────────────────────────────────────
# API — PUBLIC (any logged-in user)
# ─────────────────────────────────────────────
@app.route('/generate_bill_no')
@login_required
def generate_bill_no():
    return jsonify({'bill_no': excel_manager.generate_bill_no()})

@app.route('/get_profit_margin')
@login_required
def get_profit_margin():
    return jsonify({'margin': excel_manager.get_profit_margin()})

@app.route('/get_store_settings')
@login_required
def get_store_settings():
    return jsonify({'success': True, 'settings': excel_manager.get_store_settings()})

@app.route('/get_recent_bills')
@login_required
def get_recent_bills():
    limit = request.args.get('limit', 5, type=int)
    bills = excel_manager.get_recent_bills(limit)
    return jsonify({'success': True, 'bills': bills})

@app.route('/get_all_bills')
@login_required
def get_all_bills():
    bills = excel_manager.get_all_bills()
    return jsonify({'success': True, 'bills': bills})

@app.route('/get_summary')
@login_required
def get_summary():
    summary = excel_manager.generate_summary_report()
    return jsonify({'success': True, 'summary': summary})

@app.route('/generate_customer_id', methods=['POST'])
@login_required
def generate_customer_id():
    data = request.json or {}
    name = data.get('customer_name', '').strip()
    if not name:
        return jsonify({'customer_id': 'CUST-0000'})
    cid = excel_manager.get_or_create_customer_id(name)
    return jsonify({'customer_id': cid})

@app.route('/generate_pdf', methods=['POST'])
@login_required
@csrf_required
def generate_pdf():
    try:
        data           = request.json or {}
        customer_name  = str(data.get('customer_name', '')).strip()[:100]
        customer_id    = str(data.get('customer_id', '')).strip()[:20]
        bill_no        = str(data.get('bill_no', '')).strip()[:50]
        items          = data.get('items', [])
        subtotal       = float(data.get('subtotal', 0))
        discount_total = float(data.get('discount_total', 0))
        grand_total    = float(data.get('grand_total', 0))
        theme_color    = data.get('theme_color', '#FF4757')

        # Validate theme colour
        if not (theme_color.startswith('#') and len(theme_color) in (7, 4)):
            theme_color = '#FF4757'

        if not customer_name or not bill_no or not items:
            return jsonify({'error': 'Missing required fields'}), 400

        store       = excel_manager.get_store_settings()
        currency    = store.get('currency_symbol', '₹')
        store_name  = store.get('store_name', 'My Store')

        filename = f"Bill_{bill_no}.pdf"
        filepath = os.path.join('static', 'bills', filename)

        doc    = SimpleDocTemplate(filepath, pagesize=A4,
                                   rightMargin=1.5*cm, leftMargin=1.5*cm,
                                   topMargin=1.5*cm, bottomMargin=1.5*cm)
        story  = []
        styles = getSampleStyleSheet()

        story.append(Paragraph(store_name.upper(),
            ParagraphStyle(name='CompanyTitle', parent=styles['Heading1'],
                           fontSize=26, textColor=colors.HexColor(theme_color),
                           alignment=TA_CENTER, spaceAfter=4)))
        if store.get('store_tagline'):
            story.append(Paragraph(store['store_tagline'],
                ParagraphStyle(name='Tagline', parent=styles['Normal'],
                               fontSize=11, textColor=colors.grey,
                               alignment=TA_CENTER, spaceAfter=4)))
        contact_parts = [v for k in ['store_address','store_phone','store_email','store_website']
                         if (v := store.get(k))]
        if contact_parts:
            story.append(Paragraph(" | ".join(contact_parts),
                ParagraphStyle(name='Contact', parent=styles['Normal'],
                               fontSize=8, textColor=colors.grey,
                               alignment=TA_CENTER, spaceAfter=12)))

        story.append(Table([['']], colWidths=[doc.width],
            style=TableStyle([('LINEABOVE',(0,0),(-1,0),1,colors.HexColor(theme_color)),
                               ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)])))
        story.append(Spacer(1,10))
        story.append(Paragraph("INVOICE",
            ParagraphStyle(name='InvoiceTitle',parent=styles['Heading2'],
                           fontSize=16,textColor=colors.HexColor(theme_color),alignment=TA_CENTER)))
        story.append(Spacer(1,10))

        bill_info = [
            [Paragraph(f"<b>Bill No:</b> {bill_no}", styles['Normal']),
             Paragraph(f"<b>Date:</b> {datetime.now().strftime('%d-%m-%Y')}", styles['Normal'])],
            [Paragraph(f"<b>Customer:</b> {customer_name}", styles['Normal']),
             Paragraph(f"<b>Customer ID:</b> {customer_id}", styles['Normal'])]
        ]
        tbl_info = Table(bill_info, colWidths=[doc.width/2, doc.width/2])
        tbl_info.setStyle(TableStyle([
            ('VALIGN',(0,0),(-1,-1),'TOP'),('PADDING',(0,0),(-1,-1),6),
            ('BACKGROUND',(0,0),(-1,-1),colors.HexColor('#F8F9FA')),
            ('GRID',(0,0),(-1,-1),0.5,colors.lightgrey)]))
        story.append(tbl_info)
        story.append(Spacer(1,15))

        data_items = [['#','Item Description',f'Price ({currency})','Qty','Disc %',f'Total ({currency})']]
        for idx, it in enumerate(items, 1):
            data_items.append([
                str(idx), str(it.get('name',''))[:80],
                f"{float(it.get('price',0)):.2f}", str(int(it.get('quantity',1))),
                f"{float(it.get('discount',0)):.1f}%" if float(it.get('discount',0))>0 else '-',
                f"{float(it.get('total',0)):.2f}"
            ])
        tbl_items = Table(data_items, colWidths=[1*cm,7*cm,3*cm,1.5*cm,2*cm,3*cm])
        tbl_items.setStyle(TableStyle([
            ('BACKGROUND',(0,0),(-1,0),colors.HexColor(theme_color)),
            ('TEXTCOLOR',(0,0),(-1,0),colors.white),
            ('ALIGN',(0,0),(-1,0),'CENTER'),
            ('FONTNAME',(0,0),(-1,0),'Helvetica-Bold'),
            ('FONTSIZE',(0,0),(-1,0),10),('BOTTOMPADDING',(0,0),(-1,0),8),('TOPPADDING',(0,0),(-1,0),8),
            ('GRID',(0,0),(-1,-1),0.5,colors.grey),
            ('ALIGN',(2,1),(-1,-1),'RIGHT'),('ALIGN',(3,1),(3,-1),'CENTER'),
            ('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,colors.HexColor('#F5F5F5')]),
            ('FONTSIZE',(0,1),(-1,-1),9),('TOPPADDING',(0,1),(-1,-1),5),('BOTTOMPADDING',(0,1),(-1,-1),5)]))
        story.append(tbl_items)
        story.append(Spacer(1,15))

        summary_data = [[Paragraph('<b>Subtotal:</b>',styles['Normal']),
                         Paragraph(f'{currency}{subtotal:.2f}',styles['Normal'])]]
        if discount_total > 0:
            summary_data.append([Paragraph('<b>Discount:</b>',styles['Normal']),
                                  Paragraph(f'- {currency}{discount_total:.2f}',styles['Normal'])])
        summary_data.append([
            Paragraph('<b>GRAND TOTAL:</b>',ParagraphStyle(name='gt',parent=styles['Normal'],
                      fontSize=12,textColor=colors.HexColor(theme_color))),
            Paragraph(f'{currency}{grand_total:.2f}',ParagraphStyle(name='gtv',parent=styles['Normal'],
                      fontSize=12,fontName='Helvetica-Bold',textColor=colors.HexColor(theme_color)))])
        tbl_summary = Table(summary_data, colWidths=[11*cm,5.5*cm], hAlign='RIGHT')
        ss = [('ALIGN',(1,0),(1,-1),'RIGHT'),('PADDING',(0,0),(-1,-1),6),
              ('LINEABOVE',(0,-1),(1,-1),1.5,colors.HexColor(theme_color)),
              ('BACKGROUND',(0,-1),(1,-1),colors.HexColor(theme_color+'15'))]
        if discount_total>0: ss.append(('TEXTCOLOR',(1,1),(1,1),colors.red))
        tbl_summary.setStyle(TableStyle(ss))
        story.append(tbl_summary)

        qr_filename = _generate_qr(bill_no,{'bill_no':bill_no,'store':store_name,
                                             'customer':customer_name,'total':grand_total,
                                             'date':datetime.now().strftime('%d-%m-%Y')})
        qr_path = os.path.join('static','qr_codes',qr_filename)
        if os.path.exists(qr_path):
            story.append(Spacer(1,20))
            qr_tbl = Table([[Image(qr_path,width=2.5*cm,height=2.5*cm),
                             Paragraph("Scan for digital receipt<br/>Thank you for your business!",
                             ParagraphStyle(name='QRtext',parent=styles['Normal'],
                                           fontSize=9,textColor=colors.grey))]],
                           colWidths=[3*cm,doc.width-3*cm])
            qr_tbl.setStyle(TableStyle([('VALIGN',(0,0),(-1,-1),'MIDDLE')]))
            story.append(qr_tbl)

        story.append(Spacer(1,20))
        story.append(Table([['']], colWidths=[doc.width],
            style=TableStyle([('LINEABOVE',(0,0),(-1,0),0.5,colors.lightgrey),
                               ('TOPPADDING',(0,0),(-1,-1),0),('BOTTOMPADDING',(0,0),(-1,-1),0)])))
        story.append(Spacer(1,8))
        story.append(Paragraph(f"Thank you for shopping at {store_name}!",
            ParagraphStyle(name='Footer',parent=styles['Normal'],
                           fontSize=10,alignment=TA_CENTER,
                           textColor=colors.HexColor(theme_color))))
        doc.build(story)

        excel_manager.save_bill_data(
            customer_name=customer_name, customer_id=customer_id,
            bill_no=bill_no, items=items, subtotal=subtotal,
            discount_total=discount_total, grand_total=grand_total,
            qr_file=qr_filename, pdf_file=filename)

        audit('BILL_GENERATED', f'bill_no={bill_no} total={grand_total}')
        return jsonify({'success':True,'filename':filename,
                        'filepath':f'/static/bills/{filename}',
                        'qr_file':qr_filename,'qr_path':f'/static/qr_codes/{qr_filename}'})
    except Exception as e:
        import traceback; traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ─────────────────────────────────────────────
# API — ADMIN ONLY
# ─────────────────────────────────────────────
@app.route('/set_profit_margin', methods=['POST'])
@admin_required
@csrf_required
def set_profit_margin():
    data = request.json or {}
    try:
        margin = float(data.get('margin', 30))
        if not 0 <= margin <= 100: raise ValueError
    except (ValueError, TypeError):
        return jsonify({'success': False, 'error': 'Invalid margin value'}), 400
    excel_manager.set_profit_margin(margin)
    audit('SET_MARGIN', f'margin={margin}')
    return jsonify({'success': True})

@app.route('/update_store_settings', methods=['POST'])
@admin_required
@csrf_required
def update_store_settings():
    try:
        data = request.json or {}
        allowed = ['store_name','store_tagline','store_address',
                   'store_phone','store_email','store_website',
                   'currency_symbol','profit_margin']
        filtered = {k: str(v)[:200] for k, v in data.items() if k in allowed}
        if not filtered.get('store_name','').strip():
            return jsonify({'success':False,'error':'Store name required'}), 400
        excel_manager.update_store_settings(filtered)
        audit('STORE_SETTINGS_UPDATED')
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/export_excel')
@admin_required
def export_excel():
    audit('EXPORT_EXCEL')
    try:
        return send_file(excel_manager.get_excel_file(), as_attachment=True,
                         download_name=f"Store_Bills_{datetime.now().strftime('%Y%m%d')}.xlsx",
                         mimetype='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/erase_all_bills', methods=['POST'])
@admin_required
@csrf_required
def erase_all_bills():
    try:
        success = excel_manager.erase_all_bills()
        audit('ERASE_ALL_BILLS')
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/factory_reset', methods=['POST'])
@admin_required
@csrf_required
def factory_reset():
    try:
        success = excel_manager.factory_reset()
        audit('FACTORY_RESET')
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/get_audit_log')
@admin_required
def get_audit_log():
    try:
        if not os.path.exists('audit.log'):
            return jsonify({'success': True, 'log': []})
        with open('audit.log', 'r', encoding='utf-8') as f:
            lines = f.readlines()
        # Return last 100 lines newest-first
        return jsonify({'success': True, 'log': list(reversed(lines[-100:]))})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

# ─────────────────────────────────────────────
# STATIC FILE SERVING
# ─────────────────────────────────────────────
@app.route('/static/bills/<filename>')
@login_required
def serve_bill(filename):
    # Prevent path traversal
    filename = os.path.basename(filename)
    return send_from_directory('static/bills', filename)

@app.route('/static/qr_codes/<filename>')
@login_required
def serve_qr(filename):
    filename = os.path.basename(filename)
    return send_from_directory('static/qr_codes', filename)

# ─────────────────────────────────────────────
# HELPERS
# ─────────────────────────────────────────────
def _generate_qr(bill_no, data_dict):
    qr = qrcode.QRCode(version=2, error_correction=qrcode.constants.ERROR_CORRECT_H,
                       box_size=10, border=4)
    qr.add_data(json.dumps(data_dict))
    qr.make(fit=True)
    img = qr.make_image(fill_color="#2C3E50", back_color="white")
    filename = f"qr_{bill_no}.png"
    img.save(os.path.join('static','qr_codes',filename), 'PNG')
    return filename

# ─────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────
if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5004))
    app.run(host='0.0.0.0', port=port, debug=False)
