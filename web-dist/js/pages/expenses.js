/* ===== EXPENSES PAGE ===== */
const ExpensesPage = {
  categories: ['Transport', 'Electricity', 'Shop Rent', 'Staff Salary', 'Equipment', 'Repairs', 'Stationery', 'Marketing', 'Stock Loss', 'Other'],

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';
    const expenses = await DB.getExpenses();
    const thisMonth = expenses.filter(e => {
      const d = new Date(e.date);
      const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthTotal = thisMonth.reduce((s, e) => s + (e.amount || 0), 0);
    const totalAll = expenses.reduce((s, e) => s + (e.amount || 0), 0);

    content.innerHTML = `
      <div class="page-header">
        <h2>Expenses</h2>
        <button class="btn btn-primary" id="addExpenseBtn">${Utils.icons.plus} Add Expense</button>
      </div>
      <div class="stats-row" style="margin-bottom:20px">
        <div class="stat-card"><div class="stat-card-icon coral">${Utils.icons.expenses}</div>
          <div class="stat-card-info"><span class="stat-card-label">This Month</span><span class="stat-card-value">${Utils.currency(monthTotal)}</span></div></div>
        <div class="stat-card"><div class="stat-card-icon purple">${Utils.icons.expenses}</div>
          <div class="stat-card-info"><span class="stat-card-label">Total Expenses</span><span class="stat-card-value">${Utils.currency(totalAll)}</span></div></div>
      </div>
      <div id="expensesTableContainer"></div>
    `;

    DataTable.render('expensesTableContainer', {
      id: 'expenses',
      columns: [
        { key: 'date', label: 'Date', render: r => Utils.formatDate(r.date) },
        { key: 'category', label: 'Category', render: r => `<span class="badge badge-neutral">${r.category}</span>` },
        { key: 'description', label: 'Description' },
        { key: 'amount', label: 'Amount', render: r => `<strong>${Utils.currency(r.amount)}</strong>` },
      ],
      data: expenses,
      actions: (row) => `
        ${row.stockAdjustmentId ? '<span class="badge badge-info">Linked</span>' : `
          <button class="btn btn-sm btn-ghost" onclick="ExpensesPage.editExpense(${row.id})">${Utils.icons.edit}</button>
          <button class="btn btn-sm btn-ghost" onclick="ExpensesPage.deleteExpense(${row.id})" style="color:var(--danger)">${Utils.icons.trash}</button>
        `}
      `
    });
    document.getElementById('addExpenseBtn').addEventListener('click', () => this.showForm());
  },

  showForm(expense = null) {
    const isEdit = !!expense;
    Modal.show({
      title: isEdit ? 'Edit Expense' : 'Add Expense',
      content: `
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group"><label class="form-label">Category</label>
            <select class="form-select" id="expCategory">
              ${this.categories.map(c => `<option ${expense?.category === c ? 'selected' : ''}>${c}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">Date</label>
            <input type="date" class="form-input" id="expDate" value="${expense ? Utils.formatDateInput(expense.date) : Utils.today()}"></div>
        </div>
        <div class="form-group" style="margin-bottom:16px"><label class="form-label">Description</label>
          <input class="form-input" id="expDesc" value="${expense?.description || ''}" placeholder="Expense description"></div>
        <div class="form-group"><label class="form-label">Amount (LKR) <span class="required">*</span></label>
          <input type="number" class="form-input" id="expAmount" value="${expense?.amount || ''}" min="0" step="0.01"></div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveExpBtn">${isEdit ? 'Update' : 'Add'}</button>`
    });
    document.getElementById('saveExpBtn').addEventListener('click', async () => {
      const data = {
        category: document.getElementById('expCategory').value,
        date: new Date(document.getElementById('expDate').value),
        description: document.getElementById('expDesc').value.trim(),
        amount: parseFloat(document.getElementById('expAmount').value) || 0
      };
      if (data.amount <= 0) { Toast.error('Required', 'Enter a valid amount'); return; }
      try {
        if (isEdit) { await DB.updateExpense(expense.id, data); Toast.success('Updated', 'Expense updated'); }
        else { await DB.addExpense(data); Toast.success('Added', 'Expense recorded'); }
        Modal.close(); this.render();
      } catch (err) {
        Toast.error('Error', err.message || 'Could not save expense');
      }
    });
  },

  async editExpense(id) {
    const e = await DB.getExpense(id);
    if (!e) return;
    if (e.stockAdjustmentId) { Toast.warning('Linked Expense', 'Stock loss expenses are controlled by inventory adjustments'); return; }
    this.showForm(e);
  },
  async deleteExpense(id) {
    Modal.confirm('Delete Expense', 'Are you sure?', async () => {
      try {
        await DB.deleteExpense(id);
        Toast.success('Deleted', 'Expense deleted');
        this.render();
      } catch (err) {
        Toast.error('Error', err.message || 'Could not delete expense');
      }
    });
  }
};
