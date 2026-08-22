/* ===== CHEQUE MANAGEMENT PAGE ===== */
const ChequesPage = {
  _filter: 'all',
  _search: '',

  statusLabel(s) {
    return { pending: 'Pending', deposited: 'Deposited', cleared: 'Cleared', bounced: 'Bounced', cancelled: 'Cancelled', returned: 'Returned' }[s] || s;
  },

  statusBadge(s) {
    const cls = { pending: 'badge-warning', deposited: 'badge-info', cleared: 'badge-success', bounced: 'badge-danger', cancelled: 'badge-neutral', returned: 'badge-orange' }[s] || 'badge-neutral';
    return `<span class="badge ${cls}">${this.statusLabel(s)}</span>`;
  },

  dueBadge(cheque) {
    if (cheque.status !== 'pending') return '';
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const due   = new Date(cheque.dueDate); due.setHours(0, 0, 0, 0);
    const diff  = Math.ceil((due - today) / 86400000);
    if (diff < 0)  return ' <span class="badge badge-danger">Overdue</span>';
    if (diff === 0) return ' <span class="badge badge-warning">Due Today</span>';
    if (diff <= 3)  return ' <span class="badge badge-info">Due Soon</span>';
    return '';
  },

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const summary = await DB.getChequeSummary();

    content.innerHTML = `
      <div class="page-header">
        <h2>Cheque Management</h2>
        <button class="btn btn-primary" id="addChequeBtn">${Utils.icons.plus} Add Cheque</button>
      </div>

      <!-- Summary Cards -->
      <div class="stats-row" style="margin-bottom:var(--space-4)">
        <div class="stat-card cheque-summary-card" style="cursor:pointer" data-filter="pending">
          <div class="stat-card-icon blue">${Utils.icons.cheques}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Pending</span>
            <span class="stat-card-value">${summary.pending.length}</span>
            <span style="font-size:11px;color:var(--text-secondary)">${Utils.currency(summary.pendingAmount)}</span>
          </div>
        </div>
        <div class="stat-card cheque-summary-card" style="cursor:pointer;border-color:${summary.dueToday.length > 0 ? 'var(--warning)' : 'transparent'}" data-filter="due_today">
          <div class="stat-card-icon" style="background:var(--warning-light);color:var(--warning)">${Utils.icons.billing}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Due Today</span>
            <span class="stat-card-value">${summary.dueToday.length}</span>
            <span style="font-size:11px;color:var(--text-secondary)">${Utils.currency(summary.dueTodayAmount)}</span>
          </div>
        </div>
        <div class="stat-card cheque-summary-card" style="cursor:pointer" data-filter="due_soon">
          <div class="stat-card-icon" style="background:#e0f2fe;color:#0284c7">${Utils.icons.billing}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Due Soon (3d)</span>
            <span class="stat-card-value">${summary.dueSoon.length}</span>
            <span style="font-size:11px;color:var(--text-secondary)">${Utils.currency(summary.dueSoonAmount)}</span>
          </div>
        </div>
        <div class="stat-card cheque-summary-card" style="cursor:pointer;border-color:${summary.overdue.length > 0 ? 'var(--danger)' : 'transparent'}" data-filter="overdue">
          <div class="stat-card-icon coral">${Utils.icons.warning}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Overdue</span>
            <span class="stat-card-value">${summary.overdue.length}</span>
            <span style="font-size:11px;color:var(--text-secondary)">${Utils.currency(summary.overdueAmount)}</span>
          </div>
        </div>
        <div class="stat-card cheque-summary-card" style="cursor:pointer" data-filter="bounced">
          <div class="stat-card-icon" style="background:var(--danger-light);color:var(--danger)">${Utils.icons.close}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Bounced</span>
            <span class="stat-card-value">${summary.bounced.length}</span>
            <span style="font-size:11px;color:var(--text-secondary)">${Utils.currency(summary.bouncedAmount)}</span>
          </div>
        </div>
      </div>

      <!-- Filters -->
      <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:var(--space-4)">
        <input type="text" class="form-input" id="chequeSearch" placeholder="Search cheque no., bank, customer…" style="width:280px;min-width:200px">
        <div class="tabs" id="chequeStatusTabs" style="margin:0;flex-wrap:wrap">
          ${['all','pending','deposited','cleared','bounced','cancelled','returned'].map(s =>
            `<div class="tab ${this._filter === s ? 'active' : ''}" data-status="${s}">${s === 'all' ? 'All' : this.statusLabel(s)}</div>`
          ).join('')}
        </div>
      </div>

      <!-- Table -->
      <div class="table-container" id="chequesTableContainer"></div>
    `;

    document.getElementById('addChequeBtn').addEventListener('click', () => this.showForm());
    document.getElementById('chequeSearch').value = this._search;
    document.getElementById('chequeSearch').addEventListener('input', Utils.debounce(e => {
      this._search = e.target.value; this.renderTable();
    }, 250));

    document.getElementById('chequeStatusTabs').addEventListener('click', e => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      this._filter = tab.dataset.status;
      document.querySelectorAll('#chequeStatusTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.status === this._filter));
      this.renderTable();
    });

    document.querySelectorAll('.cheque-summary-card').forEach(card => {
      card.addEventListener('click', () => {
        const f = card.dataset.filter;
        this._filter = f;
        document.querySelectorAll('#chequeStatusTabs .tab').forEach(t => t.classList.toggle('active', t.dataset.status === f));
        this.renderTable();
      });
    });

    await this.renderTable();
  },

  async renderTable() {
    const all      = await DB.getCheques();
    const customers = await DB.getCustomers();
    const custMap  = Object.fromEntries(customers.map(c => [c.id, c.name]));

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const in3   = new Date(today); in3.setDate(in3.getDate() + 4);

    let data = all;
    if (this._filter === 'pending')   data = all.filter(c => c.status === 'pending');
    else if (this._filter === 'deposited') data = all.filter(c => c.status === 'deposited');
    else if (this._filter === 'cleared')   data = all.filter(c => c.status === 'cleared');
    else if (this._filter === 'bounced')   data = all.filter(c => c.status === 'bounced');
    else if (this._filter === 'cancelled') data = all.filter(c => c.status === 'cancelled');
    else if (this._filter === 'returned')  data = all.filter(c => c.status === 'returned');
    else if (this._filter === 'due_today') data = all.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0,0,0,0);
      return c.status === 'pending' && d.getTime() === today.getTime();
    });
    else if (this._filter === 'due_soon') data = all.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0,0,0,0);
      return c.status === 'pending' && d >= new Date(today.getTime() + 86400000) && d < in3;
    });
    else if (this._filter === 'overdue') data = all.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0,0,0,0);
      return c.status === 'pending' && d < today;
    });

    if (this._search.trim()) {
      const q = this._search.toLowerCase();
      data = data.filter(c =>
        (c.chequeNumber || '').toLowerCase().includes(q) ||
        (c.bankName || '').toLowerCase().includes(q) ||
        (custMap[c.customerId] || '').toLowerCase().includes(q) ||
        (c.drawerName || '').toLowerCase().includes(q) ||
        (c.bankBranch || '').toLowerCase().includes(q)
      );
    }

    DataTable.render('chequesTableContainer', {
      id: 'cheques',
      columns: [
        { key: 'chequeNumber', label: 'Cheque No.', render: r => `<strong>${Utils.escapeHtml(r.chequeNumber || '—')}</strong>` },
        { key: 'customerId', label: 'Customer', render: r => Utils.escapeHtml(custMap[r.customerId] || r.drawerName || '—') },
        { key: 'bankName', label: 'Bank', render: r => `${Utils.escapeHtml(r.bankName || '—')}${r.bankBranch ? `<br><small style="color:var(--text-secondary)">${Utils.escapeHtml(r.bankBranch)}</small>` : ''}` },
        { key: 'amount', label: 'Amount', render: r => `<strong>${Utils.currency(r.amount || 0)}</strong>` },
        { key: 'receivedDate', label: 'Received', render: r => Utils.formatDate(r.receivedDate) },
        { key: 'dueDate', label: 'Due Date', render: r => `${Utils.formatDate(r.dueDate)}${this.dueBadge(r)}` },
        { key: 'status', label: 'Status', render: r => this.statusBadge(r.status) },
      ],
      data,
      searchable: false,
      actions: (row) => this.buildActions(row)
    });
  },

  buildActions(row) {
    const s = row.status;
    let btns = `<button class="btn btn-sm btn-ghost" onclick="ChequesPage.viewCheque(${row.id})" title="View">${Utils.icons.eye}</button>`;
    btns += `<button class="btn btn-sm btn-ghost" onclick="ChequesPage.showForm(${row.id})" title="Edit">${Utils.icons.edit}</button>`;
    if (s === 'pending') {
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--accent)" onclick="ChequesPage.changeStatus(${row.id},'deposited')" title="Mark Deposited">↓ Dep</button>`;
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="ChequesPage.changeStatus(${row.id},'bounced')" title="Mark Bounced">✗ Bounce</button>`;
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--text-secondary)" onclick="ChequesPage.changeStatus(${row.id},'cancelled')" title="Cancel">Cancel</button>`;
    }
    if (s === 'deposited') {
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--success)" onclick="ChequesPage.changeStatus(${row.id},'cleared')" title="Mark Cleared">✓ Clear</button>`;
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="ChequesPage.changeStatus(${row.id},'bounced')" title="Mark Bounced">✗ Bounce</button>`;
    }
    if (s === 'bounced') {
      btns += `<button class="btn btn-sm btn-ghost" style="color:var(--warning)" onclick="ChequesPage.changeStatus(${row.id},'pending')" title="Re-present">↺ Re-present</button>`;
    }
    btns += `<button class="btn btn-sm btn-ghost" style="color:var(--danger)" onclick="ChequesPage.deleteCheque(${row.id})" title="Delete">${Utils.icons.trash}</button>`;
    return btns;
  },

  async viewCheque(id) {
    const c = await DB.getChequeById(id);
    if (!c) return;
    const customers = await DB.getCustomers();
    const custName  = customers.find(x => x.id === c.customerId)?.name || '—';
    Modal.show({
      title: `Cheque #${c.chequeNumber || id}`,
      content: `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;font-size:13px">
          <div><div style="color:var(--text-secondary);font-size:11px">Cheque Number</div><strong>${Utils.escapeHtml(c.chequeNumber || '—')}</strong></div>
          <div><div style="color:var(--text-secondary);font-size:11px">Status</div>${this.statusBadge(c.status)}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Bank</div>${Utils.escapeHtml(c.bankName || '—')}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Branch</div>${Utils.escapeHtml(c.bankBranch || '—')}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Drawer Name</div>${Utils.escapeHtml(c.drawerName || '—')}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Customer</div>${Utils.escapeHtml(custName)}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Amount</div><strong style="font-size:16px">${Utils.currency(c.amount || 0)}</strong></div>
          <div><div style="color:var(--text-secondary);font-size:11px">Received Date</div>${Utils.formatDate(c.receivedDate)}</div>
          <div><div style="color:var(--text-secondary);font-size:11px">Due Date</div>${Utils.formatDate(c.dueDate)}${this.dueBadge(c)}</div>
          ${c.depositedDate ? `<div><div style="color:var(--text-secondary);font-size:11px">Deposited</div>${Utils.formatDate(c.depositedDate)}</div>` : ''}
          ${c.clearedDate   ? `<div><div style="color:var(--text-secondary);font-size:11px">Cleared</div>${Utils.formatDate(c.clearedDate)}</div>` : ''}
          ${c.bouncedDate   ? `<div><div style="color:var(--text-secondary);font-size:11px">Bounced</div>${Utils.formatDate(c.bouncedDate)}</div>` : ''}
          ${c.saleId ? `<div><div style="color:var(--text-secondary);font-size:11px">Invoice</div>#${c.saleId}</div>` : ''}
          ${c.notes ? `<div style="grid-column:1/-1"><div style="color:var(--text-secondary);font-size:11px">Notes</div>${Utils.escapeHtml(c.notes)}</div>` : ''}
        </div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Close</button>`
    });
  },

  async showForm(id = null) {
    const cheque    = id ? await DB.getChequeById(id) : null;
    const isEdit    = !!cheque;
    const customers = await DB.getCustomers();
    const today     = new Date().toISOString().split('T')[0];

    Modal.show({
      title: isEdit ? 'Edit Cheque' : 'Add Cheque',
      size: 'lg',
      content: `
        <div class="form-row" style="margin-bottom:14px">
          <div class="form-group">
            <label class="form-label">Cheque Number <span class="required">*</span></label>
            <input class="form-input" id="chqNo" value="${Utils.escapeHtml(cheque?.chequeNumber || '')}" placeholder="e.g. 000123">
          </div>
          <div class="form-group">
            <label class="form-label">Amount (LKR) <span class="required">*</span></label>
            <input type="number" class="form-input" id="chqAmt" value="${cheque?.amount || ''}" min="0.01" step="0.01">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:14px">
          <div class="form-group">
            <label class="form-label">Bank Name <span class="required">*</span></label>
            <input class="form-input" id="chqBank" value="${Utils.escapeHtml(cheque?.bankName || '')}" placeholder="Bank of Ceylon">
          </div>
          <div class="form-group">
            <label class="form-label">Branch</label>
            <input class="form-input" id="chqBranch" value="${Utils.escapeHtml(cheque?.bankBranch || '')}" placeholder="Colombo 7">
          </div>
        </div>
        <div class="form-row" style="margin-bottom:14px">
          <div class="form-group">
            <label class="form-label">Drawer / Account Holder <span class="required">*</span></label>
            <input class="form-input" id="chqDrawer" value="${Utils.escapeHtml(cheque?.drawerName || '')}" placeholder="Name on cheque">
          </div>
          <div class="form-group">
            <label class="form-label">Customer</label>
            <select class="form-select" id="chqCustomer">
              <option value="">— None —</option>
              ${customers.map(c => `<option value="${c.id}" ${cheque?.customerId === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name)}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="form-row" style="margin-bottom:14px">
          <div class="form-group">
            <label class="form-label">Received Date <span class="required">*</span></label>
            <input type="date" class="form-input" id="chqReceived" value="${cheque?.receivedDate?.split('T')[0] || today}">
          </div>
          <div class="form-group">
            <label class="form-label">Due / Realization Date <span class="required">*</span></label>
            <input type="date" class="form-input" id="chqDue" value="${cheque?.dueDate?.split('T')[0] || ''}">
          </div>
        </div>
        ${isEdit ? `
        <div class="form-group" style="margin-bottom:14px">
          <label class="form-label">Status</label>
          <select class="form-select" id="chqStatus">
            ${['pending','deposited','cleared','bounced','cancelled','returned'].map(s =>
              `<option value="${s}" ${cheque.status === s ? 'selected' : ''}>${this.statusLabel(s)}</option>`).join('')}
          </select>
        </div>` : ''}
        <div class="form-group">
          <label class="form-label">Notes</label>
          <textarea class="form-textarea" id="chqNotes" rows="2" placeholder="Optional remarks">${Utils.escapeHtml(cheque?.notes || '')}</textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveChqBtn">${isEdit ? 'Update' : 'Add Cheque'}</button>
      `
    });

    document.getElementById('saveChqBtn').addEventListener('click', async () => {
      const chequeNumber = document.getElementById('chqNo').value.trim();
      const bankName     = document.getElementById('chqBank').value.trim();
      const drawerName   = document.getElementById('chqDrawer').value.trim();
      const amount       = parseFloat(document.getElementById('chqAmt').value) || 0;
      const receivedDate = document.getElementById('chqReceived').value;
      const dueDate      = document.getElementById('chqDue').value;
      const customerId   = parseInt(document.getElementById('chqCustomer').value) || null;
      const notes        = document.getElementById('chqNotes').value.trim();
      const status       = isEdit ? document.getElementById('chqStatus').value : 'pending';

      if (!chequeNumber) { Toast.error('Required', 'Cheque number is required'); return; }
      if (!bankName)     { Toast.error('Required', 'Bank name is required'); return; }
      if (!drawerName)   { Toast.error('Required', 'Drawer name is required'); return; }
      if (amount <= 0)   { Toast.error('Invalid', 'Amount must be greater than 0'); return; }
      if (!receivedDate) { Toast.error('Required', 'Received date is required'); return; }
      if (!dueDate)      { Toast.error('Required', 'Due date is required'); return; }
      if (dueDate < receivedDate) { Toast.error('Invalid', 'Due date cannot be before received date'); return; }

      const data = {
        chequeNumber, bankName, bankBranch: document.getElementById('chqBranch').value.trim(),
        drawerName, amount, receivedDate, dueDate, customerId, notes, status
      };

      try {
        if (isEdit) {
          await DB.updateCheque(id, data);
          Toast.success('Updated', 'Cheque updated');
        } else {
          await DB.addCheque(data);
          Toast.success('Added', 'Cheque recorded');
        }
        Modal.close();
        this.render();
      } catch (err) {
        Toast.error('Error', err.message);
      }
    });
  },

  async changeStatus(id, newStatus) {
    const labels = { deposited: 'Mark as Deposited', cleared: 'Mark as Cleared', bounced: 'Mark as Bounced', cancelled: 'Cancel', pending: 'Re-present Cheque' };
    const warnings = {
      bounced: 'This will reverse the payment effect and add the cheque amount back to the customer\'s outstanding balance.',
      cleared: 'This marks the cheque as cleared. This cannot be undone.',
      cancelled: 'This will cancel the cheque. Status cannot be changed after cancellation.'
    };
    Modal.confirm(
      labels[newStatus] || 'Update Status',
      `${warnings[newStatus] || 'Update cheque status?'} Continue?`,
      async () => {
        try {
          await DB.updateChequeStatus(id, newStatus);
          Toast.success('Updated', `Cheque marked as ${this.statusLabel(newStatus)}`);
          this.render();
        } catch (err) {
          Toast.error('Error', err.message);
        }
      }
    );
  },

  async deleteCheque(id) {
    Modal.confirm('Delete Cheque', 'Are you sure you want to delete this cheque record?', async () => {
      try {
        await DB.deleteCheque(id);
        Toast.success('Deleted', 'Cheque deleted');
        this.render();
      } catch (err) {
        Toast.error('Cannot Delete', err.message);
      }
    });
  }
};
