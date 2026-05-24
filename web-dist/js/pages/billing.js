/* ===== BILLING PAGE (Fast POS) ===== */
const BillingPage = {
  cart: [],
  products: [],
  categories: [],
  selectedCategory: null,
  searchQuery: '',
  customerId: null,
  paymentMethod: 'cash',
  discount: 0,
  amountPaid: 0,
  invoiceNo: '',
  _keyHandler: null,

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '0';
    content.style.overflow = 'hidden';

    this.cart = [];
    this.discount = 0;
    this.amountPaid = 0;
    this.paymentMethod = 'cash';
    this.customerId = null;
    this.invoiceNo = Utils.generateInvoiceNo('INV');

    this.products = await DB.getProducts();
    this.categories = await DB.getCategories();
    const customers = await DB.getCustomers();
    const settings = await DB.getAllSettings();
    this.taxRate = settings.taxEnabled === 'true' ? parseFloat(settings.taxRate || 0) : 0;
    this.taxName = settings.taxName || 'Tax';

    content.innerHTML = `
      <div class="billing-layout">
        <div class="billing-products">
          <div class="billing-search-row">
            <div class="billing-barcode-input">
              ${Utils.icons.barcode}
              <input type="text" id="barcodeInput" placeholder="Scan barcode or type code..." autofocus>
            </div>
            <div class="billing-search-input">
              ${Utils.icons.search}
              <input type="text" id="billingSearchInput" placeholder="Search product...">
            </div>
          </div>

          <div class="tabs" id="billingCategoryTabs">
            <div class="tab active" data-cat="all">All</div>
            ${this.categories.map(c => `<div class="tab" data-cat="${c.id}">${Utils.categoryEmoji(c.name)} ${c.name}</div>`).join('')}
          </div>

          <div class="product-grid" id="billingProductGrid"></div>
        </div>

        <div class="order-panel">
          <div class="order-panel-header">
            <h3>Order Summary</h3>
            <button class="btn btn-sm btn-outline" id="clearCartBtn">${Utils.icons.trash} Clear</button>
          </div>

          <div class="order-panel-info">
            <span>Invoice: <strong id="invoiceLabel">${this.invoiceNo}</strong></span>
            <div>
              <select id="customerSelect" class="form-select" style="padding:4px 28px 4px 8px;font-size:12px;border:none;background:transparent;min-width:120px">
                <option value="">Walk-in</option>
                ${customers.map(c => `<option value="${c.id}">${c.name}${c.balance > 0 ? ' (Due: ' + Utils.currency(c.balance) + ')' : ''}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="order-items" id="orderItems">
            <div class="empty-state" style="padding:40px 20px">
              <p style="font-size:var(--font-size-sm)">No items added yet.<br>Scan barcode or click products to add.</p>
            </div>
          </div>

          <div class="order-summary" id="orderSummary">
            <div class="order-summary-row">
              <span>Subtotal</span>
              <span id="subtotalValue">LKR 0.00</span>
            </div>
            <div class="order-summary-row">
              <span class="clickable" id="discountLabel">Discount</span>
              <span id="discountValue">LKR 0.00</span>
            </div>
            ${this.taxRate > 0 ? `<div class="order-summary-row"><span>${this.taxName} (${this.taxRate}%)</span><span id="taxValue">LKR 0.00</span></div>` : ''}
            <div class="order-summary-row total">
              <span>Total</span>
              <span id="totalValue">LKR 0.00</span>
            </div>
          </div>

          <div class="order-payment">
            <div class="order-payment-label">Payment Method</div>
            <div class="payment-methods" id="paymentMethods">
              <button class="payment-method-btn active" data-method="cash">${Utils.icons.cash} Cash</button>
              <button class="payment-method-btn" data-method="card">${Utils.icons.card} Card</button>
              <button class="payment-method-btn" data-method="bank">${Utils.icons.bank} Transfer</button>
              <button class="payment-method-btn" data-method="split">${Utils.icons.split} Split</button>
            </div>
            <div class="order-amount-row">
              <div class="form-group">
                <label>Amount Paid</label>
                <input type="number" class="form-input" id="amountPaidInput" value="0" min="0" step="0.01">
              </div>
              <div class="form-group">
                <label>Change</label>
                <input type="number" class="form-input" id="changeValue" value="0" readonly style="background:var(--success-light);color:var(--success-dark);font-weight:bold">
              </div>
            </div>
          </div>

          <div class="order-actions">
            <button class="btn btn-outline" id="printPreviewBtn">${Utils.icons.print} Print</button>
            <button class="btn btn-primary" id="placeOrderBtn">${Utils.icons.check} Place Order</button>
          </div>
        </div>
      </div>
    `;

    this.renderProducts();
    this.bindEvents();
  },

  renderProducts() {
    const grid = document.getElementById('billingProductGrid');
    let filtered = this.products;

    if (this.selectedCategory) {
      filtered = filtered.filter(p => p.categoryId === this.selectedCategory);
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      filtered = filtered.filter(p => p.name.toLowerCase().includes(q) || (p.barcode || '').includes(q) || (p.brand || '').toLowerCase().includes(q));
    }

    if (filtered.length === 0) {
      grid.innerHTML = '<div class="empty-state"><p>No products found</p></div>';
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const inCart = this.cart.find(c => c.productId === p.id);
      const lowStock = (p.stock || 0) <= (p.reorderLevel || 5);
      return `
        <div class="product-card" data-product-id="${p.id}">
          <div class="product-card-image">
            <span class="product-emoji">${p.emoji || '📦'}</span>
          </div>
          <div class="product-card-body">
            <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
            <div class="product-card-price">${Utils.currency(p.sellingPrice)}</div>
            <div class="product-card-stock ${lowStock ? 'low' : ''}">Stock: ${p.stock || 0}</div>
            ${inCart ? `
              <div class="qty-controls">
                <button class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
                <span class="qty-value">${inCart.quantity}</span>
                <button class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
              </div>
            ` : `
              <button class="product-card-add" data-add="${p.id}">+ Add to cart</button>
            `}
          </div>
        </div>
      `;
    }).join('');
  },

  renderCart() {
    const orderItems = document.getElementById('orderItems');

    if (this.cart.length === 0) {
      orderItems.innerHTML = '<div class="empty-state" style="padding:40px 20px"><p style="font-size:var(--font-size-sm)">No items added yet.</p></div>';
    } else {
      orderItems.innerHTML = this.cart.map((item, idx) => `
        <div class="order-item" data-idx="${idx}">
          <div class="order-item-icon">${item.emoji || '📦'}</div>
          <div class="order-item-details">
            <div class="order-item-name">${Utils.escapeHtml(item.name)}</div>
            <div class="order-item-meta">${Utils.currency(item.price)} each</div>
            <div class="order-item-qty-controls">
              <button data-cart-action="dec" data-idx="${idx}">−</button>
              <span>${item.quantity}</span>
              <button data-cart-action="inc" data-idx="${idx}">+</button>
            </div>
          </div>
          <div class="order-item-right">
            <div class="order-item-price">${Utils.currency(item.quantity * item.price)}</div>
            <button class="order-item-remove" data-cart-action="remove" data-idx="${idx}">${Utils.icons.close}</button>
          </div>
        </div>
      `).join('');
    }

    this.updateTotals();
  },

  updateTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    if (this.discount > subtotal) this.discount = subtotal;
    const taxableAmount = Math.max(0, subtotal - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;

    document.getElementById('subtotalValue').textContent = Utils.currency(subtotal);
    document.getElementById('discountValue').textContent = Utils.currency(this.discount);
    if (document.getElementById('taxValue')) {
      document.getElementById('taxValue').textContent = Utils.currency(tax);
    }
    document.getElementById('totalValue').textContent = Utils.currency(total);

    // Auto-set amount paid for cash
    const paidInput = document.getElementById('amountPaidInput');
    if (this.paymentMethod === 'card' || this.paymentMethod === 'bank') {
      paidInput.value = total.toFixed(2);
      this.amountPaid = total;
    }

    const paid = parseFloat(paidInput.value) || 0;
    const change = Math.max(0, paid - total);
    document.getElementById('changeValue').value = change.toFixed(2);
  },

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    if ((product.stock || 0) <= 0) {
      Toast.warning('Out of Stock', `${product.name} is out of stock`);
      return;
    }

    const existing = this.cart.find(c => c.productId === productId && !c.variationId);
    if (existing) {
      if (existing.quantity >= (product.stock || 0)) {
        Toast.warning('Stock Limit', `Only ${product.stock} available`);
        return;
      }
      existing.quantity++;
    } else {
      this.cart.push({
        productId: product.id,
        variationId: null,
        name: product.name,
        price: product.sellingPrice,
        costPrice: product.costPrice || 0,
        quantity: 1,
        emoji: product.emoji || '📦',
        discount: 0
      });
    }

    this.renderCart();
    this.renderProducts();
    Toast.success('Added', `${product.name} added to cart`);
  },

  async addVariationToCart(variation) {
    const product = this.products.find(p => p.id === variation.productId) || await DB.getProduct(variation.productId);
    if (!product) return;

    const variationStock = variation.stock ?? product.stock ?? 0;
    const variationName = variation.type ? `${product.name} - ${variation.type}` : product.name;
    if (variationStock <= 0) {
      Toast.warning('Out of Stock', `${variationName} is out of stock`);
      return;
    }

    const existing = this.cart.find(c => c.variationId === variation.id);
    if (existing) {
      if (existing.quantity >= variationStock) {
        Toast.warning('Stock Limit', `Only ${variationStock} available`);
        return;
      }
      existing.quantity++;
    } else {
      this.cart.push({
        productId: product.id,
        variationId: variation.id,
        name: variationName,
        price: variation.sellingPrice || product.sellingPrice,
        costPrice: variation.costPrice || product.costPrice || 0,
        quantity: 1,
        emoji: product.emoji || '📦',
        discount: 0
      });
    }

    this.renderCart();
    this.renderProducts();
    Toast.success('Added', `${variationName} added to cart`);
  },

  async handleBarcode(code, barcodeInput = null) {
    const normalizedCode = String(code || '').trim();
    if (!normalizedCode) return;

    const product = await DB.getProductByBarcode(normalizedCode);
    if (product) {
      this.addToCart(product.id);
      if (barcodeInput) barcodeInput.value = '';
      return;
    }

    const variation = await DB.getVariationByBarcode(normalizedCode);
    if (variation) {
      await this.addVariationToCart(variation);
      if (barcodeInput) barcodeInput.value = '';
      return;
    }

    Toast.error('Not Found', `No product with barcode: ${normalizedCode}`);
    if (barcodeInput) barcodeInput.value = '';
  },

  bindEvents() {
    const self = this;

    // Barcode input
    const barcodeInput = document.getElementById('barcodeInput');
    barcodeInput.addEventListener('keydown', async (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        await self.handleBarcode(barcodeInput.value, barcodeInput);
        barcodeInput.focus();
      }
    });
    barcodeInput.addEventListener('paste', () => {
      setTimeout(async () => {
        if (barcodeInput.value.trim()) {
          await self.handleBarcode(barcodeInput.value, barcodeInput);
          barcodeInput.focus();
        }
      }, 0);
    });

    // Product search
    document.getElementById('billingSearchInput').addEventListener('input', Utils.debounce((e) => {
      self.searchQuery = e.target.value;
      self.renderProducts();
    }, 200));

    // Category tabs
    document.getElementById('billingCategoryTabs').addEventListener('click', (e) => {
      const tab = e.target.closest('.tab');
      if (!tab) return;
      document.querySelectorAll('#billingCategoryTabs .tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const cat = tab.dataset.cat;
      self.selectedCategory = cat === 'all' ? null : parseInt(cat);
      self.renderProducts();
    });

    // Product grid clicks (add / qty)
    document.getElementById('billingProductGrid').addEventListener('click', (e) => {
      const addBtn = e.target.closest('[data-add]');
      if (addBtn) {
        self.addToCart(parseInt(addBtn.dataset.add));
        return;
      }
      const qtyBtn = e.target.closest('[data-action]');
      if (qtyBtn) {
        const id = parseInt(qtyBtn.dataset.id);
        const action = qtyBtn.dataset.action;
        const item = self.cart.find(c => c.productId === id);
        if (item) {
          if (action === 'inc') {
            const product = self.products.find(p => p.id === id);
            if (item.quantity < (product?.stock || 999)) item.quantity++;
          } else if (action === 'dec') {
            item.quantity--;
            if (item.quantity <= 0) self.cart = self.cart.filter(c => c.productId !== id);
          }
          self.renderCart();
          self.renderProducts();
        }
        return;
      }
      // Click on card itself
      const card = e.target.closest('.product-card');
      if (card && !e.target.closest('button')) {
        self.addToCart(parseInt(card.dataset.productId));
      }
    });

    // Cart actions
    document.getElementById('orderItems').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cart-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.cartAction;
      if (action === 'inc') {
        const p = self.products.find(x => x.id === self.cart[idx].productId);
        if (self.cart[idx].quantity >= (p?.stock || 0)) {
          Toast.warning('Stock Limit', `Only ${p?.stock || 0} available`);
          return;
        }
        self.cart[idx].quantity++;
      } else if (action === 'dec') {
        self.cart[idx].quantity--;
        if (self.cart[idx].quantity <= 0) self.cart.splice(idx, 1);
      } else if (action === 'remove') {
        self.cart.splice(idx, 1);
      }
      self.renderCart();
      self.renderProducts();
    });

    // Clear cart
    document.getElementById('clearCartBtn').addEventListener('click', () => {
      if (self.cart.length === 0) return;
      Modal.confirm('Clear Cart', 'Remove all items from the cart?', () => {
        self.cart = [];
        self.discount = 0;
        self.renderCart();
        self.renderProducts();
      });
    });

    // Payment method
    document.getElementById('paymentMethods').addEventListener('click', (e) => {
      const btn = e.target.closest('.payment-method-btn');
      if (!btn) return;
      document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      self.paymentMethod = btn.dataset.method;
      self.updateTotals();
    });

    // Amount paid input
    document.getElementById('amountPaidInput').addEventListener('input', (e) => {
      self.amountPaid = parseFloat(e.target.value) || 0;
      self.updateTotals();
    });

    // Discount click
    document.getElementById('discountLabel').addEventListener('click', () => {
      Modal.show({
        title: 'Apply Discount',
        content: `
          <div class="form-group">
            <label class="form-label">Discount Amount (LKR)</label>
            <input type="number" class="form-input" id="discountInput" value="${self.discount}" min="0" max="${self.cart.reduce((sum, item) => sum + item.quantity * item.price, 0)}" step="1" autofocus>
          </div>
        `,
        footer: `
          <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
          <button class="btn btn-primary" id="applyDiscountBtn">Apply</button>
        `
      });
      document.getElementById('applyDiscountBtn').addEventListener('click', () => {
        const subtotal = self.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
        const discount = parseFloat(document.getElementById('discountInput').value) || 0;
        if (discount > subtotal) {
          Toast.warning('Invalid Discount', 'Discount cannot be greater than subtotal');
          return;
        }
        self.discount = Math.max(0, discount);
        Modal.close();
        self.updateTotals();
      });
    });

    // Customer select
    document.getElementById('customerSelect').addEventListener('change', (e) => {
      self.customerId = e.target.value ? parseInt(e.target.value) : null;
    });

    // Place order
    document.getElementById('placeOrderBtn').addEventListener('click', () => self.placeOrder());
    document.getElementById('printPreviewBtn').addEventListener('click', () => self.previewReceipt());

    // Keyboard shortcuts
    if (self._keyHandler) {
      document.removeEventListener('keydown', self._keyHandler);
    }
    self._keyHandler = (e) => {
      if (Sidebar.currentPage !== 'billing') return;
      if (e.key === 'F2') { e.preventDefault(); self.newOrder(); }
      if (e.key === 'F4') { e.preventDefault(); document.getElementById('amountPaidInput').focus(); }
      if (e.key === 'F8') { e.preventDefault(); self.placeOrder(); }
      if (e.key === 'F9') { e.preventDefault(); barcodeInput.focus(); }
    };
    document.addEventListener('keydown', self._keyHandler);
  },

  async placeOrder() {
    if (this.cart.length === 0) {
      Toast.warning('Empty Cart', 'Add items to place an order');
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    if (this.discount > subtotal) {
      Toast.warning('Invalid Discount', 'Discount cannot be greater than subtotal');
      return;
    }
    const taxableAmount = Math.max(0, subtotal - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;
    const amountPaid = parseFloat(document.getElementById('amountPaidInput').value) || 0;
    const change = Math.max(0, amountPaid - total);
    const dueAmount = Math.max(0, total - amountPaid);
    const customer = this.customerId ? await DB.getCustomer(this.customerId) : null;
    const availableCredit = customer?.creditBalance || 0;
    const remainingAfterCredit = Math.max(0, dueAmount - availableCredit);

    if (amountPaid <= 0 && this.paymentMethod === 'cash' && remainingAfterCredit > 0) {
      Toast.warning('Enter Amount', 'Please enter the amount paid');
      document.getElementById('amountPaidInput').focus();
      return;
    }
    if (remainingAfterCredit > 0 && !this.customerId) {
      Toast.warning('Select Customer', 'Partial payments must be assigned to a customer so the due amount is tracked');
      document.getElementById('customerSelect').focus();
      return;
    }

    const sale = {
      invoiceNo: this.invoiceNo,
      customerId: this.customerId,
      cashierId: App.currentUser?.id || 1,
      cashierName: App.currentUser?.name || 'Admin',
      subtotal, tax, discount: this.discount, total,
      taxRate: this.taxRate,
      taxName: this.taxName,
      paymentMethod: this.paymentMethod,
      amountPaid, change, dueAmount,
      totalCost: this.cart.reduce((sum, item) => sum + item.quantity * (item.costPrice || 0), 0),
      itemCount: this.cart.reduce((sum, item) => sum + item.quantity, 0),
      items: this.cart.map(item => ({
        productId: item.productId,
        variationId: item.variationId || null,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        costPrice: item.costPrice || 0,
        discount: item.discount || 0,
        total: item.quantity * item.price - (item.discount || 0)
      }))
    };

    try {
      const saleId = await DB.addSale(sale);
      sale.id = saleId;
      this.products = await DB.getProducts();

      Toast.success('Order Placed!', `Invoice ${sale.invoiceNo} — ${Utils.currency(total)}`);

      // Auto print
      const saleItems = sale.items;
      Receipt.print(sale, saleItems);

      // Start new order
      this.newOrder();
      Sidebar.updateLowStockBadge();
    } catch (err) {
      Toast.error('Error', 'Failed to save order: ' + err.message);
    }
  },

  async previewReceipt() {
    if (this.cart.length === 0) { Toast.warning('Empty Cart', 'Add items first'); return; }
    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    if (this.discount > subtotal) {
      Toast.warning('Invalid Discount', 'Discount cannot be greater than subtotal');
      return;
    }
    const taxableAmount = Math.max(0, subtotal - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;
    const amountPaid = parseFloat(document.getElementById('amountPaidInput').value) || 0;
    const sale = {
      invoiceNo: this.invoiceNo, subtotal, tax, discount: this.discount, total,
      taxRate: this.taxRate,
      taxName: this.taxName,
      paymentMethod: this.paymentMethod, amountPaid,
      change: Math.max(0, amountPaid - total),
      dueAmount: Math.max(0, total - amountPaid),
      customerId: this.customerId,
      cashierName: App.currentUser?.name || 'Admin',
      createdAt: new Date()
    };
    Receipt.previewWithFormatChooser(sale, this.cart.map(item => ({
      name: item.name, quantity: item.quantity, price: item.price, discount: item.discount || 0
    })));
  },

  newOrder() {
    this.cart = [];
    this.discount = 0;
    this.amountPaid = 0;
    this.paymentMethod = 'cash';
    this.customerId = null;
    this.invoiceNo = Utils.generateInvoiceNo('INV');
    document.getElementById('invoiceLabel').textContent = this.invoiceNo;
    document.getElementById('customerSelect').value = '';
    document.getElementById('amountPaidInput').value = '0';
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.payment-method-btn[data-method="cash"]').classList.add('active');
    this.renderCart();
    this.renderProducts();
    document.getElementById('barcodeInput').focus();
  }
};
