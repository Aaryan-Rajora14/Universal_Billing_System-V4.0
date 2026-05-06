'use strict';

class UniversalBilling {
    constructor() {
        this.items          = [];
        this.currentBillNo  = '';
        this.currentPage    = 'home';
        this.customerId     = '';
        this.currency       = window.STORE_SETTINGS?.currency || '₹';
        this.allBills       = [];
        this.role           = window.USER_ROLE || 'staff';
        this.csrf           = window.CSRF_TOKEN || '';
        this.sessionSecs    = window.SESSION_SECS || 600;
        this.sessionLeft    = this.sessionSecs;
        this.sessionTimer   = null;
        this.currentTheme   = localStorage.getItem('ubs_theme') || 'red';
        this.init();
    }

    // ─────────────────────────────────────
    // INIT
    // ─────────────────────────────────────
    init() {
        try {
            this.applyTheme(this.currentTheme);
            this.updateDateTime();
            setInterval(() => this.updateDateTime(), 1000);
            this.startSessionTimer();
            this.bindEvents();
            this.loadFromStorage();
            this.loadSummary();
            this.syncCurrencyLabel();
            // Restore desktop sidebar state
            if (!this.isMobile() && localStorage.getItem('ubs_sb_closed') === 'true') {
                document.querySelector('.app')?.classList.add('sb-closed');
            }
        } catch(e) { console.error('Init error:', e); }
    }

    // ─────────────────────────────────────
    // SESSION TIMER (10 min auto-expire)
    // ─────────────────────────────────────
    startSessionTimer() {
        this.sessionLeft = this.sessionSecs;
        clearInterval(this.sessionTimer);
        this.sessionTimer = setInterval(() => this.tickSession(), 1000);
    }

    tickSession() {
        this.sessionLeft--;
        const el = document.getElementById('sessionTimer');
        if (!el) return;
        const m = Math.floor(this.sessionLeft / 60);
        const s = this.sessionLeft % 60;
        el.textContent = `${m}:${s.toString().padStart(2,'0')}`;
        el.className = 'session-timer' +
            (this.sessionLeft <= 60 ? ' danger' : this.sessionLeft <= 180 ? ' warn' : '');
        if (this.sessionLeft <= 0) {
            clearInterval(this.sessionTimer);
            this.showSessionExpired();
        }
    }

    // Any user activity resets the timer
    resetSessionTimer() {
        this.startSessionTimer();
        // Also ping server to refresh the server-side session
        fetch('/session_info').catch(() => {});
    }

    manualRefresh() {
        this.resetSessionTimer();
        this.loadSummary();
        if (this.currentPage === 'history') this.loadHistory();
        if (this.currentPage === 'data')    this.loadStorageInfo();
        this.showToast('Refreshed ✓', 'success');
    }

    showSessionExpired() {
        const ov = document.getElementById('sessionExpiredOverlay');
        if (ov) ov.classList.add('show');
    }

