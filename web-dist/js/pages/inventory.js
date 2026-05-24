/* ===== INVENTORY PAGE ===== */
const InventoryPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const products = await DB.getProducts();
    const lowStock = products.filter(p => (p.stock || 0) <= (p.reorderLevel || 5));
    const totalStock = products.reduce((s, p) => s + (p.stock || 0), 0);
    const totalValue = products.reduce((s, p) => s + (p.stock || 0) * (p.costPrice || 0), 0);
    const canAdjustStock = App.hasFullAccess();

    content.innerHTML = `
      <div class="page-header">
        <h2>Inventory</h2>
        ${canAdjustStock ? `
          <div class="page-header-actions">
            <button class="btn btn-success" id="stockInBtn">${Utils.icons.plus} Stock In</button>
            <button class="btn btn-warning" id="stockOutBtn">${Utils.icons.download} Stock Out</button>
            <button class="btn btn-danger" id="stockAdjustBtn">${Utils.icons.warning} Adjust</button>
          </div>
        ` : ''}
      </div>

      ${lowStock.length > 0 ? `
        <div class="alert-banner danger">
          ${Utils.icons.warning}
          <span><strong>${lowStock.length} items</strong> are below reorder level!</span>
        </div>
      ` : ''}

      <div class="stats-row" style="margin-bottom:20px">
        <div class="stat-card">
          <div class="stat-card-icon blue">${Utils.icons.products}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Total Products</span>
            <span class="stat-card-value">${products.length}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon green">${Utils.icons.inventory}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Total Stock Units</span>
            <span class="stat-card-value">${totalStock.toLocaleString()}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon purple">${Utils.icons.expenses}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Stock Value</span>
            <span class="stat-card-value">${Utils.currency(totalValue)}</span>
          </div>
        </div>
        <div class="stat-card">
          <div class="stat-card-icon coral">${Utils.icons.warning}</div>
          <div class="stat-card-info">
            <span class="stat-card-label">Low Stock Items</span>
            <span class="stat-card-value">${lowStock.length}</span>
          </div>
        </div>
      </div>

      <div id="inventoryTableContainer"></div>
    `;

    DataTable.render('inventoryTableContainer', {
      id: 'inventory',
      columns: [
        { key: 'emoji', label: '', render: r => `<span style="font-size:20px">${r.emoji || '📦'}</span>` },
        { key: 'name', label: 'Product', render: r => `<strong>${r.name}</strong>` },
        { key: 'barcode', label: 'Barcode' },
        { key: 'stock', label: 'Current Stock', render: r => {
          const low = (r.stock || 0) <= (r.reorderLevel || 5);
          return `<span class="badge ${low ? 'badge-danger badge-dot' : 'badge-success'}">${r.stock || 0}</span>`;
        }},
        { key: 'reorderLevel', label: 'Reorder Level' },
        { key: 'costPrice', label: 'Cost Price', render: r => Utils.currency(r.costPrice) },
        { key: 'stockValue', label: 'Stock Value', render: r => Utils.currency((r.stock || 0) * (r.costPrice || 0)) },
        { key: 'status', label: 'Status', render: r => {
          const s = r.stock || 0;
          const rl = r.reorderLevel || 5;
          if (s <= 0) return '<span class="badge badge-danger">Out of Stock</span>';
          if (s <= rl) return '<span class="badge badge-warning">Low Stock</span>';
          return '<span class="badge badge-success">In Stock</span>';
        }},
      ],
      data: products
    });

    if (canAdjustStock) {
      document.getElementById('stockInBtn').addEventListener('click', () => this.showAdjustmentForm('in'));
      document.getElementById('stockOutBtn').addEventListener('click', () => this.showAdjustmentForm('out'));
      document.getElementById('stockAdjustBtn').addEventListener('click', () => this.showAdjustmentForm('damaged'));
    }
  },

  async showAdjustmentForm(type) {
    if (!App.hasFullAccess()) {
      Toast.warning('Access Denied', 'Owner access required');
      return;
    }

    const products = await DB.getProducts();
    const typeLabels = { in: 'Stock In', out: 'Stock Out', damaged: 'Damaged/Lost' };
    Modal.show({
      title: typeLabels[type] || 'Stock Adjustment',
      content: `
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Product <span class="required">*</span></label>
          <select class="form-select" id="adjProduct">
            <option value="">Select product...</option>
            ${products.map(p => `<option value="${p.id}">${p.name} (Current: ${p.stock})</option>`).join('')}
          </select>
        </div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label class="form-label">Quantity <span class="required">*</span></label>
            <input type="number" class="form-input" id="adjQty" min="1" value="1">
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="adjType">
              <option value="in" ${type === 'in' ? 'selected' : ''}>Stock In</option>
              <option value="out" ${type === 'out' ? 'selected' : ''}>Stock Out</option>
              <option value="damaged" ${type === 'damaged' ? 'selected' : ''}>Damaged</option>
              <option value="lost" ${type === 'lost' ? 'selected' : ''}>Lost</option>
            </select>
          </div>
        </div>
        <div class="form-group" id="adjCostGroup" style="margin-bottom:16px;display:${type === 'in' ? 'block' : 'none'}">
          <label class="form-label">Unit Cost (LKR) <span class="required">*</span></label>
          <input type="number" class="form-input" id="adjCostPrice" min="0" step="0.01" value="0">
        </div>
        <div class="form-group">
          <label class="form-label">Reason</label>
          <textarea class="form-textarea" id="adjReason" placeholder="Enter reason..."></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveAdjBtn">Save Adjustment</button>
      `
    });

    const productSelect = document.getElementById('adjProduct');
    const typeSelect = document.getElementById('adjType');
    const costGroup = document.getElementById('adjCostGroup');
    const costInput = document.getElementById('adjCostPrice');
    const syncCostField = () => {
      const selectedType = typeSelect.value;
      costGroup.style.display = selectedType === 'in' ? 'block' : 'none';
      const product = products.find(p => p.id === parseInt(productSelect.value, 10));
      if (selectedType === 'in' && product && (!parseFloat(costInput.value) || costInput.value === '0')) {
        costInput.value = (product.costPrice || 0).toFixed(2);
      }
    };
    productSelect.addEventListener('change', syncCostField);
    typeSelect.addEventListener('change', syncCostField);

    document.getElementById('saveAdjBtn').addEventListener('click', async () => {
      const productId = parseInt(document.getElementById('adjProduct').value);
      const quantity = parseInt(document.getElementById('adjQty').value) || 0;
      const adjType = document.getElementById('adjType').value;
      const costPrice = parseFloat(document.getElementById('adjCostPrice').value) || 0;
      const reason = document.getElementById('adjReason').value.trim();

      if (!productId) { Toast.error('Required', 'Select a product'); return; }
      if (quantity <= 0) { Toast.error('Required', 'Enter a valid quantity'); return; }
      if (adjType === 'in' && costPrice <= 0) { Toast.error('Required', 'Enter a valid unit cost'); return; }

      await DB.addStockAdjustment({ productId, quantity, type: adjType, reason, costPrice });
      Toast.success('Adjusted', 'Stock updated successfully');
      Modal.close();
      this.render();
      Sidebar.updateLowStockBadge();
    });
    syncCostField();
  }
};
