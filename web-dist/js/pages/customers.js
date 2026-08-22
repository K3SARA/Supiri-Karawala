/* ===== CUSTOMERS PAGE ===== */
const CustomersPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const customers = await DB.getCustomers();

    content.innerHTML = `
      <div class="page-header">
        <h2>Customers (${customers.length})</h2>
        <button class="btn btn-primary" id="addCustomerBtn">${Utils.icons.plus} Add Customer</button>
      </div>
      <div id="customersTableContainer"></div>
    `;

    DataTable.render('customersTableContainer', {
      id: 'customers',
      columns: [
        { key: 'name', label: 'Customer Name', render: r => `<strong>${Utils.escapeHtml(r.name)}</strong>` },
        { key: 'phone', label: 'Phone', render: r => r.phone || '—' },
        { key: 'balance', label: 'Balance Due', render: r => {
          const bal = r.balance || 0;
          return bal > 0 ? `<span class="badge badge-danger">${Utils.currency(bal)}</span>` : '<span class="badge badge-success">Clear</span>';
        }},
        { key: 'creditBalance', label: 'Credit', render: r => {
          const credit = r.creditBalance || 0;
          return credit > 0 ? `<span class="badge badge-info">${Utils.currency(credit)}</span>` : '<span class="badge badge-neutral">None</span>';
        }},
        { key: 'createdAt', label: 'Since', render: r => Utils.formatDate(r.createdAt) },
      ],
      data: customers,
      actions: (row) => `
        <button class="btn btn-sm btn-ghost" onclick="CustomersPage.viewCustomer(${row.id})" title="View">${Utils.icons.eye}</button>
        ${row.balance > 0 ? `<button class="btn btn-sm btn-ghost" onclick="CustomersPage.recordPayment(${row.id})" title="Payment" style="color:var(--success)">${Utils.icons.cash}</button>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="CustomersPage.editCustomer(${row.id})" title="Edit">${Utils.icons.edit}</button>
        <button class="btn btn-sm btn-ghost" onclick="CustomersPage.deleteCustomer(${row.id})" title="Delete" style="color:var(--danger)">${Utils.icons.trash}</button>
      `
    });

    document.getElementById('addCustomerBtn').addEventListener('click', () => this.showForm());
  },

  showForm(customer = null) {
    const isEdit = !!customer;
    Modal.show({
      title: isEdit ? 'Edit Customer' : 'Add Customer',
      content: `
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Customer Name <span class="required">*</span></label>
          <input class="form-input" id="custName" value="${customer?.name || ''}">
        </div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group"><label class="form-label">Phone</label>
            <input class="form-input" id="custPhone" value="${customer?.phone || ''}"></div>
          <div class="form-group"><label class="form-label">Email</label>
            <input class="form-input" id="custEmail" value="${customer?.email || ''}"></div>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Address</label>
          <textarea class="form-textarea" id="custAddress">${customer?.address || ''}</textarea>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Cheque Limit (LKR)</label>
            <input type="number" class="form-input" id="custChequeLimit" value="${customer?.chequeLimit || ''}" min="0" step="0.01" placeholder="0 = no limit">
            <span style="font-size:11px;color:var(--text-secondary);margin-top:3px;display:block">Max total of passed cheques allowed</span>
          </div>
          <div class="form-group">
            <label class="form-label">Credit Limit (LKR)</label>
            <input type="number" class="form-input" id="custCreditLimit" value="${customer?.creditLimit || ''}" min="0" step="0.01" placeholder="0 = no limit">
            <span style="font-size:11px;color:var(--text-secondary);margin-top:3px;display:block">Max balance due allowed</span>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveCustBtn">${isEdit ? 'Update' : 'Add'}</button>
      `
    });
    document.getElementById('saveCustBtn').addEventListener('click', async () => {
      const data = {
        name: document.getElementById('custName').value.trim(),
        phone: document.getElementById('custPhone').value.trim(),
        email: document.getElementById('custEmail').value.trim(),
        address: document.getElementById('custAddress').value.trim(),
        chequeLimit: parseFloat(document.getElementById('custChequeLimit').value) || 0,
        creditLimit: parseFloat(document.getElementById('custCreditLimit').value) || 0,
      };
      if (!data.name) { Toast.error('Required', 'Customer name is required'); return; }
      if (isEdit) {
        await DB.updateCustomer(customer.id, data);
        Toast.success('Updated', 'Customer updated');
      } else {
        await DB.addCustomer(data);
        Toast.success('Added', 'Customer added');
      }
      Modal.close(); this.render();
    });
  },

  async editCustomer(id) { const c = await DB.getCustomer(id); if (c) this.showForm(c); },

  async deleteCustomer(id) {
    Modal.confirm('Delete Customer', 'Are you sure?', async () => {
      await DB.deleteCustomer(id); Toast.success('Deleted', 'Customer deleted'); this.render();
    });
  },

  async viewCustomer(id) {
    const customer    = await DB.getCustomer(id);
    const sales       = (await DB.getSales()).filter(s => s.customerId === id);
    const chequeStats = await DB.getCustomerChequeStats(id);
    const chqLimit    = customer.chequeLimit || 0;
    const usedPct     = chqLimit > 0 ? Math.min(100, Math.round(chequeStats.passedAmount / chqLimit * 100)) : 0;
    const isExceeded  = chqLimit > 0 && chequeStats.passedAmount > chqLimit;
    const isWarning   = chqLimit > 0 && !isExceeded && usedPct >= 80;
    const barColor    = isExceeded ? 'var(--danger)' : isWarning ? 'var(--warning)' : 'var(--success)';

    const chequeLimitHtml = `
      <div style="background:var(--bg-card);border:1px solid var(--border);border-radius:var(--radius-lg);padding:16px;margin-bottom:20px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
          <h4 style="margin:0;font-size:14px">${Utils.icons.cheques} Cheque Status</h4>
          ${chqLimit > 0 ? `<span class="badge ${isExceeded ? 'badge-danger' : isWarning ? 'badge-warning' : 'badge-success'}">
            ${isExceeded ? '⚠️ Limit Exceeded' : isWarning ? '⚠️ Near Limit' : '✅ Within Limit'}
          </span>` : '<span style="font-size:11px;color:var(--text-secondary)">No limit set</span>'}
        </div>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:${chqLimit > 0 ? '14px' : '0'}">
          <div style="text-align:center;padding:10px;background:var(--bg-secondary);border-radius:var(--radius-md)">
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px">Passed</div>
            <div style="font-weight:700;font-size:13px;color:var(--success-dark)">${Utils.currency(chequeStats.passedAmount)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${chequeStats.passedCount} cheque${chequeStats.passedCount !== 1 ? 's' : ''}</div>
          </div>
          <div style="text-align:center;padding:10px;background:var(--bg-secondary);border-radius:var(--radius-md)">
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px">Pending</div>
            <div style="font-weight:700;font-size:13px;color:var(--warning-dark)">${Utils.currency(chequeStats.pendingAmount)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${chequeStats.pendingCount} cheque${chequeStats.pendingCount !== 1 ? 's' : ''}</div>
          </div>
          <div style="text-align:center;padding:10px;background:var(--bg-secondary);border-radius:var(--radius-md)">
            <div style="font-size:11px;color:var(--text-secondary);margin-bottom:3px">Bounced</div>
            <div style="font-weight:700;font-size:13px;color:var(--danger)">${Utils.currency(chequeStats.bouncedAmount)}</div>
            <div style="font-size:11px;color:var(--text-secondary)">${chequeStats.bouncedCount} cheque${chequeStats.bouncedCount !== 1 ? 's' : ''}</div>
          </div>
        </div>
        ${chqLimit > 0 ? `
          <div style="font-size:12px;color:var(--text-secondary);margin-bottom:5px;display:flex;justify-content:space-between">
            <span>Passed: <strong>${Utils.currency(chequeStats.passedAmount)}</strong></span>
            <span>Limit: <strong>${Utils.currency(chqLimit)}</strong></span>
          </div>
          <div style="height:10px;background:var(--bg-input);border-radius:var(--radius-full);overflow:hidden">
            <div style="height:100%;width:${usedPct}%;background:${barColor};border-radius:var(--radius-full);transition:width 0.4s ease"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px;margin-top:4px">
            <span style="color:${barColor};font-weight:600">${usedPct}% used</span>
            ${isExceeded
              ? `<span style="color:var(--danger);font-weight:600">Over by ${Utils.currency(chequeStats.passedAmount - chqLimit)}</span>`
              : `<span style="color:var(--text-secondary)">Remaining: ${Utils.currency(chqLimit - chequeStats.passedAmount)}</span>`}
          </div>
        ` : ''}
      </div>
    `;

    Modal.show({
      title: customer.name,
      size: 'lg',
      content: `
        <div class="stats-row" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Total Purchases</span><span class="stat-card-value">${sales.length}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon coral">${Utils.icons.expenses}</div>
            <div class="stat-card-info"><span class="stat-card-label">Balance Due</span><span class="stat-card-value">${Utils.currency(customer.balance || 0)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon green">${Utils.icons.cash}</div>
            <div class="stat-card-info"><span class="stat-card-label">Credit Balance</span><span class="stat-card-value">${Utils.currency(customer.creditBalance || 0)}</span></div></div>
        </div>
        ${chequeLimitHtml}
        <h4 style="margin-bottom:12px">Purchase History</h4>
        <table class="data-table">
          <thead><tr><th>Invoice</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${sales.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-secondary)">No purchases yet</td></tr>' :
              sales.slice(0, 20).map(s => `
                <tr><td>${s.invoiceNo || 'N/A'}</td><td>${Utils.formatDate(s.createdAt)}</td>
                <td><strong>${Utils.currency(s.total)}</strong></td>
                <td><span class="badge ${s.dueAmount > 0 ? 'badge-warning' : 'badge-success'}">${s.dueAmount > 0 ? 'Credit' : 'Paid'}</span></td></tr>
              `).join('')}
          </tbody>
        </table>
      `
    });
  },

  async recordPayment(id) {
    const customer = await DB.getCustomer(id);
    const today    = new Date().toISOString().split('T')[0];
    Modal.show({
      title: `Payment — ${customer.name}`,
      content: `
        <p style="margin-bottom:12px;color:var(--text-primary)">Balance due: <strong>${Utils.currency(customer.balance)}</strong></p>
        <p style="margin-bottom:14px;color:var(--text-secondary);font-size:12px">Extra amount beyond the balance will be saved as customer credit.</p>
        <div class="form-row" style="margin-bottom:14px">
          <div class="form-group"><label class="form-label">Amount</label>
            <input type="number" class="form-input" id="payAmount" value="${customer.balance}" min="0" step="0.01"></div>
          <div class="form-group"><label class="form-label">Method</label>
            <select class="form-select" id="payMethod">
              <option value="Cash">Cash</option>
              <option value="Card">Card</option>
              <option value="Bank Transfer">Bank Transfer</option>
              <option value="Cheque">Cheque</option>
            </select></div>
        </div>
        <div id="custChequeFields" style="display:none;border-top:1px solid var(--border);padding-top:14px;margin-bottom:14px">
          <div class="form-row" style="margin-bottom:10px">
            <div class="form-group"><label class="form-label">Cheque No. <span class="required">*</span></label>
              <input class="form-input" id="custChqNo" placeholder="000123"></div>
            <div class="form-group"><label class="form-label">Bank <span class="required">*</span></label>
              <input class="form-input" id="custChqBank" placeholder="Bank of Ceylon"></div>
          </div>
          <div class="form-row" style="margin-bottom:10px">
            <div class="form-group"><label class="form-label">Branch</label>
              <input class="form-input" id="custChqBranch" placeholder="Colombo 7"></div>
            <div class="form-group"><label class="form-label">Drawer Name <span class="required">*</span></label>
              <input class="form-input" id="custChqDrawer" value="${Utils.escapeHtml(customer.name)}" placeholder="Name on cheque"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Received Date</label>
              <input type="date" class="form-input" id="custChqReceived" value="${today}"></div>
            <div class="form-group"><label class="form-label">Due Date <span class="required">*</span></label>
              <input type="date" class="form-input" id="custChqDue"></div>
          </div>
        </div>
        <div class="form-group"><label class="form-label">Notes</label>
          <input class="form-input" id="payNotes" placeholder="Optional notes"></div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-success" id="savePayBtn">${Utils.icons.check} Record Payment</button>
      `
    });

    document.getElementById('payMethod').addEventListener('change', e => {
      document.getElementById('custChequeFields').style.display = e.target.value === 'Cheque' ? 'block' : 'none';
    });

    document.getElementById('savePayBtn').addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('payAmount').value) || 0;
      const method = document.getElementById('payMethod').value;
      if (amount <= 0) { Toast.error('Invalid', 'Enter a valid amount'); return; }

      if (method === 'Cheque') {
        const chqNo  = document.getElementById('custChqNo').value.trim();
        const chqBank = document.getElementById('custChqBank').value.trim();
        const chqDue  = document.getElementById('custChqDue').value;
        const chqDrawer = document.getElementById('custChqDrawer').value.trim();
        if (!chqNo)  { Toast.error('Required', 'Cheque number is required'); return; }
        if (!chqBank){ Toast.error('Required', 'Bank name is required'); return; }
        if (!chqDue) { Toast.error('Required', 'Due date is required'); return; }
        if (!chqDrawer){ Toast.error('Required', 'Drawer name is required'); return; }
        const chqReceived = document.getElementById('custChqReceived').value;
        if (chqDue < chqReceived){ Toast.error('Invalid', 'Due date cannot be before received date'); return; }

        await DB.addPaymentWithCheque(
          { customerId: id, amount, method, notes: document.getElementById('payNotes').value },
          {
            customerId: id, chequeNumber: chqNo, bankName: chqBank,
            bankBranch: document.getElementById('custChqBranch').value.trim(),
            drawerName: chqDrawer, amount,
            receivedDate: chqReceived, dueDate: chqDue,
            notes: document.getElementById('payNotes').value
          }
        );
        Toast.success('Recorded', `Cheque payment of ${Utils.currency(amount)} recorded`);
      } else {
        await DB.addPayment({ customerId: id, amount, method, notes: document.getElementById('payNotes').value });
        Toast.success('Recorded', `Payment of ${Utils.currency(amount)} recorded`);
      }
      Modal.close(); this.render();
    });
  }
};
