/* ===== BILLS / SALES HISTORY PAGE ===== */
const BillsPage = {
  products: [],
  customers: [],

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const sales = await DB.getAllSales();
    const customers = await DB.getCustomers();
    const customerMap = {};
    customers.forEach(c => customerMap[c.id] = c.name);

    content.innerHTML = `
      <div class="page-header">
        <h2>Bills (${sales.length})</h2>
        <div class="page-header-actions">
          <button class="btn btn-primary" onclick="App.navigate('billing')">${Utils.icons.billing} New Sale</button>
        </div>
      </div>
      <div id="billsTableContainer"></div>
    `;

    DataTable.render('billsTableContainer', {
      id: 'bills',
      data: sales,
      pageSize: 12,
      emptyMessage: 'No bills found',
      columns: [
        { key: 'invoiceNo', label: 'Invoice', render: r => `<strong>${Utils.escapeHtml(r.invoiceNo || 'N/A')}</strong>` },
        { key: 'createdAt', label: 'Date', render: r => Utils.formatDateTime(r.createdAt) },
        { key: 'customerId', label: 'Customer', render: r => Utils.escapeHtml(customerMap[r.customerId] || 'Walk-in') },
        { key: 'itemCount', label: 'Items', render: r => r.itemCount || 0 },
        { key: 'paymentMethod', label: 'Payment', render: r => `<span class="badge badge-primary">${Utils.escapeHtml(r.paymentMethod || 'cash')}</span>` },
        { key: 'total', label: 'Total', render: r => `<strong>${Utils.currency(r.total || 0)}</strong>` },
        { key: 'status', label: 'Status', render: r => {
          const voided = r.status === 'voided';
          return `<span class="badge ${voided ? 'badge-danger' : (r.dueAmount > 0 ? 'badge-warning' : 'badge-success')}">${voided ? 'Voided' : (r.dueAmount > 0 ? 'Credit' : 'Paid')}</span>`;
        }},
      ],
      actions: row => `
        <button class="btn btn-sm btn-ghost" onclick="BillsPage.viewBill(${row.id})" title="View">${Utils.icons.eye}</button>
        ${row.status !== 'voided' ? `<button class="btn btn-sm btn-ghost" onclick="BillsPage.editBill(${row.id})" title="Edit">${Utils.icons.edit}</button>` : ''}
        <button class="btn btn-sm btn-ghost" onclick="BillsPage.previewBill(${row.id})" title="Print Preview">${Utils.icons.receipt || Utils.icons.eye}</button>
        <button class="btn btn-sm btn-ghost" onclick="BillsPage.reprintBill(${row.id})" title="Print">${Utils.icons.print}</button>
        ${row.status !== 'voided' ? `<button class="btn btn-sm btn-ghost" onclick="BillsPage.voidBill(${row.id})" title="Void" style="color:var(--danger)">${Utils.icons.trash}</button>` : ''}
      `,
      onRowClick: id => this.viewBill(parseInt(id, 10))
    });
  },

  async loadBill(id) {
    const sale = await DB.getSale(id);
    if (!sale) {
      Toast.error('Not Found', 'Bill not found');
      return null;
    }
    const items = await DB.getSaleItems(id);
    return { sale, items };
  },

  async viewBill(id) {
    const data = await this.loadBill(id);
    if (!data) return;
    const { sale, items } = data;
    const receiptItems = await Receipt.getReceiptItems(sale, items);
    const customer = sale.customerId ? await DB.getCustomer(sale.customerId) : null;

    Modal.show({
      title: `Bill ${sale.invoiceNo || ''}`,
      size: 'lg',
      content: `
        <div class="bill-detail-grid">
          <div><span class="text-secondary">Date</span><strong>${Utils.formatDateTime(sale.createdAt)}</strong></div>
          <div><span class="text-secondary">Customer</span><strong>${Utils.escapeHtml(customer?.name || 'Walk-in')}</strong></div>
          <div><span class="text-secondary">Cashier</span><strong>${Utils.escapeHtml(sale.cashierName || 'Admin')}</strong></div>
          <div><span class="text-secondary">Status</span><strong>${sale.status === 'voided' ? 'Voided' : 'Completed'}</strong></div>
        </div>
        <table class="data-table" style="margin-top:16px">
          <thead><tr><th>Item</th><th>Qty</th><th>Returned</th><th>Price</th><th>Total</th></tr></thead>
          <tbody>${receiptItems.length === 0 ? '<tr><td colspan="5" style="text-align:center;padding:20px;color:var(--text-secondary)">All items returned</td></tr>' : receiptItems.map(item => `
            <tr>
              <td><strong>${Utils.escapeHtml(item.name || 'Item')}</strong></td>
              <td>${item.quantity || 0}</td>
              <td>${item.returnedQty || 0}</td>
              <td>${Utils.currency(item.price || 0)}</td>
              <td><strong>${Utils.currency((item.quantity || 0) * (item.price || 0))}</strong></td>
            </tr>
          `).join('')}</tbody>
        </table>
        <div class="bill-summary-box">
          <div><span>Subtotal</span><strong>${Utils.currency(sale.subtotal || 0)}</strong></div>
          <div><span>Discount</span><strong>${Utils.currency(sale.discount || 0)}</strong></div>
          <div><span>Tax</span><strong>${Utils.currency(sale.tax || 0)}</strong></div>
          <div><span>Paid</span><strong>${Utils.currency(sale.amountPaid || 0)}</strong></div>
          <div><span>Due</span><strong>${Utils.currency(sale.dueAmount || 0)}</strong></div>
          <div class="bill-summary-total"><span>Total</span><strong>${Utils.currency(sale.total || 0)}</strong></div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Close</button>
        <button class="btn btn-outline" id="billPreviewBtn">${Utils.icons.eye} Print Preview</button>
        <button class="btn btn-primary" id="billPrintBtn">${Utils.icons.print} Print</button>
        ${sale.status !== 'voided' ? `<button class="btn btn-warning" id="billEditBtn">${Utils.icons.edit} Edit</button>` : ''}
      `
    });

    document.getElementById('billPreviewBtn').addEventListener('click', () => this.previewBill(id));
    document.getElementById('billPrintBtn').addEventListener('click', () => this.reprintBill(id));
    const editBtn = document.getElementById('billEditBtn');
    if (editBtn) editBtn.addEventListener('click', () => this.editBill(id));
  },

  async previewBill(id) {
    const data = await this.loadBill(id);
    if (!data) return;
    Receipt.previewWithFormatChooser(data.sale, data.items);
  },

  async reprintBill(id) {
    const data = await this.loadBill(id);
    if (!data) return;
    Receipt.printWithFormatChooser(data.sale, data.items);
  },

  async editBill(id) {
    const data = await this.loadBill(id);
    if (!data) return;
    if (data.sale.status === 'voided') {
      Toast.warning('Voided Bill', 'Voided bills cannot be edited');
      return;
    }
    const returns = (await DB.getReturns()).filter(r => r.saleId === id);
    if (returns.length > 0) {
      Toast.warning('Returned Bill', 'Bills with returns cannot be edited');
      return;
    }

    this.products = await DB.getProducts();
    this.customers = await DB.getCustomers();
    const items = data.items.map(item => ({ ...item }));
    const historicalTaxBase = Math.max(0, (data.sale.subtotal || 0) - (data.sale.discount || 0));
    const taxRate = data.sale.taxRate != null
      ? parseFloat(data.sale.taxRate || 0)
      : (historicalTaxBase > 0 ? ((data.sale.tax || 0) / historicalTaxBase) * 100 : 0);
    const taxName = data.sale.taxName || 'Tax';
    const editableAmountPaid = Math.max(0, (data.sale.amountPaid || 0) - (data.sale.creditApplied || 0) + (data.sale.creditReturned || 0));

    Modal.show({
      title: `Edit Bill ${data.sale.invoiceNo || ''}`,
      size: 'xl',
      content: `
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group">
            <label class="form-label">Customer</label>
            <select class="form-select" id="billCustomer">
              <option value="">Walk-in</option>
              ${this.customers.map(c => `<option value="${c.id}" ${data.sale.customerId === c.id ? 'selected' : ''}>${Utils.escapeHtml(c.name || '')}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Payment Method</label>
            <select class="form-select" id="billPaymentMethod">
              ${['cash', 'card', 'bank', 'split'].map(m => `<option value="${m}" ${data.sale.paymentMethod === m ? 'selected' : ''}>${m}</option>`).join('')}
            </select>
          </div>
        </div>
        <div id="billEditItems"></div>
        <button class="btn btn-sm btn-outline" id="billAddItemBtn" style="margin:12px 0">${Utils.icons.plus} Add Item</button>
        <div class="form-row" style="margin-top:8px">
          <div class="form-group"><label class="form-label">Discount</label><input type="number" class="form-input" id="billDiscount" value="${data.sale.discount || 0}" min="0" step="0.01"></div>
          <div class="form-group"><label class="form-label">Amount Paid</label><input type="number" class="form-input" id="billAmountPaid" value="${editableAmountPaid}" min="0" step="0.01"></div>
        </div>
        <div class="bill-summary-box" id="billEditTotals"></div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveBillEditBtn">${Utils.icons.check} Save Changes</button>
      `
    });

    const renderItems = () => {
      const container = document.getElementById('billEditItems');
      container.innerHTML = items.map((item, idx) => `
        <div class="bill-edit-row" data-idx="${idx}">
          <div class="form-group">
            <label class="form-label">Product</label>
            <select class="form-select bill-item-product" data-idx="${idx}">
              ${this.products.map(p => `<option value="${p.id}" ${item.productId === p.id ? 'selected' : ''}>${Utils.escapeHtml(p.name)} (${p.stock || 0} in stock)</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Qty</label>
            <input type="number" class="form-input bill-item-qty" data-idx="${idx}" value="${item.quantity || 1}" min="1">
          </div>
          <div class="form-group">
            <label class="form-label">Price</label>
            <input type="number" class="form-input bill-item-price" data-idx="${idx}" value="${item.price || 0}" min="0" step="0.01">
          </div>
          <button class="btn btn-sm btn-ghost bill-item-remove" data-idx="${idx}" style="color:var(--danger);align-self:end">${Utils.icons.trash}</button>
        </div>
      `).join('');
      bindItemEvents();
      updateTotals();
    };

    const syncItemsFromInputs = () => {
      items.forEach((item, idx) => {
        const productId = parseInt(document.querySelector(`.bill-item-product[data-idx="${idx}"]`)?.value, 10);
        const product = this.products.find(p => p.id === productId);
        item.productId = productId;
        item.name = product?.name || item.name;
        item.costPrice = product?.costPrice || item.costPrice || 0;
        item.quantity = parseInt(document.querySelector(`.bill-item-qty[data-idx="${idx}"]`)?.value, 10) || 1;
        item.price = parseFloat(document.querySelector(`.bill-item-price[data-idx="${idx}"]`)?.value) || 0;
        item.discount = item.discount || 0;
        item.total = item.quantity * item.price - (item.discount || 0);
      });
    };

    const updateTotals = () => {
      syncItemsFromInputs();
      const subtotal = items.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);
      let discount = parseFloat(document.getElementById('billDiscount')?.value) || 0;
      if (discount > subtotal) {
        discount = subtotal;
        document.getElementById('billDiscount').value = subtotal.toFixed(2);
      }
      const taxableAmount = Math.max(0, subtotal - discount);
      const tax = taxableAmount * (taxRate / 100);
      const total = taxableAmount + tax;
      const amountPaid = parseFloat(document.getElementById('billAmountPaid')?.value) || 0;
      const dueAmount = Math.max(0, total - amountPaid);
      const box = document.getElementById('billEditTotals');
      if (box) {
        box.innerHTML = `
          <div><span>Subtotal</span><strong>${Utils.currency(subtotal)}</strong></div>
          <div><span>${Utils.escapeHtml(taxName)} (${taxRate.toFixed(2)}%)</span><strong>${Utils.currency(tax)}</strong></div>
          <div><span>Due</span><strong>${Utils.currency(dueAmount)}</strong></div>
          <div class="bill-summary-total"><span>Total</span><strong>${Utils.currency(total)}</strong></div>
        `;
      }
    };

    const bindItemEvents = () => {
      document.querySelectorAll('.bill-item-product').forEach(el => {
        el.addEventListener('change', e => {
          const idx = parseInt(e.target.dataset.idx, 10);
          const product = this.products.find(p => p.id === parseInt(e.target.value, 10));
          if (product) {
            items[idx].name = product.name;
            items[idx].costPrice = product.costPrice || 0;
            items[idx].price = product.sellingPrice || 0;
            document.querySelector(`.bill-item-price[data-idx="${idx}"]`).value = items[idx].price;
          }
          updateTotals();
        });
      });
      document.querySelectorAll('.bill-item-qty, .bill-item-price').forEach(el => {
        el.addEventListener('input', updateTotals);
      });
      document.querySelectorAll('.bill-item-remove').forEach(el => {
        el.addEventListener('click', e => {
          if (items.length <= 1) {
            Toast.warning('Required', 'Bill must have at least one item');
            return;
          }
          items.splice(parseInt(e.currentTarget.dataset.idx, 10), 1);
          renderItems();
        });
      });
    };

    document.getElementById('billAddItemBtn').addEventListener('click', () => {
      const product = this.products[0];
      if (!product) {
        Toast.warning('No Products', 'Add products before editing bills');
        return;
      }
      items.push({
        productId: product.id,
        name: product.name,
        quantity: 1,
        price: product.sellingPrice || 0,
        costPrice: product.costPrice || 0,
        discount: 0,
        total: product.sellingPrice || 0
      });
      renderItems();
    });
    document.getElementById('billDiscount').addEventListener('input', updateTotals);
    document.getElementById('billAmountPaid').addEventListener('input', updateTotals);

    document.getElementById('saveBillEditBtn').addEventListener('click', async () => {
      syncItemsFromInputs();
      if (items.length === 0) { Toast.error('Required', 'Bill must have at least one item'); return; }
      if (items.some(item => !item.productId || item.quantity <= 0 || item.price < 0)) {
        Toast.error('Invalid', 'Check bill item product, quantity, and price');
        return;
      }

      const subtotal = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
      const discount = parseFloat(document.getElementById('billDiscount').value) || 0;
      if (discount > subtotal) {
        Toast.error('Invalid', 'Discount cannot be greater than subtotal');
        return;
      }
      const taxableAmount = Math.max(0, subtotal - discount);
      const tax = taxableAmount * (taxRate / 100);
      const total = taxableAmount + tax;
      const amountPaid = parseFloat(document.getElementById('billAmountPaid').value) || 0;
      const change = Math.max(0, amountPaid - total);
      const dueAmount = Math.max(0, total - amountPaid);

      try {
        await DB.updateSale(id, {
          ...data.sale,
          customerId: parseInt(document.getElementById('billCustomer').value, 10) || null,
          paymentMethod: document.getElementById('billPaymentMethod').value,
          subtotal,
          tax,
          taxRate,
          taxName,
          discount,
          total,
          amountPaid,
          change,
          dueAmount,
          totalCost: items.reduce((sum, item) => sum + item.quantity * (item.costPrice || 0), 0),
          itemCount: items.reduce((sum, item) => sum + item.quantity, 0),
          items: items.map(item => ({
            productId: item.productId,
            variationId: item.variationId || null,
            name: item.name,
            quantity: item.quantity,
            price: item.price,
            costPrice: item.costPrice || 0,
            discount: item.discount || 0,
            total: item.quantity * item.price - (item.discount || 0)
          }))
        });
        Toast.success('Updated', 'Bill updated successfully');
        Modal.close();
        this.render();
        Sidebar.updateLowStockBadge();
      } catch (err) {
        Toast.error('Error', err.message || 'Could not update bill');
      }
    });

    renderItems();
  },

  async voidBill(id) {
    const sale = await DB.getSale(id);
    if (!sale) return;
    Modal.confirm('Void Bill', `Void invoice ${sale.invoiceNo}? Stock and customer due balance will be reversed.`, async () => {
      try {
        await DB.voidSale(id);
        Toast.success('Voided', 'Bill voided and stock restored');
        this.render();
        Sidebar.updateLowStockBadge();
      } catch (err) {
        Toast.error('Error', err.message || 'Could not void bill');
      }
    });
  }
};
