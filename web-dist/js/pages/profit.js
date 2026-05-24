/* ===== PROFIT PAGE ===== */
const ProfitPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';

    const today = new Date();
    const todaySales = await DB.getDailySales(today);
    const monthlySales = await DB.getMonthlySales(today.getFullYear(), today.getMonth());
    const products = await DB.getProducts();
    const expenses = await DB.getExpenses();

    const todayRevenue = todaySales.reduce((s, sale) => s + ((sale.total || 0) - (sale.tax || 0)), 0);
    const todayCost = todaySales.reduce((s, sale) => s + (sale.totalCost || 0), 0);
    const todayExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.toDateString() === today.toDateString();
    }).reduce((s, e) => s + (e.amount || 0), 0);
    const todayProfit = todayRevenue - todayCost - todayExpenses;

    const monthRevenue = monthlySales.reduce((s, sale) => s + ((sale.total || 0) - (sale.tax || 0)), 0);
    const monthCost = monthlySales.reduce((s, sale) => s + (sale.totalCost || 0), 0);
    const monthProfit = monthRevenue - monthCost;

    const monthExpenses = expenses.filter(e => {
      const d = new Date(e.date);
      return d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
    }).reduce((s, e) => s + (e.amount || 0), 0);

    const netProfit = monthProfit - monthExpenses;

    content.innerHTML = `
      <div class="page-header"><h2>Profit Overview</h2></div>

      <div class="stats-row">
        <div class="stat-card"><div class="stat-card-icon green">${Utils.icons.profit}</div>
          <div class="stat-card-info"><span class="stat-card-label">Today Net Profit</span>
            <span class="stat-card-value" style="color:${todayProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.currency(todayProfit)}</span></div></div>
        <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.profit}</div>
          <div class="stat-card-info"><span class="stat-card-label">Monthly Gross Profit</span>
            <span class="stat-card-value">${Utils.currency(monthProfit)}</span></div></div>
        <div class="stat-card"><div class="stat-card-icon coral">${Utils.icons.expenses}</div>
          <div class="stat-card-info"><span class="stat-card-label">Monthly Expenses</span>
            <span class="stat-card-value">${Utils.currency(monthExpenses)}</span></div></div>
        <div class="stat-card"><div class="stat-card-icon purple">${Utils.icons.profit}</div>
          <div class="stat-card-info"><span class="stat-card-label">Net Profit</span>
            <span class="stat-card-value" style="color:${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.currency(netProfit)}</span></div></div>
      </div>

      <div class="dashboard-grid">
        <div class="dashboard-chart-card">
          <div class="dashboard-chart-header"><h4>Profit vs Cost (This Month)</h4></div>
          <div style="height:250px"><canvas id="profitChart"></canvas></div>
        </div>
        <div class="dashboard-chart-card">
          <div class="dashboard-chart-header"><h4>Top Profitable Items</h4></div>
          <div id="profitableItems"></div>
        </div>
      </div>

      <div class="content-card" style="margin-top:20px">
        <div class="content-card-header"><h3>Product Cost vs Selling Price</h3></div>
        <div class="content-card-body">
          <table class="data-table"><thead><tr><th>Product</th><th>Cost Price</th><th>Selling Price</th><th>Margin</th><th>Margin %</th></tr></thead>
          <tbody>${products.slice(0, 30).map(p => {
            const margin = (p.sellingPrice || 0) - (p.costPrice || 0);
            const pct = p.sellingPrice > 0 ? ((margin / p.sellingPrice) * 100).toFixed(1) : 0;
            return `<tr><td><strong>${p.name}</strong></td><td>${Utils.currency(p.costPrice)}</td>
              <td>${Utils.currency(p.sellingPrice)}</td>
              <td style="color:${margin >= 0 ? 'var(--success-dark)' : 'var(--danger)'}">${Utils.currency(margin)}</td>
              <td><span class="badge ${margin >= 0 ? 'badge-success' : 'badge-danger'}">${pct}%</span></td></tr>`;
          }).join('')}</tbody></table>
        </div>
      </div>
    `;

    // Profit chart
    try {
      const dailyData = {};
      monthlySales.forEach(s => {
        const day = new Date(s.createdAt).getDate();
        if (!dailyData[day]) dailyData[day] = { revenue: 0, cost: 0 };
        dailyData[day].revenue += (s.total || 0) - (s.tax || 0);
        dailyData[day].cost += s.totalCost || 0;
      });
      const labels = Object.keys(dailyData).sort((a,b) => a-b);
      new Chart(document.getElementById('profitChart'), {
        type: 'bar', data: {
          labels,
          datasets: [
            { label: 'Net Revenue', data: labels.map(d => dailyData[d].revenue), backgroundColor: 'rgba(67,24,255,0.2)', borderColor: '#4318FF', borderWidth: 1 },
            { label: 'Cost', data: labels.map(d => dailyData[d].cost), backgroundColor: 'rgba(255,181,71,0.2)', borderColor: '#FFB547', borderWidth: 1 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } },
          scales: { y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
      });
    } catch(e) {}

    // Top profitable items
    const profitableDiv = document.getElementById('profitableItems');
    const sorted = [...products].sort((a, b) => ((b.sellingPrice||0)-(b.costPrice||0)) - ((a.sellingPrice||0)-(a.costPrice||0)));
    profitableDiv.innerHTML = sorted.slice(0, 8).map(p => {
      const margin = (p.sellingPrice||0) - (p.costPrice||0);
      return `<div class="low-stock-item">
        <div class="low-stock-item-info"><div class="low-stock-item-icon">${p.emoji || '📦'}</div>
          <div><div class="low-stock-item-name">${p.name}</div>
            <div style="font-size:11px;color:var(--text-secondary)">Cost: ${Utils.currency(p.costPrice)} → Sell: ${Utils.currency(p.sellingPrice)}</div></div></div>
        <span class="badge badge-success">+${Utils.currency(margin)}</span></div>`;
    }).join('');
  }
};
