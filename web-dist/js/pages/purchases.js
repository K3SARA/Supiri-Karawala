/* ===== PURCHASES PAGE ===== */
const PurchasesPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';
    const purchases = await DB.getPurchases();
    const suppliers = await DB.getSuppliers();
    const supMap = {}; suppliers.forEach(s => supMap[s.id] = s.name);

    content.innerHTML = `
      <div class="page-header">
        <h2>Purchases (${purchases.length})</h2>
        <button class="btn btn-primary" id="addPurchaseBtn">${Utils.icons.plus} New Purchase</button>
      </div>
      <div id="purchasesTableContainer"></div>
    `;
    DataTable.render('purchasesTableContainer', {
      id: 'purchases',
      columns: [
        { key: 'id', label: 'ID', render: r => `<strong>#PO-${r.id}</strong>` },
        { key: 'supplierId', label: 'Supplier', render: r => supMap[r.supplierId] || 'N/A' },
        { key: 'date', label: 'Date', render: r => Utils.formatDate(r.date || r.createdAt) },
        { key: 'itemCount', label: 'Items', render: r => r.itemCount || 0 },
        { key: 'totalCost', label: 'Total Cost', render: r => `<strong>${Utils.currency(r.totalCost)}</strong>` },
        { key: 'status', label: 'Status', render: r => `<span class="badge ${r.status === 'reversed' ? 'badge-danger' : 'badge-success'}">${r.status === 'reversed' ? 'Reversed' : 'Posted'}</span>` },
        { key: 'notes', label: 'Notes', render: r => r.notes || '—' },
      ],
      data: purchases,
      actions: row => row.status === 'reversed'
        ? '<span class="badge badge-neutral">No actions</span>'
        : `<button class="btn btn-sm btn-ghost" onclick="PurchasesPage.reversePurchase(${row.id})" title="Reverse" style="color:var(--danger)">${Utils.icons.trash}</button>`
    });
    document.getElementById('addPurchaseBtn').addEventListener('click', () => this.showPurchaseForm());
  },

  async showPurchaseForm() {
    const suppliers = await DB.getSuppliers();
    const products = await DB.getProducts();
    Modal.show({
      title: 'New Purchase Entry',
      size: 'xl',
      content: `
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group"><label class="form-label">Supplier <span class="required">*</span></label>
            <select class="form-select" id="poSupplier"><option value="">Select Supplier</option>
              ${suppliers.map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">Date</label>
            <input type="date" class="form-input" id="poDate" value="${Utils.today()}"></div>
        </div>
        <h4 style="margin-bottom:12px">Items</h4>
        <div id="poItemsList"></div>
        <button class="btn btn-sm btn-outline" id="poAddItemBtn" style="margin-top:12px">${Utils.icons.plus} Add Item</button>
        <div class="form-group" style="margin-top:16px"><label class="form-label">Notes</label>
          <input class="form-input" id="poNotes" placeholder="Optional notes"></div>
        <div style="text-align:right;margin-top:16px;font-size:var(--font-size-lg)">
          <strong>Total: <span id="poTotal">LKR 0.00</span></strong>
        </div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="savePOBtn">${Utils.icons.check} Save Purchase</button>`
    });
    let items = [{ productId: '', quantity: 1, buyingPrice: 0 }];
    const renderItems = () => {
      document.getElementById('poItemsList').innerHTML = items.map((item, i) => `
        <div class="form-row-3" style="margin-bottom:8px;align-items:end">
          <div class="form-group"><label class="form-label" style="font-size:11px">Product</label>
            <select class="form-select po-product" data-idx="${i}"><option value="">Select...</option>
              ${products.map(p => `<option value="${p.id}" ${item.productId == p.id ? 'selected' : ''}>${p.name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label" style="font-size:11px">Qty</label>
            <input type="number" class="form-input po-qty" data-idx="${i}" value="${item.quantity}" min="0.001" step="any"></div>
          <div class="form-group" style="display:flex;gap:8px;align-items:end">
            <div style="flex:1"><label class="form-label" style="font-size:11px">Price (LKR)</label>
              <input type="number" class="form-input po-price" data-idx="${i}" value="${item.buyingPrice}" min="0" step="0.01"></div>
            ${items.length > 1 ? `<button class="btn btn-sm btn-ghost po-remove" data-idx="${i}" style="color:var(--danger);margin-bottom:4px">${Utils.icons.trash}</button>` : ''}
          </div>
        </div>
      `).join('');
      // Update total
      let total = 0;
      items.forEach(it => total += (it.quantity || 0) * (it.buyingPrice || 0));
      document.getElementById('poTotal').textContent = Utils.currency(total);
      // Bind events
      document.querySelectorAll('.po-product').forEach(el => el.addEventListener('change', e => {
        const idx = parseInt(e.target.dataset.idx);
        items[idx].productId = parseInt(e.target.value);
        const prod = products.find(p => p.id === items[idx].productId);
        if (prod) items[idx].buyingPrice = prod.costPrice || 0;
        renderItems();
      }));
      document.querySelectorAll('.po-qty').forEach(el => el.addEventListener('input', e => { items[parseInt(e.target.dataset.idx)].quantity = parseFloat(e.target.value) || 0; renderItems(); }));
      document.querySelectorAll('.po-price').forEach(el => el.addEventListener('input', e => { items[parseInt(e.target.dataset.idx)].buyingPrice = parseFloat(e.target.value) || 0; renderItems(); }));
      document.querySelectorAll('.po-remove').forEach(el => el.addEventListener('click', e => { items.splice(parseInt(e.target.closest('[data-idx]').dataset.idx), 1); renderItems(); }));
    };
    renderItems();
    document.getElementById('poAddItemBtn').addEventListener('click', () => { items.push({ productId: '', quantity: 1, buyingPrice: 0 }); renderItems(); });
    document.getElementById('savePOBtn').addEventListener('click', async () => {
      const supplierId = parseInt(document.getElementById('poSupplier').value);
      if (!supplierId) { Toast.error('Required', 'Select a supplier'); return; }
      const validItems = items.filter(i => i.productId && i.quantity > 0);
      if (validItems.length === 0) { Toast.error('Required', 'Add at least one item'); return; }
      const totalCost = validItems.reduce((s, i) => s + i.quantity * i.buyingPrice, 0);
      await DB.addPurchase({
        supplierId, date: new Date(document.getElementById('poDate').value),
        notes: document.getElementById('poNotes').value, totalCost,
        itemCount: validItems.length, items: validItems
      });
      Toast.success('Saved', 'Purchase recorded and stock updated');
      Modal.close(); this.render();
    });
  },

  async reversePurchase(id) {
    const purchase = await DB.getPurchase(id);
    if (!purchase) return;
    Modal.confirm('Reverse Purchase', `Reverse PO-${id}? Stock and weighted cost will be adjusted back.`, async () => {
      try {
        await DB.reversePurchase(id);
        Toast.success('Reversed', `PO-${id} reversed`);
        this.render();
        Sidebar.updateLowStockBadge();
      } catch (err) {
        Toast.error('Error', err.message || 'Could not reverse purchase');
      }
    });
  }
};
