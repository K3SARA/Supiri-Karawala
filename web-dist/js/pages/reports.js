/* ===== REPORTS PAGE ===== */
const ReportsPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';

    content.innerHTML = `
      <div class="page-header"><h2>Reports</h2></div>
      <div class="report-filters">
        <select class="form-select" id="reportType" style="min-width:200px">
          <option value="daily">Daily Sales</option>
          <option value="monthly">Monthly Sales</option>
          <option value="bestSelling">Best Selling Items</option>
          <option value="itemWise">Item Wise Sales (Daily)</option>
          <option value="lowStock">Low Stock Report</option>
          <option value="stock">Stock Report</option>
          <option value="profit">Profit Report</option>
        </select>
        <input type="date" class="form-input" id="reportDate" value="${Utils.today()}" style="width:auto">
        <button class="btn btn-primary" id="generateReportBtn">${Utils.icons.reports} Generate</button>
        <button class="btn btn-outline" id="exportReportBtn">${Utils.icons.download} Export CSV</button>
      </div>
      <div class="content-card" id="reportOutput" style="min-height:300px">
        <div class="content-card-body"><p style="text-align:center;color:var(--text-secondary);padding:40px">Select a report type and click Generate</p></div>
      </div>
    `;

    document.getElementById('generateReportBtn').addEventListener('click', () => this.generateReport());
    document.getElementById('exportReportBtn').addEventListener('click', () => this.exportReport());
    this.generateReport();
  },

  async generateReport() {
    const type = document.getElementById('reportType').value;
    const date = new Date(document.getElementById('reportDate').value);
    const output = document.getElementById('reportOutput');

    switch(type) {
      case 'daily': await this.dailySalesReport(date, output); break;
      case 'monthly': await this.monthlySalesReport(date, output); break;
      case 'bestSelling': await this.bestSellingReport(output); break;
      case 'itemWise': await this.itemWiseReport(date, output); break;
      case 'lowStock': await this.lowStockReport(output); break;
      case 'stock': await this.stockReport(output); break;
      case 'profit': await this.profitReport(date, output); break;
    }
  },

  async dailySalesReport(date, output) {
    const sales = await DB.getDailySales(date);
    const expenses = (await DB.getExpenses()).filter(e => new Date(e.date).toDateString() === date.toDateString());
    const total = sales.reduce((s, sale) => s + (sale.total || 0), 0);
    const expensesTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const profit = sales.reduce((s, sale) => s + ((sale.total || 0) - (sale.tax || 0) - (sale.totalCost || 0)), 0) - expensesTotal;
    output.innerHTML = `
      <div class="content-card-header"><h3>Daily Sales — ${Utils.formatDate(date)}</h3></div>
      <div class="content-card-body">
        <div class="stats-row" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Total Sales</span><span class="stat-card-value">${Utils.currency(total)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon green">${Utils.icons.profit}</div>
            <div class="stat-card-info"><span class="stat-card-label">Net Profit</span><span class="stat-card-value">${Utils.currency(profit)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon purple">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Transactions</span><span class="stat-card-value">${sales.length}</span></div></div>
        </div>
        <table class="data-table"><thead><tr><th>Invoice</th><th>Time</th><th>Items</th><th>Payment</th><th>Total</th></tr></thead>
        <tbody>${sales.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px">No sales on this date</td></tr>' :
          sales.map(s => `<tr><td><strong>${s.invoiceNo}</strong></td><td>${Utils.formatTime(s.createdAt)}</td>
            <td>${s.itemCount || 0}</td><td><span class="badge badge-primary">${s.paymentMethod || 'cash'}</span></td>
            <td><strong>${Utils.currency(s.total)}</strong></td></tr>`).join('')}</tbody></table>
      </div>`;
    this._reportData = sales;
  },

  async monthlySalesReport(date, output) {
    const sales = await DB.getMonthlySales(date.getFullYear(), date.getMonth());
    const dailyMap = {};
    sales.forEach(s => {
      const day = new Date(s.createdAt).toDateString();
      if (!dailyMap[day]) dailyMap[day] = { total: 0, count: 0 };
      dailyMap[day].total += s.total || 0;
      dailyMap[day].count++;
    });
    const total = sales.reduce((s, sale) => s + (sale.total || 0), 0);
    const monthName = date.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    output.innerHTML = `
      <div class="content-card-header"><h3>Monthly Sales — ${monthName}</h3></div>
      <div class="content-card-body">
        <div class="stats-row" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Total Revenue</span><span class="stat-card-value">${Utils.currency(total)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon green">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Transactions</span><span class="stat-card-value">${sales.length}</span></div></div>
        </div>
        <div style="height:250px;margin-bottom:20px"><canvas id="monthlyChart"></canvas></div>
        <table class="data-table"><thead><tr><th>Date</th><th>Transactions</th><th>Revenue</th></tr></thead>
        <tbody>${Object.keys(dailyMap).sort().reverse().map(day => `<tr><td>${Utils.formatDate(new Date(day))}</td><td>${dailyMap[day].count}</td><td><strong>${Utils.currency(dailyMap[day].total)}</strong></td></tr>`).join('')}</tbody></table>
      </div>`;
    try {
      const labels = Object.keys(dailyMap).sort().map(d => new Date(d).getDate());
      const data = Object.keys(dailyMap).sort().map(d => dailyMap[d].total);
      new Chart(document.getElementById('monthlyChart'), {
        type: 'line', data: { labels, datasets: [{ label: 'Revenue', data, borderColor: '#4318FF', backgroundColor: 'rgba(67,24,255,0.1)', fill: true, tension: 0.4, borderWidth: 2 }] },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, suggestedMax: 1000, grid: { color: 'rgba(0,0,0,0.04)' } }, x: { grid: { display: false } } } }
      });
    } catch(e) {}
    this._reportData = sales;
  },

  async bestSellingReport(output) {
    const sales = await DB.getSales();
    const allItems = [];
    for (const sale of sales) {
      const items = await DB.getSaleItems(sale.id);
      const returnedQtyByItem = {};
      const returns = (await DB.getReturns()).filter(r => r.saleId === sale.id);
      for (const ret of returns) {
        const returnItems = await DB.getReturnItems(ret.id);
        for (const item of returnItems) {
          const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
          returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (item.quantity || 0);
        }
      }
      const adjustedItems = items.map(item => {
        const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
        const quantity = Math.max(0, (item.quantity || 0) - (returnedQtyByItem[key] || 0));
        return { ...item, quantity };
      }).filter(item => item.quantity > 0);
      const grossItemTotal = adjustedItems.reduce((s, item) => s + ((item.quantity || 0) * (item.price || 0)), 0);
      const saleNetRevenue = Math.max(0, (sale.total || 0) - (sale.tax || 0));
      allItems.push(...adjustedItems.map(item => {
        const grossRevenue = (item.quantity || 0) * (item.price || 0);
        const netRevenue = grossItemTotal > 0 ? (grossRevenue / grossItemTotal) * saleNetRevenue : 0;
        return { ...item, grossRevenue, netRevenue };
      }));
    }
    const itemMap = {};
    allItems.forEach(item => {
      const k = item.productId || item.name;
      if (!itemMap[k]) itemMap[k] = { name: item.name, qty: 0, revenue: 0, gramsPerPacket: item.gramsPerPacket || 0 };
      itemMap[k].qty += item.quantity || 0;
      itemMap[k].revenue += item.netRevenue || 0;
    });
    const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 20);
    output.innerHTML = `
      <div class="content-card-header"><h3>Best Selling Items</h3></div>
      <div class="content-card-body">
        <table class="data-table"><thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Net Revenue</th></tr></thead>
        <tbody>${sorted.map((item, i) => {
          const qtyLabel = item.gramsPerPacket > 0 ? `${item.qty} pkts` : item.qty;
          return `<tr><td>${i + 1}</td><td><strong>${item.name}</strong></td>
          <td><span class="badge badge-info">${qtyLabel}</span></td><td>${Utils.currency(item.revenue)}</td></tr>`;
        }).join('')}</tbody></table>
      </div>`;
    this._reportData = sorted;
  },

  async itemWiseReport(date, output) {
    const sales = await DB.getDailySales(date);
    const allItems = [];
    for (const sale of sales) {
      const items = await DB.getSaleItems(sale.id);
      const returnedQtyByItem = {};
      const returns = (await DB.getReturns()).filter(r => r.saleId === sale.id);
      for (const ret of returns) {
        const returnItems = await DB.getReturnItems(ret.id);
        for (const item of returnItems) {
          const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
          returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (item.quantity || 0);
        }
      }
      const adjustedItems = items.map(item => {
        const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
        const quantity = Math.max(0, (item.quantity || 0) - (returnedQtyByItem[key] || 0));
        return { ...item, quantity };
      }).filter(item => item.quantity > 0);
      const grossItemTotal = adjustedItems.reduce((s, item) => s + ((item.quantity || 0) * (item.price || 0)), 0);
      const saleNetRevenue = Math.max(0, (sale.total || 0) - (sale.tax || 0));
      allItems.push(...adjustedItems.map(item => {
        const grossRevenue = (item.quantity || 0) * (item.price || 0);
        const netRevenue = grossItemTotal > 0 ? (grossRevenue / grossItemTotal) * saleNetRevenue : 0;
        return { ...item, grossRevenue, netRevenue };
      }));
    }
    const itemMap = {};
    allItems.forEach(item => {
      const k = item.productId || item.name;
      if (!itemMap[k]) itemMap[k] = { name: item.name, qty: 0, revenue: 0, gramsPerPacket: item.gramsPerPacket || 0 };
      itemMap[k].qty += item.quantity || 0;
      itemMap[k].revenue += item.netRevenue || 0;
    });
    const sorted = Object.values(itemMap).sort((a, b) => b.qty - a.qty);
    const totalRev = sorted.reduce((s, item) => s + item.revenue, 0);
    output.innerHTML = `
      <div class="content-card-header"><h3>Item Wise Sales — ${Utils.formatDate(date)}</h3></div>
      <div class="content-card-body">
        <div class="stats-row" style="margin-bottom:20px">
          <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Total Item Revenue</span><span class="stat-card-value">${Utils.currency(totalRev)}</span></div></div>
        </div>
        <table class="data-table"><thead><tr><th>#</th><th>Product</th><th>Qty Sold</th><th>Net Revenue</th></tr></thead>
        <tbody>${sorted.length === 0 ? '<tr><td colspan="4" style="text-align:center;padding:20px">No items sold on this date</td></tr>' : sorted.map((item, i) => {
          const qtyLabel = item.gramsPerPacket > 0 ? `${item.qty} pkts` : item.qty;
          return `<tr><td>${i + 1}</td><td><strong>${item.name}</strong></td>
          <td><span class="badge badge-info">${qtyLabel}</span></td><td>${Utils.currency(item.revenue)}</td></tr>`;
        }).join('')}</tbody></table>
      </div>`;
    this._reportData = sorted;
  },

  async lowStockReport(output) {
    const lowStock = await DB.getLowStockProducts();
    output.innerHTML = `
      <div class="content-card-header"><h3>Low Stock Report (${lowStock.length} items)</h3></div>
      <div class="content-card-body">
        <table class="data-table"><thead><tr><th>Product</th><th>Current Stock</th><th>Reorder Level</th><th>Status</th></tr></thead>
        <tbody>${lowStock.map(p => {
          const gpp = p.packetSizeGrams || 0;
          const stockDisplay = gpp > 0 ? `${((p.stock || 0) / 1000).toFixed(2)} kg (${Math.floor((p.stock || 0) / gpp)} pkts)` : (p.stock || 0);
          const effective = gpp > 0 ? Math.floor((p.stock || 0) / gpp) : (p.stock || 0);
          return `<tr><td><strong>${p.name}</strong></td>
          <td><span class="badge badge-danger">${stockDisplay}</span></td><td>${p.reorderLevel || 5}</td>
          <td>${effective <= 0 ? '<span class="badge badge-danger">Out of Stock</span>' : '<span class="badge badge-warning">Low</span>'}</td></tr>`;
        }).join('')}</tbody></table>
      </div>`;
    this._reportData = lowStock;
  },

  async stockReport(output) {
    const products = await DB.getProducts();
    const productValue = p => {
      const gpp = p.packetSizeGrams || 0;
      const packets = gpp > 0 ? (p.stock || 0) / gpp : (p.stock || 0);
      return packets * (p.costPrice || 0);
    };
    const totalVal = products.reduce((s, p) => s + productValue(p), 0);
    output.innerHTML = `
      <div class="content-card-header"><h3>Stock Report — Value: ${Utils.currency(totalVal)}</h3></div>
      <div class="content-card-body">
        <table class="data-table"><thead><tr><th>Product</th><th>Barcode</th><th>Stock</th><th>Cost</th><th>Value</th></tr></thead>
        <tbody>${products.map(p => {
          const gpp = p.packetSizeGrams || 0;
          const stockDisplay = gpp > 0 ? `${((p.stock || 0) / 1000).toFixed(2)} kg` : (p.stock || 0);
          return `<tr><td><strong>${p.name}</strong></td><td>${p.barcode || '—'}</td>
          <td>${stockDisplay}</td><td>${Utils.currency(p.costPrice)}</td><td>${Utils.currency(productValue(p))}</td></tr>`;
        }).join('')}</tbody></table>
      </div>`;
    this._reportData = products;
  },

  async profitReport(date, output) {
    const sales = await DB.getDailySales(date);
    const expenses = (await DB.getExpenses()).filter(e => new Date(e.date).toDateString() === date.toDateString());
    const revenue = sales.reduce((s, sale) => s + ((sale.total || 0) - (sale.tax || 0)), 0);
    const cost = sales.reduce((s, sale) => s + (sale.totalCost || 0), 0);
    const expensesTotal = expenses.reduce((s, e) => s + (e.amount || 0), 0);
    const profit = revenue - cost - expensesTotal;
    output.innerHTML = `
      <div class="content-card-header"><h3>Profit Report — ${Utils.formatDate(date)}</h3></div>
      <div class="content-card-body">
        <div class="stats-row">
          <div class="stat-card"><div class="stat-card-icon blue">${Utils.icons.billing}</div>
            <div class="stat-card-info"><span class="stat-card-label">Revenue</span><span class="stat-card-value">${Utils.currency(revenue)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon coral">${Utils.icons.expenses}</div>
            <div class="stat-card-info"><span class="stat-card-label">Cost</span><span class="stat-card-value">${Utils.currency(cost)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon coral">${Utils.icons.expenses}</div>
            <div class="stat-card-info"><span class="stat-card-label">Expenses</span><span class="stat-card-value">${Utils.currency(expensesTotal)}</span></div></div>
          <div class="stat-card"><div class="stat-card-icon green">${Utils.icons.profit}</div>
            <div class="stat-card-info"><span class="stat-card-label">Net Profit</span><span class="stat-card-value" style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger)'}">${Utils.currency(profit)}</span></div></div>
        </div>
      </div>`;
  },

  exportReport() {
    if (!this._reportData || this._reportData.length === 0) { Toast.warning('No Data', 'Generate a report first'); return; }
    const data = this._reportData;
    const keys = Object.keys(data[0]);
    const csv = keys.join(',') + '\n' + data.map(r => keys.map(k => `"${r[k] || ''}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'report.csv'; a.click();
    Toast.success('Exported', 'Report exported to CSV');
  }
};
