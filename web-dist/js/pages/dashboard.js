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
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' }, ticks: { callback: v => 'LKR ' + v.toLocaleString() } },
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
      lowStockContainer.innerHTML = lowStock.slice(0, 6).map(p => `
        <div class="low-stock-item">
          <div class="low-stock-item-info">
            <div class="low-stock-item-icon">${p.emoji || '📦'}</div>
            <div>
              <div class="low-stock-item-name">${p.name}</div>
              <div class="low-stock-item-qty">Stock: ${p.stock} / Min: ${p.reorderLevel}</div>
            </div>
          </div>
          <span class="badge badge-danger">${p.stock} left</span>
        </div>
      `).join('');
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
  }
};