    // ─────────────────────────────────────
    // LOGOUT
    // ─────────────────────────────────────
    async doLogout() {
        try {
            await fetch('/logout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ csrf_token: this.csrf })
            });
        } catch(e) {}
        window.location.href = '/login';
    }

    // ─────────────────────────────────────
    // USER MENU
    // ─────────────────────────────────────
    openUserMenu() {
        const m = document.getElementById('userMenu');
        if (m) m.style.display = m.style.display === 'none' ? 'block' : 'none';
    }
    closeUserMenu() {
        const m = document.getElementById('userMenu');
        if (m) m.style.display = 'none';
    }

    // ─────────────────────────────────────
    // MOBILE / SIDEBAR
    // ─────────────────────────────────────
    isMobile() { return window.innerWidth <= 768; }

    toggleSidebar() {
        if (this.isMobile()) {
            const sb = document.querySelector('.sidebar');
            const ov = document.getElementById('sidebarOverlay');
            const open = sb.classList.toggle('sb-open');
            if (ov) ov.classList.toggle('active', open);
        } else {
            const app  = document.querySelector('.app');
            const closed = app.classList.toggle('sb-closed');
            localStorage.setItem('ubs_sb_closed', closed);
        }
    }

    closeMobileSidebar() {
        document.querySelector('.sidebar')?.classList.remove('sb-open');
        document.getElementById('sidebarOverlay')?.classList.remove('active');
    }

    // ─────────────────────────────────────
    // EVENT BINDING
    // ─────────────────────────────────────
    bindEvents() {
        // Reset timer on any interaction
        ['click','keydown','touchstart','mousemove'].forEach(ev =>
            document.addEventListener(ev, () => this.resetSessionTimer(), { passive: true }));

        // Sidebar
        this.bindById('sidebarToggle', () => this.toggleSidebar());
        document.getElementById('sidebarOverlay')
            ?.addEventListener('click', () => this.closeMobileSidebar());

        // Close user menu on outside click
        document.addEventListener('click', e => {
            if (!e.target.closest('#userMenu') && !e.target.closest('[onclick="UB.openUserMenu()"]'))
                this.closeUserMenu();
        });

        // Navigation — sidebar
        document.querySelectorAll('.nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const page = e.currentTarget.dataset.page;
                if (page) { this.switchPage(page); if (this.isMobile()) this.closeMobileSidebar(); }
            });
        });

        // Navigation — bottom nav
        document.querySelectorAll('.bottom-nav-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                const page = e.currentTarget.dataset.page;
                if (!page) return;
                this.switchPage(page);
                document.querySelectorAll('.bottom-nav-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
            });
        });

        // Resize
        window.addEventListener('resize', () => {
            if (!this.isMobile()) this.closeMobileSidebar();
        });

        // Theme
        document.querySelectorAll('.theme-btn').forEach(btn =>
            btn.addEventListener('click', e => this.applyTheme(e.currentTarget.dataset.theme)));

        // Billing
        this.bindById('addItemBtn',      () => this.addItem());
        this.bindById('clearBillBtn',    () => this.clearBill());
        this.bindById('generatePdfBtn',  () => this.generatePDF());
        this.bindById('refreshBillNo',   () => this.generateNewBillNo());

        // Enter on product fields
        ['productName','productPrice','productQuantity','productDiscount'].forEach(id => {
            document.getElementById(id)?.addEventListener('keypress', e => {
                if (e.key === 'Enter') this.addItem();
            });
        });

        // Customer
        const cn = document.getElementById('customerName');
        if (cn) {
            cn.addEventListener('blur',  () => this.generateCustomerId());
            cn.addEventListener('input', e => {
                const el = document.getElementById('previewCustomer');
                if (el) el.innerText = e.target.value.trim() || 'Not specified';
            });
        }

        // History
        this.bindById('applyFilterBtn',  () => this.applyFilters());
        this.bindById('clearFilterBtn',  () => this.clearFilters());
        this.bindById('refreshHistoryBtn', () => this.loadHistory());

        // Data (admin)
        this.bindById('exportExcelBtn',        () => this.exportExcel());
        this.bindById('exportExcelHistoryBtn', () => this.exportExcel());
        this.bindById('viewDatabaseBtn',       () => this.openDatabaseModal());
        this.bindById('viewAuditBtn',          () => this.openAuditModal());
        this.bindById('updateProfitMarginBtn', () => this.updateProfitMargin());

        // Settings
        this.bindById('saveStoreSettingsBtn', () => this.saveStoreSettings());
        this.bindById('changePasswordBtn',    () => this.changePassword());
        this.bindById('eraseBillsBtn',        () => this.eraseAllBills());
        this.bindById('factoryResetBtn',      () => this.factoryReset());

        // Modals
        this.bindById('closeModalBtn', () => {
            document.getElementById('dbModal').style.display = 'none';
        });
        document.getElementById('dbModal')?.addEventListener('click', e => {
            if (e.target === document.getElementById('dbModal'))
                document.getElementById('dbModal').style.display = 'none';
        });
    }

    bindById(id, fn) {
        document.getElementById(id)?.addEventListener('click', fn);
    }

    // ─────────────────────────────────────
    // PAGE NAVIGATION
    // ─────────────────────────────────────
    switchPage(page) {
        this.currentPage = page;
        document.querySelectorAll('.nav-btn').forEach(b => {
            b.classList.toggle('active', b.dataset.page === page);
        });
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById(`${page}Page`)?.classList.add('active');

        const icons = { home:'fa-home', history:'fa-history', data:'fa-database', settings:'fa-cog' };
        const labels= { home:'Dashboard', history:'Bill History', data:'Data Control', settings:'Settings' };
        const pi = document.getElementById('pageIcon');
        const pt = document.getElementById('pageTitle');
        if (pi) pi.className = `fas ${icons[page] || 'fa-circle'}`;
        if (pt) pt.textContent = labels[page] || page;

        if (page === 'history') this.loadHistory();
        if (page === 'data')    this.loadStorageInfo();
        if (page === 'settings') this.loadSettingsPage();

        document.querySelectorAll('.bottom-nav-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.page === page));
    }

    // ─────────────────────────────────────
    // THEME
    // ─────────────────────────────────────
    applyTheme(theme) {
        if (!theme) return;
        this.currentTheme = theme;
        localStorage.setItem('ubs_theme', theme);
        const body = document.body;
        ['red','blue','purple','orange','cyan','mint'].forEach(t => body.classList.remove(`theme-${t}`));
        body.classList.add(`theme-${theme}`);
        document.querySelectorAll('.theme-btn').forEach(b =>
            b.classList.toggle('active', b.dataset.theme === theme));
    }

    // ─────────────────────────────────────
    // DATE/TIME
    // ─────────────────────────────────────
    updateDateTime() {
        const el = document.getElementById('currentDateTime');
        if (el) el.textContent = new Date().toLocaleString('en-IN', {
            weekday:'short', year:'numeric', month:'short', day:'numeric',
            hour:'2-digit', minute:'2-digit'
        });
    }

    // ─────────────────────────────────────
    // BILLING
    // ─────────────────────────────────────
    addItem() {
        const name     = document.getElementById('productName')?.value.trim();
        const price    = parseFloat(document.getElementById('productPrice')?.value) || 0;
        const qty      = parseInt(document.getElementById('productQuantity')?.value) || 1;
        const discount = parseFloat(document.getElementById('productDiscount')?.value) || 0;

        if (!name)  return this.showToast('Enter item name', 'error');
        if (price <= 0) return this.showToast('Enter a valid price', 'error');

        const discountedPrice = price * (1 - discount / 100);
        const total = discountedPrice * qty;

        this.items.push({ name, price, quantity: qty, discount, total });
        this.updateBillDisplay();
        this.saveToStorage();

        // Clear fields
        ['productName','productPrice','productDiscount'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.value = id === 'productDiscount' ? '0' : '';
        });
        const pq = document.getElementById('productQuantity');
        if (pq) pq.value = '1';
        document.getElementById('productName')?.focus();
        this.showToast(`"${name}" added`, 'success');
    }

    updateBillDisplay() {
        const tbody = document.getElementById('billItemsList');
        if (!tbody) return;
        if (!this.items.length) {
            tbody.innerHTML = `<tr class="empty-row"><td colspan="7"><div class="empty-state"><i class="fas fa-shopping-basket"></i><p>No items added yet</p><small>Fill the form and click "Add Item"</small></div></td></tr>`;
        } else {
            tbody.innerHTML = this.items.map((it, i) => `
                <tr>
                    <td>${i+1}</td>
                    <td>${this.esc(it.name)}</td>
                    <td>${this.currency}${it.price.toFixed(2)}</td>
                    <td>${it.quantity}</td>
                    <td>${it.discount > 0 ? it.discount.toFixed(1)+'%' : '-'}</td>
                    <td><strong>${this.currency}${it.total.toFixed(2)}</strong></td>
                    <td><button class="delete-btn" onclick="UB.removeItem(${i})"><i class="fas fa-times"></i></button></td>
                </tr>`).join('');
        }
        const sub   = this.items.reduce((s,it) => s + it.price * it.quantity, 0);
        const disc  = this.items.reduce((s,it) => s + (it.price * it.quantity * it.discount/100), 0);
        const grand = sub - disc;
        this.setInner('summarySubtotal',  `${this.currency}${sub.toFixed(2)}`);
        this.setInner('summaryDiscount',  `${this.currency}${disc.toFixed(2)}`);
        this.setInner('summaryGrandTotal',`${this.currency}${grand.toFixed(2)}`);
        this.setInner('previewItemCount', this.items.length);
        const badge = document.getElementById('billStatusBadge');
        if (badge) { badge.textContent = this.items.length ? 'READY' : 'DRAFT'; badge.className = `status-badge ${this.items.length ? 'ready':'draft'}`; }
    }

    removeItem(idx) { this.items.splice(idx, 1); this.updateBillDisplay(); this.saveToStorage(); }

    clearBill() {
        if (this.items.length && !confirm('Clear all items?')) return;
        this.items = [];
        this.updateBillDisplay();
        this.saveToStorage();
        ['customerName','customerId'].forEach(id => { const el = document.getElementById(id); if(el) el.value=''; });
        this.generateNewBillNo();
    }

    async generateCustomerId() {
        const name = document.getElementById('customerName')?.value.trim();
        if (!name) return;
        try {
            const res  = await fetch('/generate_customer_id', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ customer_name: name })
            });
            const data = await res.json();
            if (data.customer_id) {
                const el = document.getElementById('customerId');
                if (el) el.value = data.customer_id;
                this.customerId = data.customer_id;
            }
        } catch(e) {}
    }

    async generateNewBillNo() {
        try {
            const res  = await fetch('/generate_bill_no');
            const data = await res.json();
            if (data.bill_no) {
                this.currentBillNo = data.bill_no;
                const bn = document.getElementById('billNo');
                const pb = document.getElementById('previewBillNo');
                if (bn) bn.value = data.bill_no;
                if (pb) pb.textContent = data.bill_no;
            }
        } catch(e) {}
    }

    async generatePDF() {
        const customerName = document.getElementById('customerName')?.value.trim();
        const billNo       = document.getElementById('billNo')?.value.trim();
        if (!customerName) return this.showToast('Enter customer name', 'error');
        if (!this.items.length) return this.showToast('Add at least one item', 'error');

        const sub   = this.items.reduce((s,it) => s + it.price * it.quantity, 0);
        const disc  = this.items.reduce((s,it) => s + it.price * it.quantity * it.discount/100, 0);
        const grand = sub - disc;
        const themeColors = { red:'#FF4757',blue:'#2E86DE',purple:'#9B59B6',orange:'#E67E22',cyan:'#00ACC1',mint:'#27AE60' };

        this.showToast('Generating bill…', 'info');
        try {
            const res  = await fetch('/generate_pdf', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({
                    customer_name: customerName, customer_id: this.customerId || 'CUST-0000',
                    bill_no: billNo, items: this.items,
                    subtotal: sub, discount_total: disc, grand_total: grand,
                    theme_color: themeColors[this.currentTheme] || '#FF4757',
                    csrf_token: this.csrf
                })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast('Bill generated! Downloading…', 'success');
                window.open(data.filepath, '_blank');
                this.clearBill();
                this.loadSummary();
            } else {
                this.showToast(data.error || 'Failed to generate bill', 'error');
            }
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    // ─────────────────────────────────────
    // SUMMARY / STATS
    // ─────────────────────────────────────
    async loadSummary() {
        try {
            const res  = await fetch('/get_summary');
            const data = await res.json();
            if (!data.success) return;
            const s = data.summary;
            this.setInner('totalBills',     s.total_bills);
            this.setInner('totalSales',     `${this.currency}${(s.total_sales||0).toFixed(2)}`);
            this.setInner('totalDiscounts', `${this.currency}${(s.total_discounts||0).toFixed(2)}`);
            this.setInner('totalProfit',    `${this.currency}${(s.total_profit||0).toFixed(2)}`);
            this.setInner('homeBadge',      s.total_bills);
            this.setInner('historyBadge',   s.total_bills);
        } catch(e) {}
    }

    // ─────────────────────────────────────
    // HISTORY
    // ─────────────────────────────────────
    async loadHistory() {
        const tbody = document.getElementById('historyTableBody');
        if (tbody) tbody.innerHTML = `<tr><td colspan="10" class="text-center"><i class="fas fa-spinner fa-spin"></i> Loading…</td></tr>`;
        try {
            const res  = await fetch('/get_all_bills');
            const data = await res.json();
            if (!data.success) return;
            this.allBills = data.bills;
            this.renderHistory(this.allBills);
        } catch(e) {}
    }

    renderHistory(bills) {
        const tbody = document.getElementById('historyTableBody');
        if (!tbody) return;
        this.setInner('historyCount', `${bills.length} bill${bills.length!==1?'s':''} shown`);
        if (!bills.length) {
            tbody.innerHTML = `<tr><td colspan="10" class="text-center" style="padding:24px;color:#95A5A6;">No bills found</td></tr>`;
            return;
        }
        tbody.innerHTML = bills.map((b,i) => `
            <tr>
                <td>${i+1}</td>
                <td><strong>${this.esc(b.bill_no||'')}</strong></td>
                <td>${this.esc(b.date||'')}</td>
                <td>${this.esc(b.customer_name||'')}</td>
                <td>${this.esc(b.customer_id||'')}</td>
                <td>${b.items_count||0}</td>
                <td>${this.currency}${(b.subtotal||0).toFixed(2)}</td>
                <td style="color:#e74c3c;">-${this.currency}${(b.discount||0).toFixed(2)}</td>
                <td><strong>${this.currency}${(b.total||0).toFixed(2)}</strong></td>
                <td>
                    ${b.pdf_file ? `<button class="action-btn" onclick="window.open('/static/bills/${this.esc(b.pdf_file)}','_blank')"><i class="fas fa-download"></i></button>` : ''}
                </td>
            </tr>`).join('');
    }

    applyFilters() {
        const from     = document.getElementById('filterDateFrom')?.value;
        const to       = document.getElementById('filterDateTo')?.value;
        const customer = (document.getElementById('filterCustomer')?.value||'').toLowerCase();
        const filtered = this.allBills.filter(b => {
            if (customer && !b.customer_name?.toLowerCase().includes(customer)) return false;
            return true;
        });
        this.renderHistory(filtered);
    }

    clearFilters() {
        ['filterDateFrom','filterDateTo','filterCustomer'].forEach(id => {
            const el = document.getElementById(id); if(el) el.value='';
        });
        this.renderHistory(this.allBills);
    }

    // ─────────────────────────────────────
    // DATA / EXPORT (admin only)
    // ─────────────────────────────────────
    exportExcel() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        window.location.href = '/export_excel';
        this.showToast('Excel download started', 'success');
    }

    async loadStorageInfo() {
        try {
            const res  = await fetch('/get_summary');
            const data = await res.json();
            if (data.success) {
                const s = data.summary;
                this.setInner('storageTotalBills', s.total_bills);
                this.setInner('storageCustomers',  Math.max(0, Math.floor(s.total_bills * 0.75)));
                this.setInner('storageSize',       (s.total_bills * 0.12 + 0.05).toFixed(2) + ' MB');
            }
        } catch(e) {}
    }

    async updateProfitMargin() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        const margin = parseFloat(document.getElementById('profitMargin')?.value);
        if (isNaN(margin) || margin < 0 || margin > 100)
            return this.showToast('Enter a valid margin (0–100)', 'error');
        try {
            const res  = await fetch('/set_profit_margin', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ margin, csrf_token: this.csrf })
            });
            const data = await res.json();
            if (data.success) this.showToast('Profit margin saved', 'success');
            else this.showToast(data.error || 'Failed', 'error');
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    async openDatabaseModal() {
        const modal = document.getElementById('dbModal');
        const body  = document.getElementById('modalBody');
        if (!modal||!body) return;
        modal.style.display = 'flex';
        body.innerHTML = '<div style="text-align:center;padding:24px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
        try {
            const res  = await fetch('/get_all_bills');
            const data = await res.json();
            if (!data.success || !data.bills.length) {
                body.innerHTML = '<p style="text-align:center;padding:24px;color:#95A5A6;">No bills yet.</p>'; return;
            }
            body.innerHTML = `<div style="overflow-x:auto;"><table style="width:100%;border-collapse:collapse;font-size:12px;">
                <thead><tr style="background:var(--primary-light);color:var(--primary-dark);">
                ${['#','Bill No','Date','Customer','Subtotal','Discount','Total'].map(h=>`<th style="padding:8px;white-space:nowrap;">${h}</th>`).join('')}
                </tr></thead><tbody>
                ${data.bills.map((b,i)=>`<tr style="${i%2?'background:#F9F9F9':''}">
                    <td style="padding:8px;">${i+1}</td>
                    <td style="padding:8px;">${this.esc(b.bill_no||'')}</td>
                    <td style="padding:8px;white-space:nowrap;">${this.esc(b.date||'')}</td>
                    <td style="padding:8px;">${this.esc(b.customer_name||'')}</td>
                    <td style="padding:8px;text-align:right;">${this.currency}${(b.subtotal||0).toFixed(2)}</td>
                    <td style="padding:8px;text-align:right;color:#e74c3c;">-${this.currency}${(b.discount||0).toFixed(2)}</td>
                    <td style="padding:8px;text-align:right;font-weight:700;">${this.currency}${(b.total||0).toFixed(2)}</td>
                </tr>`).join('')}
                </tbody></table></div>`;
        } catch(e) { body.innerHTML = '<p style="color:red;padding:20px;">Error loading.</p>'; }
    }

    async openAuditModal() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        const modal = document.getElementById('auditModal');
        const body  = document.getElementById('auditBody');
        if (!modal||!body) return;
        modal.style.display = 'flex';
        body.innerHTML = '<div style="text-align:center;padding:24px;"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
        try {
            const res  = await fetch('/get_audit_log');
            const data = await res.json();
            if (!data.log?.length) { body.innerHTML = '<p style="padding:20px;color:#95A5A6;">No audit events yet.</p>'; return; }
            body.innerHTML = data.log.map(l => `<div class="audit-line">${this.esc(l.trim())}</div>`).join('');
        } catch(e) { body.innerHTML = '<p style="color:red;padding:20px;">Error loading audit log.</p>'; }
    }

    // ─────────────────────────────────────
    // SETTINGS
    // ─────────────────────────────────────
    loadSettingsPage() {
        fetch('/get_profit_margin').then(r=>r.json()).then(d=>{
            const el = document.getElementById('profitMargin');
            if(el) el.value = d.margin || 30;
        }).catch(()=>{});
    }

    async saveStoreSettings() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        const settings = {
            store_name:      document.getElementById('settingStoreName')?.value.trim(),
            store_tagline:   document.getElementById('settingTagline')?.value.trim(),
            store_address:   document.getElementById('settingAddress')?.value.trim(),
            store_phone:     document.getElementById('settingPhone')?.value.trim(),
            store_email:     document.getElementById('settingEmail')?.value.trim(),
            store_website:   document.getElementById('settingWebsite')?.value.trim(),
            currency_symbol: document.getElementById('settingCurrency')?.value.trim() || '₹',
            csrf_token:      this.csrf
        };
        if (!settings.store_name) return this.showToast('Store name is required', 'error');
        try {
            const res  = await fetch('/update_store_settings', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify(settings)
            });
            const data = await res.json();
            if (data.success) {
                this.currency = settings.currency_symbol;
                this.setInner('sidebarStoreName', settings.store_name);
                this.setInner('topBarStoreName',  settings.store_name);
                this.setInner('topBarInitials',   settings.store_name.substring(0,2).toUpperCase());
                document.title = `${settings.store_name} · Billing System`;
                this.syncCurrencyLabel();
                this.updateBillDisplay();
                this.showToast('Store settings saved!', 'success');
            } else { this.showToast(data.error || 'Save failed', 'error'); }
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    async changePassword() {
        const oldPw  = document.getElementById('oldPassword')?.value;
        const newPw  = document.getElementById('newPassword')?.value;
        const confPw = document.getElementById('confirmPassword')?.value;
        if (!oldPw || !newPw) return this.showToast('Fill all password fields', 'error');
        if (newPw !== confPw) return this.showToast('Passwords do not match', 'error');
        if (newPw.length < 8) return this.showToast('Password must be at least 8 characters', 'error');
        try {
            const res  = await fetch('/change_password', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ old_password: oldPw, new_password: newPw, csrf_token: this.csrf })
            });
            const data = await res.json();
            if (data.success) {
                this.showToast('Password changed successfully!', 'success');
                ['oldPassword','newPassword','confirmPassword'].forEach(id => {
                    const el = document.getElementById(id); if(el) el.value='';
                });
            } else { this.showToast(data.error || 'Failed', 'error'); }
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    // ─────────────────────────────────────
    // DANGER ZONE (admin only)
    // ─────────────────────────────────────
    async eraseAllBills() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        if (!confirm('⚠️ DELETE ALL BILLS?\n\nThis is PERMANENT and cannot be undone!')) return;
        try {
            const res  = await fetch('/erase_all_bills', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ csrf_token: this.csrf })
            });
            const data = await res.json();
            if (data.success) {
                this.allBills = [];
                await this.loadSummary();
                this.showToast('All bills erased', 'success');
            } else { this.showToast(data.error || 'Failed', 'error'); }
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    async factoryReset() {
        if (this.role !== 'admin') return this.showToast('Admin access required', 'error');
        const confirm1 = prompt('Type RESET to confirm factory reset:');
        if (confirm1 !== 'RESET') return this.showToast('Factory reset cancelled', 'warning');
        try {
            const res  = await fetch('/factory_reset', {
                method:'POST', headers:{'Content-Type':'application/json'},
                body: JSON.stringify({ csrf_token: this.csrf })
            });
            const data = await res.json();
            if (data.success) { this.showToast('Factory reset complete', 'success'); setTimeout(() => window.location.reload(), 1500); }
            else { this.showToast(data.error || 'Failed', 'error'); }
        } catch(e) { this.showToast('Network error', 'error'); }
    }

    // ─────────────────────────────────────
    // UTILS
    // ─────────────────────────────────────
    syncCurrencyLabel() {
        document.querySelectorAll('.currency-label').forEach(el => { el.innerText = this.currency; });
    }

    saveToStorage() {
        try { localStorage.setItem('ubs_draft', JSON.stringify(this.items)); } catch(e) {}
    }

    loadFromStorage() {
        try {
            const d = localStorage.getItem('ubs_draft');
            if (d) { this.items = JSON.parse(d); this.updateBillDisplay(); }
        } catch(e) {}
        this.generateNewBillNo();
    }

    setInner(id, val) {
        const el = document.getElementById(id);
        if (el) el.innerText = val;
    }

    esc(str) {
        return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    }

    showToast(msg, type='success') {
        const t = document.getElementById('toast');
        if (!t) return;
        const icons = { success:'fa-check-circle', error:'fa-exclamation-circle', warning:'fa-exclamation-triangle', info:'fa-info-circle' };
        t.innerHTML = `<i class="fas ${icons[type]||'fa-info-circle'}"></i> ${this.esc(msg)}`;
        t.className = `toast show ${type}`;
        clearTimeout(this._toastTimer);
        this._toastTimer = setTimeout(() => { t.className = 'toast'; }, 3500);
    }
}

// ── Bootstrap ──
const UB = new UniversalBilling();
