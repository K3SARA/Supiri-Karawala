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
        <div class="form-group">
          <label class="form-label">Address</label>
          <textarea class="form-textarea" id="custAddress">${customer?.address || ''}</textarea>
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
        address: document.getElementById('custAddress').value.trim()
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
    const customer = await DB.getCustomer(id);
    const sales = (await DB.getSales()).filter(s => s.customerId === id);
    const payments = (await DB.getPayments()).filter(p => p.customerId === id);
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
    Modal.show({
      title: `Payment — ${customer.name}`,
      content: `
        <p style="margin-bottom:16px;color:var(--text-primary)">Current balance due: <strong>${Utils.currency(customer.balance)}</strong></p>
        <p style="margin-bottom:16px;color:var(--text-secondary)">If the payment is more than the due balance, the extra amount will be saved as customer credit.</p>
        <div class="form-row">
          <div class="form-group"><label class="form-label">Amount</label>
            <input type="number" class="form-input" id="payAmount" value="${customer.balance}" min="0" step="0.01"></div>
          <div class="form-group"><label class="form-label">Method</label>
            <select class="form-select" id="payMethod"><option>Cash</option><option>Card</option><option>Bank Transfer</option></select></div>
        </div>
        <div class="form-group" style="margin-top:16px"><label class="form-label">Notes</label>
          <input class="form-input" id="payNotes" placeholder="Optional notes"></div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-success" id="savePayBtn">${Utils.icons.check} Record Payment</button>
      `
    });
    document.getElementById('savePayBtn').addEventListener('click', async () => {
      const amount = parseFloat(document.getElementById('payAmount').value) || 0;
      if (amount <= 0) { Toast.error('Invalid', 'Enter a valid amount'); return; }
      await DB.addPayment({
        customerId: id, amount,
        method: document.getElementById('payMethod').value,
        notes: document.getElementById('payNotes').value
      });
      Toast.success('Recorded', `Payment of ${Utils.currency(amount)} recorded`);
      Modal.close(); this.render();
    });
  }
};
