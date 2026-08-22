/* ===== INVENTORY PAGE ===== */
const InventoryPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const products = await DB.getProducts();
    const lowStock = products.filter(p => {
      const gpp = p.packetSizeGrams || 0;
      if (gpp > 0) return ((p.stock || 0) / gpp) <= (p.reorderLevel || 5);
      return (p.stock || 0) <= (p.reorderLevel || 5);
    });
    const totalKg = products.filter(p => p.packetSizeGrams > 0).reduce((s, p) => s + (p.stock || 0), 0) / 1000;
    const totalUnits = products.filter(p => !p.packetSizeGrams).reduce((s, p) => s + (p.stock || 0), 0);
    const totalStockDisplay = [
      totalKg > 0 ? `${totalKg.toFixed(1)} kg` : '',
      totalUnits > 0 ? `${totalUnits} units` : ''
    ].filter(Boolean).join(' + ') || '0';
    const totalValue = products.reduce((s, p) => {
      const gpp = p.packetSizeGrams || 0;
      const packets = gpp > 0 ? (p.stock || 0) / gpp : (p.stock || 0);
      return s + packets * (p.costPrice || 0);
    }, 0);
    const canManageStock = App.hasFullAccess();
    const canStockIn = App.canStockIn();

    content.innerHTML = `
      <div class="page-header">
        <h2>Inventory</h2>
        ${canStockIn ? `
          <div class="page-header-actions">
            <button class="btn btn-success" id="stockInBtn">${Utils.icons.plus} Stock In</button>
            ${canManageStock ? `
              <button class="btn btn-warning" id="stockOutBtn">${Utils.icons.download} Stock Out</button>
              <button class="btn btn-danger" id="stockAdjustBtn">${Utils.icons.warning} Adjust</button>
            ` : ''}
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
            <span class="stat-card-label">Total Stock</span>
            <span class="stat-card-value" style="font-size:14px">${totalStockDisplay}</span>
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
          const gpp = r.packetSizeGrams || 0;
          const stockText = gpp > 0 ? `${((r.stock || 0) / 1000).toFixed(2)} kg` : (r.stock || 0);
          const low = gpp > 0
            ? ((r.stock || 0) / gpp) <= (r.reorderLevel || 5)
            : (r.stock || 0) <= (r.reorderLevel || 5);
          return `<span class="badge ${low ? 'badge-danger badge-dot' : 'badge-success'}">${stockText}</span>`;
        }},
        { key: 'reorderLevel', label: 'Reorder Level' },
        { key: 'costPrice', label: 'Cost Price', render: r => Utils.currency(r.costPrice) },
        { key: 'stockValue', label: 'Stock Value', render: r => {
          const gpp = r.packetSizeGrams || 0;
          const packets = gpp > 0 ? (r.stock || 0) / gpp : (r.stock || 0);
          return Utils.currency(packets * (r.costPrice || 0));
        }},
        { key: 'status', label: 'Status', render: r => {
          const gpp = r.packetSizeGrams || 0;
          const effective = gpp > 0 ? ((r.stock || 0) / gpp) : (r.stock || 0);
          const rl = r.reorderLevel || 5;
          if (effective <= 0.001) return '<span class="badge badge-danger">Out of Stock</span>';
          if (effective <= rl) return '<span class="badge badge-warning">Low Stock</span>';
          return '<span class="badge badge-success">In Stock</span>';
        }},
      ],
      data: products
    });

    if (canStockIn) {
      document.getElementById('stockInBtn').addEventListener('click', () => this.showAdjustmentForm('in'));
    }
    if (canManageStock) {
      document.getElementById('stockOutBtn').addEventListener('click', () => this.showAdjustmentForm('out'));
      document.getElementById('stockAdjustBtn').addEventListener('click', () => this.showAdjustmentForm('damaged'));
    }
  },

  async showAdjustmentForm(type) {
    if (!App.hasFullAccess() && type !== 'in') {
      Toast.warning('Access Denied', 'Owner access required');
      return;
    }
    if (!App.canStockIn()) {
      Toast.warning('Access Denied', 'Owner access required');
      return;
    }

    const products = await DB.getProducts();
    const canManageStock = App.hasFullAccess();
    const typeLabels = { in: 'Stock In', out: 'Stock Out', damaged: 'Damaged/Lost' };
    Modal.show({
      title: typeLabels[type] || 'Stock Adjustment',
      content: `
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Product <span class="required">*</span></label>
          <select class="form-select" id="adjProduct">
            <option value="">Select product...</option>
            ${products.map(p => {
              const gpp = p.packetSizeGrams || 0;
              const stockDisplay = gpp > 0
                ? `${(p.stock / 1000).toFixed(2)}kg (${Math.floor(p.stock / gpp)} pkts)`
                : p.stock;
              return `<option value="${p.id}" data-gpp="${gpp}">${p.name} — Current: ${stockDisplay}</option>`;
            }).join('')}
          </select>
        </div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label class="form-label" id="adjQtyLabel">Quantity <span class="required">*</span></label>
            <input type="number" class="form-input" id="adjQty" min="0.001" step="any" value="1">
            <span id="adjQtyNote" style="font-size:11px;color:var(--primary);margin-top:3px;display:block;min-height:14px"></span>
          </div>
          <div class="form-group">
            <label class="form-label">Type</label>
            <select class="form-select" id="adjType">
              <option value="in" ${type === 'in' ? 'selected' : ''}>Stock In</option>
              ${canManageStock ? `
                <option value="out" ${type === 'out' ? 'selected' : ''}>Stock Out</option>
                <option value="damaged" ${type === 'damaged' ? 'selected' : ''}>Damaged</option>
                <option value="lost" ${type === 'lost' ? 'selected' : ''}>Lost</option>
              ` : ''}
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
    const typeSelect    = document.getElementById('adjType');
    const costGroup     = document.getElementById('adjCostGroup');
    const costInput     = document.getElementById('adjCostPrice');
    const adjQtyLabel   = document.getElementById('adjQtyLabel');
    const adjQtyInput   = document.getElementById('adjQty');
    const adjQtyNote    = document.getElementById('adjQtyNote');

    const syncQtyLabel = () => {
      const product = products.find(p => p.id === parseInt(productSelect.value, 10));
      const gpp = product?.packetSizeGrams || 0;
      if (gpp > 0) {
        adjQtyLabel.innerHTML = 'Quantity <span style="background:var(--primary);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;vertical-align:middle">GRAMS</span> <span class="required">*</span>';
        adjQtyInput.placeholder = `e.g. 400000 for 400kg`;
        const g = parseFloat(adjQtyInput.value) || 0;
        adjQtyNote.textContent = g > 0 ? `${(g / 1000).toFixed(2)} kg  ·  ${(g / gpp).toFixed(2)} packets` : '';
      } else {
        adjQtyLabel.innerHTML = 'Quantity <span class="required">*</span>';
        adjQtyInput.placeholder = '';
        adjQtyNote.textContent = '';
      }
    };

    adjQtyInput.addEventListener('input', () => {
      const product = products.find(p => p.id === parseInt(productSelect.value, 10));
      const gpp = product?.packetSizeGrams || 0;
      if (gpp > 0) {
        const g = parseFloat(adjQtyInput.value) || 0;
        adjQtyNote.textContent = g > 0 ? `${(g / 1000).toFixed(2)} kg  ·  ${(g / gpp).toFixed(2)} packets` : '';
      }
    });

    const syncCostField = () => {
      const selectedType = typeSelect.value;
      costGroup.style.display = selectedType === 'in' ? 'block' : 'none';
      const product = products.find(p => p.id === parseInt(productSelect.value, 10));
      if (selectedType === 'in' && product && (!parseFloat(costInput.value) || costInput.value === '0')) {
        costInput.value = (product.costPrice || 0).toFixed(2);
      }
    };
    productSelect.addEventListener('change', () => { syncCostField(); syncQtyLabel(); });
    typeSelect.addEventListener('change', syncCostField);

    document.getElementById('saveAdjBtn').addEventListener('click', async () => {
      const productId = parseInt(document.getElementById('adjProduct').value);
      const quantity = parseFloat(document.getElementById('adjQty').value) || 0;
      const adjType = document.getElementById('adjType').value;
      const costPrice = parseFloat(document.getElementById('adjCostPrice').value) || 0;
      const reason = document.getElementById('adjReason').value.trim();

      if (!App.hasFullAccess() && adjType !== 'in') {
        Toast.warning('Access Denied', 'Owner access required');
        return;
      }
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
