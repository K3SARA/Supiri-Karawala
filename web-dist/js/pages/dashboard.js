/* ===== DASHBOARD PAGE ===== */
const DashboardPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';

    // Gather data
    const today = new Date();
    const todaySales = await DB.getDailySales(today);
    const products = await DB.getProducts();
    const lowStock = await DB.getLowStockProducts();
    const customers = await DB.getCustomers();
    const expenses = await DB.getExpenses();
    const chequeSummary = await DB.getChequeSummary();

    const todayTotal = todaySales.reduce((sum, s) => sum + (s.total || 0), 0);
    const todayNetSales = todaySales.reduce((sum, s) => sum + ((s.total || 0) - (s.tax || 0)), 0);
    const todayCost = todaySales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const todayGrossProfit = todayNetSales - todayCost;
    const pendingDues = customers.reduce((sum, c) => sum + (c.balance || 0), 0);
    const todayExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.toDateString() === today.toDateString();
    }).reduce((sum, e) => sum + (e.amount || 0), 0);
    const todayProfit = todayGrossProfit - todayExpenses;

    // Weekly sales for chart
    const weekData = [];
    const weekLabels = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const sales = await DB.getDailySales(d);
      weekData.push(sales.reduce((s, sale) => s + (sale.total || 0), 0));
      weekLabels.push(d.toLocaleDateString('en-GB', { weekday: 'short' }));
    }

    content.innerHTML = `
      <div class="page-header">
        <h2>Dashboard</h2>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="App.navigate('billing')">${Utils.icons.billing} New Sale</button>
        </div>
      </div>

      <div class="stats-row">
        <div class="stat-card animate-fade-in-up stagger-1">
          <div class="stat-card-icon blue">${Utils.icons.billing}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Today Sales</span>
            <span class="stat-card-value">${Utils.currency(todayTotal)}</span>
          </div>
        </div>
        <div class="stat-card animate-fade-in-up stagger-2">
          <div class="stat-card-icon green">${Utils.icons.profit}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Today Net Profit</span>
            <span class="stat-card-value">${Utils.currency(todayProfit)}</span>
          </div>
        </div>
        <div class="stat-card animate-fade-in-up stagger-3">
          <div class="stat-card-icon coral">${Utils.icons.warning}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Low Stock</span>
            <span class="stat-card-value">${lowStock.length}</span>
          </div>
        </div>
        <div class="stat-card animate-fade-in-up stagger-4">
          <div class="stat-card-icon purple">${Utils.icons.products}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Total Products</span>
            <span class="stat-card-value">${products.length}</span>
          </div>
        </div>
      </div>

      <div class="stats-row" style="margin-bottom:var(--space-5)">
        <div class="stat-card">
          <div class="stat-card-icon blue">${Utils.icons.customers}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Transactions Today</span>
            <span class="stat-card-value">${todaySales.length}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon coral">${Utils.icons.expenses}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Today Expenses</span>
            <span class="stat-card-value">${Utils.currency(todayExpenses)}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon purple">${Utils.icons.customers}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Pending Dues</span>
            <span class="stat-card-value">${Utils.currency(pendingDues)}</span>
          </div>
        </div>
      </div>

      <div class="content-card animate-fade-in-up" style="margin-bottom:var(--space-5)">
        <div class="content-card-header">
          <h3>View Previous Sales &amp; Profit</h3>
        </div>
        <div class="content-card-body">
          <div class="report-filters" style="margin-bottom:0">
            <label style="display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-secondary)">
              From
              <input type="date" class="form-input" id="dashRangeFrom" value="${Utils.today()}" style="width:auto">
            </label>
            <label style="display:flex;flex-direction:column;gap:2px;font-size:11px;color:var(--text-secondary)">
              To
              <input type="date" class="form-input" id="dashRangeTo" value="${Utils.today()}" style="width:auto">
            </label>
            <button class="btn btn-primary" id="dashRangeViewBtn" style="align-self:flex-end">${Utils.icons.reports} View</button>
          </div>
          <div id="dashRangeResults" style="margin-top:var(--space-4)"></div>
        </div>
      </div>

      ${(chequeSummary.dueToday.length + chequeSummary.dueSoon.length + chequeSummary.overdue.length + chequeSummary.bounced.length) > 0 ? `
      <div class="cheque-alerts-row" style="margin-bottom:var(--space-5)">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
          ${Utils.icons.cheques}
          <h4 style="margin:0;font-size:14px">Cheque Alerts</h4>
          <button class="btn btn-sm btn-outline" onclick="App.navigate('cheques')" style="margin-left:auto">Manage Cheques</button>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          ${chequeSummary.overdue.length > 0 ? `
            <div class="cheque-alert-card overdue" onclick="App.navigate('cheques')">
              <div class="cheque-alert-label">Overdue</div>
              <div class="cheque-alert-count">${chequeSummary.overdue.length}</div>
              <div class="cheque-alert-amount">${Utils.currency(chequeSummary.overdueAmount)}</div>
            </div>` : ''}
          ${chequeSummary.dueToday.length > 0 ? `
            <div class="cheque-alert-card due-today" onclick="App.navigate('cheques')">
              <div class="cheque-alert-label">Due Today</div>
              <div class="cheque-alert-count">${chequeSummary.dueToday.length}</div>
              <div class="cheque-alert-amount">${Utils.currency(chequeSummary.dueTodayAmount)}</div>
            </div>` : ''}
          ${chequeSummary.dueSoon.length > 0 ? `
            <div class="cheque-alert-card due-soon" onclick="App.navigate('cheques')">
              <div class="cheque-alert-label">Due Soon (3 days)</div>
              <div class="cheque-alert-count">${chequeSummary.dueSoon.length}</div>
              <div class="cheque-alert-amount">${Utils.currency(chequeSummary.dueSoonAmount)}</div>
            </div>` : ''}
          ${chequeSummary.bounced.length > 0 ? `
            <div class="cheque-alert-card bounced" onclick="App.navigate('cheques')">
              <div class="cheque-alert-label">Bounced</div>
              <div class="cheque-alert-count">${chequeSummary.bounced.length}</div>
              <div class="cheque-alert-amount">${Utils.currency(chequeSummary.bouncedAmount)}</div>
            </div>` : ''}
        </div>
      </div>` : ''}

      <div class="dashboard-grid">
        <div class="dashboard-chart-card animate-fade-in-up">
          <div class="dashboard-chart-header">
            <h4>Weekly Sales</h4>
          </div>
          <div class="report-chart-container"><canvas id="weeklySalesChart"></canvas></div>
        </div>

        <div class="dashboard-chart-card animate-fade-in-up">
          <div class="dashboard-chart-header">
            <h4>Low Stock Items</h4>
            <button class="btn btn-sm btn-outline" onclick="App.navigate('inventory')">View All</button>
          </div>
          <div class="low-stock-list" id="dashLowStock"></div>
        </div>

        <div class="dashboard-chart-card dashboard-recent animate-fade-in-up">
          <div class="dashboard-chart-header">
            <h4>Recent Transactions</h4>
            <button class="btn btn-sm btn-outline" onclick="App.navigate('reports')">View All</button>
          </div>
          <div id="dashRecentSales"></div>
        </div>
      </div>
    `;

    document.getElementById('dashRangeViewBtn').addEventListener('click', () => this.loadRangeReport());
    this.loadRangeReport();

    // Weekly Sales Chart
    try {
      const ctx = document.getElementById('weeklySalesChart');
      new Chart(ctx, {
        type: 'bar',
        data: {
          labels: weekLabels,
          datasets: [{
            label: 'Sales (LKR)',
            data: weekData,
            backgroundColor: 'rgba(67, 24, 255, 0.15)',
            borderColor: '#4318FF',
            borderWidth: 2,
            borderRadius: 8,
            borderSkipped: false,
          }]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { display: false } },
          scales: {
            y: { beginAtZero: true, suggestedMax: 1000, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => 'LKR ' + v.toLocaleString() } },
            x: { grid: { display: false } }
          }
        }
      });
    } catch(e) { console.error('Chart error:', e); }

    // Low Stock List
    const lowStockContainer = document.getElementById('dashLowStock');
    if (lowStock.length === 0) {
      lowStockContainer.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px">All stock levels are healthy ✅</p>';
    } else {
      lowStockContainer.innerHTML = lowStock.slice(0, 6).map(p => {
        const gpp = p.packetSizeGrams || 0;
        const stockDisplay = gpp > 0
          ? `${((p.stock || 0) / 1000).toFixed(2)} kg (${Math.floor((p.stock || 0) / gpp)} pkts)`
          : (p.stock || 0);
        const leftLabel = gpp > 0 ? `${Math.floor((p.stock || 0) / gpp)} pkts` : `${p.stock || 0} left`;
        return `
        <div class="low-stock-item">
          <div class="low-stock-item-info">
            <div class="low-stock-item-icon">${p.emoji || '📦'}</div>
            <div>
              <div class="low-stock-item-name">${p.name}</div>
              <div class="low-stock-item-qty">Stock: ${stockDisplay} / Min: ${p.reorderLevel || 5}</div>
            </div>
          </div>
          <span class="badge badge-danger">${leftLabel}</span>
        </div>
      `;
      }).join('');
    }

    // Recent Sales
    const recentContainer = document.getElementById('dashRecentSales');
    const recentSales = (await DB.getSales()).slice(0, 8);
    if (recentSales.length === 0) {
      recentContainer.innerHTML = '<p style="text-align:center;color:var(--text-secondary);padding:20px">No sales yet. Start billing!</p>';
    } else {
      recentContainer.innerHTML = `
        <table class="data-table">
          <thead><tr>
            <th>Invoice</th><th>Date</th><th>Items</th><th>Total</th><th>Payment</th><th>Status</th>
          </tr></thead>
          <tbody>
            ${recentSales.map(s => `
              <tr>
                <td><strong>${s.invoiceNo || 'N/A'}</strong></td>
                <td>${Utils.formatDateTime(s.createdAt)}</td>
                <td>${(s.itemCount || 0)} items</td>
                <td><strong>${Utils.currency(s.total)}</strong></td>
                <td><span class="badge badge-primary">${(s.paymentMethod || 'cash')}</span></td>
                <td><span class="badge badge-dot ${s.dueAmount > 0 ? 'badge-warning' : 'badge-success'}">${s.dueAmount > 0 ? 'Credit' : 'Paid'}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }
  },

  async loadRangeReport() {
    const fromInput = document.getElementById('dashRangeFrom');
    const toInput = document.getElementById('dashRangeTo');
    const resultsEl = document.getElementById('dashRangeResults');
    if (!fromInput || !toInput || !resultsEl) return;

    if (!fromInput.value || !toInput.value) {
      Toast.warning('Select Dates', 'Please choose both a start and end date');
      return;
    }

    const start = Utils.startOfDay(fromInput.value);
    const end = Utils.endOfDay(toInput.value);
    if (start > end) {
      Toast.warning('Invalid Range', '"From" date must be before or the same as the "To" date');
      return;
    }

    const sales = await DB.getSalesByDate(start, end);
    const expenses = (await DB.getExpenses()).filter(e => {
      const d = new Date(e.date);
      return d >= start && d <= end;
    });

    const totalSales = sales.reduce((sum, s) => sum + (s.total || 0), 0);
    const totalCost = sales.reduce((sum, s) => sum + (s.totalCost || 0), 0);
    const totalTax = sales.reduce((sum, s) => sum + (s.tax || 0), 0);
    const expensesTotal = expenses.reduce((sum, e) => sum + (e.amount || 0), 0);
    const netProfit = (totalSales - totalTax - totalCost) - expensesTotal;

    resultsEl.innerHTML = `
      <div class="stats-row" style="margin-bottom:0">
        <div class="stat-card">
          <div class="stat-card-icon blue">${Utils.icons.billing}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Total Sales</span>
            <span class="stat-card-value">${Utils.currency(totalSales)}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon green">${Utils.icons.profit}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Net Profit</span>
            <span class="stat-card-value">${Utils.currency(netProfit)}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon purple">${Utils.icons.billing}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Transactions</span>
            <span class="stat-card-value">${sales.length}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon coral">${Utils.icons.expenses}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Expenses</span>
            <span class="stat-card-value">${Utils.currency(expensesTotal)}</span>
          </div>
        </div>
      </div>
    `;
  }
};
