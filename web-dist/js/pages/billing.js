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
  selectedCustomerBalance: 0,

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
            <div class="billing-search-field">
              <span class="billing-search-label">Scan / Enter Code</span>
              <div class="billing-barcode-input">
                ${Utils.icons.barcode}
                <input type="text" id="barcodeInput" placeholder="Scan barcode or type code..." autofocus>
              </div>
            </div>
            <div class="billing-search-field">
              <span class="billing-search-label">Search by Name</span>
              <div class="billing-search-input">
                ${Utils.icons.search}
                <input type="text" id="billingSearchInput" placeholder="Search product...">
              </div>
            </div>
          </div>

          <div class="tabs" id="billingCategoryTabs">
            <div class="tab active" data-cat="all">All</div>
            ${this.categories.map(c => `<div class="tab" data-cat="${c.id}">${Utils.categoryEmoji(c.name)} ${c.name}</div>`).join('')}
          </div>

          <div class="product-grid" id="billingProductGrid"></div>

          <!-- Floating cart button for mobile -->
          <button class="floating-cart-btn" id="mobileCartToggleBtn" aria-label="View cart">
            ${Utils.icons.billing}
            <span class="floating-cart-badge" id="mobileCartCountBadge">0</span>
          </button>
        </div>

        <div class="order-panel" id="orderPanel">
          <div class="order-panel-header">
            <button class="btn-close-order-panel" id="closeOrderPanelBtn" aria-label="Close cart">
              ${Utils.icons.close}
            </button>
            <h3>Order Summary</h3>
            <button class="btn btn-sm btn-outline" id="clearCartBtn">${Utils.icons.trash} Clear</button>
          </div>

          <div class="order-panel-info" style="display:flex;flex-direction:column;gap:4px">
            <div style="display:flex;justify-content:space-between;align-items:center;width:100%">
              <span>Invoice: <strong id="invoiceLabel" style="font-size:11px">${this.invoiceNo}</strong></span>
              <div style="display:flex;align-items:center;gap:4px">
                <select id="customerSelect" class="form-select" style="padding:2px 8px;font-size:11px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg-secondary);color:var(--text-primary);max-width:160px;min-width:120px">
                  <option value="">Walk-in</option>
                  ${customers.map(c => `<option value="${c.id}">${c.name}${c.balance > 0 ? ' (' + Utils.currency(c.balance) + ')' : ''}</option>`).join('')}
                </select>
                <button type="button" class="btn btn-sm btn-outline" id="quickAddCustomerBtn" title="Add new customer" style="padding:2px 8px">${Utils.icons.plus}</button>
              </div>
            </div>
          </div>

          <div class="order-items" id="orderItems">
            <div class="empty-state" style="padding:40px 20px">
              <p style="font-size:var(--font-size-sm)">No items added yet.<br>Scan barcode or click products to add.</p>
            </div>
          </div>

          <div class="order-bottom">
          <div class="order-summary" id="orderSummary">
            <div class="order-summary-row">
              <span>Subtotal</span>
              <span id="subtotalValue">LKR 0.00</span>
            </div>
            <div class="order-summary-row" id="itemDiscountRow" style="display:none">
              <span>Item Discount</span>
              <span id="itemDiscountValue">LKR 0.00</span>
            </div>
            <div class="order-summary-row">
              <span class="clickable" id="discountLabel">Bill Discount</span>
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
              <button class="payment-method-btn" data-method="cheque">${Utils.icons.cheques} Cheque</button>
              <button class="payment-method-btn" data-method="credit">${Utils.icons.credit} Credit</button>
              <button class="payment-method-btn" data-method="split">${Utils.icons.split} Split</button>
            </div>
            <div id="chequeFieldsBilling" style="display:none;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:10px">
              <div class="form-row" style="margin-bottom:8px">
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Cheque No. <span class="required">*</span></label>
                  <input type="text" class="form-input" id="billChqNo" placeholder="000123" style="font-size:13px">
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Bank <span class="required">*</span></label>
                  <input type="text" class="form-input" id="billChqBank" placeholder="Bank of Ceylon" style="font-size:13px">
                </div>
              </div>
              <div class="form-row" style="margin-bottom:8px">
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Branch</label>
                  <input type="text" class="form-input" id="billChqBranch" placeholder="Colombo 7" style="font-size:13px">
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Drawer Name <span class="required">*</span></label>
                  <input type="text" class="form-input" id="billChqDrawer" placeholder="Name on cheque" style="font-size:13px">
                </div>
              </div>
              <div class="form-row">
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Received Date</label>
                  <input type="date" class="form-input" id="billChqReceived" value="${new Date().toISOString().split('T')[0]}" style="font-size:13px">
                </div>
                <div class="form-group">
                  <label class="form-label" style="font-size:11px">Due Date <span class="required">*</span></label>
                  <input type="date" class="form-input" id="billChqDue" style="font-size:13px">
                </div>
              </div>
              <div id="chequeLimitPanel"></div>
            </div>
            <div id="creditFieldsBilling" style="display:none;padding:10px 0 4px;border-top:1px solid var(--border);margin-top:10px">
              <div style="background:var(--danger-light);border:1.5px solid var(--danger);border-radius:var(--radius-md);padding:10px 12px;margin-bottom:10px">
                <div style="font-weight:700;font-size:12px;color:var(--danger-dark);margin-bottom:6px">⚠️ Credit Sale — will add to customer's outstanding balance</div>
                <div id="creditCustomerAlert" style="font-size:12px;color:var(--danger-dark);font-style:italic">Select a customer above to continue</div>
                <div id="creditBalancePanel" style="display:none">
                  <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0;border-top:1px dashed rgba(185,28,28,0.3);margin-top:4px">
                    <span>Current Outstanding:</span>
                    <span id="creditCurrentBalance" style="font-weight:600">LKR 0.00</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:12px;padding:3px 0">
                    <span>+ This Sale on Credit:</span>
                    <span id="creditThisSale" style="font-weight:600">LKR 0.00</span>
                  </div>
                  <div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0;border-top:1px dashed rgba(185,28,28,0.3);margin-top:2px">
                    <span style="font-weight:700">New Total Due:</span>
                    <span id="creditNewBalance" style="font-weight:700">LKR 0.00</span>
                  </div>
                </div>
              </div>
              <label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer;padding:6px 2px">
                <input type="checkbox" id="creditPartialCheck" style="width:15px;height:15px;cursor:pointer">
                <span>Customer pays partial amount now (rest on credit)</span>
              </label>
            </div>
            <div class="order-amount-row">
              <div class="form-group">
                <label id="amountPaidLabel">Amount Paid</label>
                <input type="number" class="form-input" id="amountPaidInput" value="0" min="0" step="0.01">
              </div>
              <div class="form-group">
                <label id="changeLabel">Change</label>
                <input type="number" class="form-input" id="changeValue" value="0" readonly style="background:var(--success-light);color:var(--success-dark);font-weight:bold">
              </div>
            </div>
          </div>

          </div><!-- /.order-bottom -->
          <div class="order-actions">
            <button class="btn btn-outline" id="printPreviewBtn">${Utils.icons.print} Print</button>
            <button class="btn btn-outline" id="shareInvoiceBtn">💬 Share</button>
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
      const gpp = p.packetSizeGrams || 0;
      const stockNum  = p.stock || 0;
      const lowStock  = gpp > 0 ? Math.floor(stockNum / gpp) <= (p.reorderLevel || 5) : stockNum <= (p.reorderLevel || 5);
      const stockText = gpp > 0
        ? `${(stockNum / 1000).toFixed(2)} kg (${Math.floor(stockNum / gpp)} pkts)`
        : `${stockNum}`;
      const priceLabel = gpp > 0
        ? `${Utils.currency(p.sellingPrice)} / ${gpp}g pkt`
        : Utils.currency(p.sellingPrice);
      const outOfStock = gpp > 0 ? Math.floor(stockNum / gpp) <= 0 : stockNum <= 0;
      return `
        <div class="product-card ${outOfStock ? 'out-of-stock' : ''}" data-product-id="${p.id}">
          <div class="product-card-image">
            <span class="product-emoji">${p.emoji || '📦'}</span>
          </div>
          <div class="product-card-body">
            <div class="product-card-name">${Utils.escapeHtml(p.name)}</div>
            <div class="product-card-price">${priceLabel}</div>
            <div class="product-card-stock ${lowStock ? 'low' : ''}">Stock: ${stockText}</div>
            ${inCart ? `
              <div class="qty-controls">
                <button class="qty-btn" data-action="dec" data-id="${p.id}">−</button>
                <input type="number" data-grid-qty="${p.id}" value="${inCart.quantity}" min="0.001" step="any"
                  style="width: 44px; text-align: center; font-weight: 600; padding: 2px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-input); color: var(--text-primary);">
                ${gpp > 0 ? '<span style="font-size:11px;margin-left:2px;color:var(--text-secondary)">pkts</span>' : ''}
                <button class="qty-btn" data-action="inc" data-id="${p.id}">+</button>
              </div>
            ` : outOfStock ? `
              <button class="product-card-add" data-add="${p.id}" disabled>Out of Stock</button>
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
      orderItems.innerHTML = this.cart.map((item, idx) => {
        const isPacket = (item.gramsPerPacket || 0) > 0;
        const totalGrams = isPacket ? item.quantity * item.gramsPerPacket : 0;
        const totalGramsText = totalGrams >= 1000 ? (totalGrams/1000).toFixed(3)+'kg' : totalGrams.toFixed(1)+'g';
        return `
        <div class="order-item" data-idx="${idx}" style="flex-direction: column; width: 100%">
          <div style="display:flex; justify-content:space-between; align-items:center; width:100%; margin-bottom:4px">
            <div class="order-item-name" style="font-weight:600; font-size:13px; color:var(--text-primary)">
              ${item.emoji || '📦'} ${Utils.escapeHtml(item.name)}
            </div>
            <div style="display:flex; align-items:center; gap:8px">
              <div class="order-item-price" style="font-weight:700; font-size:13px; color:var(--text-primary)">
                ${Utils.currency(item.quantity * item.price - (item.discount || 0))}
              </div>
              <button class="order-item-remove" data-cart-action="remove" data-idx="${idx}" style="margin:0">${Utils.icons.close}</button>
            </div>
          </div>

          ${isPacket ? `
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; font-size:11px; color:var(--text-secondary)">
              <div style="display:flex; align-items:center; gap:3px">
                <span>Pack:</span>
                <input type="number" data-cart-grams="${idx}" value="${item.gramsPerPacket}"
                  min="0.001" step="any"
                  style="width:50px; padding:2px 4px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
                <span>g</span>
              </div>
              
              <div style="display:flex; align-items:center; gap:3px">
                <span>Price:</span>
                <input type="number" data-cart-price="${idx}" value="${item.price}"
                  min="0" step="0.01"
                  style="width:65px; padding:2px 4px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
              </div>

              <div style="display:flex; align-items:center; gap:3px">
                <span>Disc:</span>
                <input type="number" data-cart-discount="${idx}" value="${item.discount || 0}"
                  min="0" step="0.01"
                  style="width:55px; padding:2px 4px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
              </div>
              
              <div style="color:var(--text-light)">
                (Total: <strong>${totalGramsText}</strong>)
              </div>
            </div>
          ` : `
            <div style="display:flex; align-items:center; flex-wrap:wrap; gap:6px; font-size:11px; color:var(--text-secondary)">
              <div style="display:flex; align-items:center; gap:3px">
                <span>Price:</span>
                <input type="number" data-cart-price="${idx}" value="${item.price}"
                  min="0" step="0.01"
                  style="width:65px; padding:2px 4px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
                <span>each</span>
              </div>
              <div style="display:flex; align-items:center; gap:3px">
                <span>Disc:</span>
                <input type="number" data-cart-discount="${idx}" value="${item.discount || 0}"
                  min="0" step="0.01"
                  style="width:55px; padding:2px 4px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
              </div>
            </div>
          `}

          <div class="order-item-qty-controls" style="margin-top:6px; gap:4px">
            <button data-cart-action="dec" data-idx="${idx}" style="width:20px; height:20px; font-size:12px; border-radius:var(--radius-sm)">−</button>
            <input type="number" data-cart-qty="${idx}" value="${item.quantity}" min="0.001" step="any"
              style="width:50px; text-align:center; font-weight:600; padding:1px; font-size:11px; border:1px solid var(--border); border-radius:var(--radius-sm); background:var(--bg-input); color:var(--text-primary)">
            <span style="font-size:11px; color:var(--text-secondary)">${isPacket ? 'pkts' : 'units'}</span>
            <button data-cart-action="inc" data-idx="${idx}" style="width:20px; height:20px; font-size:12px; border-radius:var(--radius-sm)">+</button>
          </div>
        </div>`;
      }).join('');
    }

    // Update mobile cart badge count
    const totalQty = this.cart.reduce((sum, item) => sum + item.quantity, 0);
    const badge = document.getElementById('mobileCartCountBadge');
    if (badge) badge.textContent = totalQty;

    this.updateTotals();
  },

  updateTotals() {
    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalItemDiscount = this.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    
    if (this.discount > (subtotal - totalItemDiscount)) this.discount = Math.max(0, subtotal - totalItemDiscount);
    const taxableAmount = Math.max(0, subtotal - totalItemDiscount - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;

    document.getElementById('subtotalValue').textContent = Utils.currency(subtotal);
    
    const itemDiscountRow = document.getElementById('itemDiscountRow');
    const itemDiscountVal = document.getElementById('itemDiscountValue');
    if (itemDiscountRow && itemDiscountVal) {
      if (totalItemDiscount > 0) {
        itemDiscountRow.style.display = 'flex';
        itemDiscountVal.textContent = Utils.currency(totalItemDiscount);
      } else {
        itemDiscountRow.style.display = 'none';
      }
    }

    document.getElementById('discountValue').textContent = Utils.currency(this.discount);
    if (document.getElementById('taxValue')) {
      document.getElementById('taxValue').textContent = Utils.currency(tax);
    }
    document.getElementById('totalValue').textContent = Utils.currency(total);

    const paidInput = document.getElementById('amountPaidInput');
    const chgInput  = document.getElementById('changeValue');

    if (this.paymentMethod === 'card' || this.paymentMethod === 'bank' || this.paymentMethod === 'cheque') {
      paidInput.value = total.toFixed(2);
      this.amountPaid = total;
    }

    if (this.paymentMethod === 'credit') {
      const isPartial = document.getElementById('creditPartialCheck')?.checked;
      if (!isPartial) {
        paidInput.value = '0';
        this.amountPaid = 0;
      }
      const onCredit = Math.max(0, total - (parseFloat(paidInput.value) || 0));
      if (chgInput) {
        chgInput.value = onCredit.toFixed(2);
        chgInput.style.cssText = 'background:var(--danger-light);color:var(--danger-dark);font-weight:bold';
      }
      const creditThisSaleEl = document.getElementById('creditThisSale');
      if (creditThisSaleEl) creditThisSaleEl.textContent = Utils.currency(onCredit);
      const creditNewBalEl = document.getElementById('creditNewBalance');
      if (creditNewBalEl) creditNewBalEl.textContent = Utils.currency(this.selectedCustomerBalance + onCredit);
    } else {
      const paid = parseFloat(paidInput.value) || 0;
      const change = Math.max(0, paid - total);
      if (chgInput) chgInput.value = change.toFixed(2);
    }
  },

  async updateChequeLimitPanel() {
    const panel = document.getElementById('chequeLimitPanel');
    if (!panel) return;

    if (!this.customerId) {
      panel.innerHTML = '<div style="font-size:12px;color:var(--text-secondary);font-style:italic;padding:6px 0">Select a customer to check cheque limit</div>';
      return;
    }

    const customer    = await DB.getCustomer(this.customerId);
    const stats       = await DB.getCustomerChequeStats(this.customerId);
    const chqLimit    = customer?.chequeLimit || 0;
    const usedPct     = chqLimit > 0 ? Math.min(100, Math.round(stats.passedAmount / chqLimit * 100)) : 0;
    const isExceeded  = chqLimit > 0 && stats.passedAmount > chqLimit;
    const isWarning   = chqLimit > 0 && !isExceeded && usedPct >= 80;
    const barColor    = isExceeded ? 'var(--danger)' : isWarning ? '#f59e0b' : 'var(--success)';
    const bgColor     = isExceeded ? 'var(--danger-light)' : isWarning ? '#fffbeb' : '#f0fdf4';
    const borderColor = isExceeded ? 'var(--danger)' : isWarning ? '#f59e0b' : 'var(--success)';

    panel.innerHTML = `
      <div style="background:${bgColor};border:1.5px solid ${borderColor};border-radius:var(--radius-md);padding:10px 12px;margin-top:10px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
          <span style="font-weight:700;font-size:12px">${Utils.icons.cheques} Cheque Limit Check</span>
          ${chqLimit > 0
            ? `<span style="font-size:11px;font-weight:700;color:${isExceeded ? 'var(--danger)' : isWarning ? '#92400e' : 'var(--success-dark)'}">${isExceeded ? '⚠️ EXCEEDED' : isWarning ? '⚠️ Near Limit' : '✅ OK'}</span>`
            : '<span style="font-size:11px;color:var(--text-secondary)">No limit set</span>'}
        </div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text-secondary)">Passed cheques:</span>
          <strong>${Utils.currency(stats.passedAmount)} (${stats.passedCount})</strong>
        </div>
        ${stats.pendingCount > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text-secondary)">Pending:</span>
          <strong style="color:#92400e">${Utils.currency(stats.pendingAmount)} (${stats.pendingCount})</strong>
        </div>` : ''}
        ${stats.bouncedCount > 0 ? `
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
          <span style="color:var(--text-secondary)">Bounced:</span>
          <strong style="color:var(--danger)">${Utils.currency(stats.bouncedAmount)} (${stats.bouncedCount})</strong>
        </div>` : ''}
        ${chqLimit > 0 ? `
          <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:4px">
            <span style="color:var(--text-secondary)">Cheque Limit:</span>
            <strong>${Utils.currency(chqLimit)}</strong>
          </div>
          <div style="height:8px;background:rgba(0,0,0,0.1);border-radius:var(--radius-full);overflow:hidden;margin:6px 0 4px">
            <div style="height:100%;width:${usedPct}%;background:${barColor};border-radius:var(--radius-full)"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:11px">
            <span style="color:${barColor};font-weight:600">${usedPct}% used</span>
            ${isExceeded
              ? `<span style="color:var(--danger);font-weight:700">Over by ${Utils.currency(stats.passedAmount - chqLimit)}</span>`
              : `<span style="color:var(--text-secondary)">Remaining: ${Utils.currency(chqLimit - stats.passedAmount)}</span>`}
          </div>
        ` : ''}
      </div>
    `;
  },

  async updateCreditPanel() {
    const alertEl      = document.getElementById('creditCustomerAlert');
    const balancePanel = document.getElementById('creditBalancePanel');
    if (!alertEl || !balancePanel) return;

    const subtotal          = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalItemDiscount = this.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    const taxableAmount = Math.max(0, subtotal - totalItemDiscount - this.discount);
    const tax           = taxableAmount * (this.taxRate / 100);
    const total         = taxableAmount + tax;
    const advance       = parseFloat(document.getElementById('amountPaidInput')?.value) || 0;
    const onCredit      = Math.max(0, total - advance);

    if (!this.customerId) {
      alertEl.style.display = 'block';
      balancePanel.style.display = 'none';
      this.selectedCustomerBalance = 0;
      return;
    }

    const customer = await DB.getCustomer(this.customerId);
    this.selectedCustomerBalance = customer?.balance || 0;

    alertEl.style.display = 'none';
    balancePanel.style.display = 'block';
    document.getElementById('creditCurrentBalance').textContent = Utils.currency(this.selectedCustomerBalance);
    document.getElementById('creditThisSale').textContent       = Utils.currency(onCredit);
    document.getElementById('creditNewBalance').textContent     = Utils.currency(this.selectedCustomerBalance + onCredit);
  },

  showQuickAddCustomer() {
    const self = this;
    Modal.show({
      title: 'Add New Customer',
      content: `
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Customer Name <span class="required">*</span></label>
          <input class="form-input" id="quickCustName" autofocus>
        </div>
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Phone</label>
          <input class="form-input" id="quickCustPhone">
        </div>
        <div class="form-group">
          <label class="form-label">Address</label>
          <textarea class="form-textarea" id="quickCustAddress" rows="2"></textarea>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveQuickCustBtn">Add</button>
      `
    });

    const save = async () => {
      const name = document.getElementById('quickCustName').value.trim();
      const phone = document.getElementById('quickCustPhone').value.trim();
      const address = document.getElementById('quickCustAddress').value.trim();
      if (!name) { Toast.error('Required', 'Customer name is required'); return; }

      const newId = await DB.addCustomer({ name, phone, address });
      Modal.close();
      Toast.success('Added', `${name} added and selected for this sale`);

      const customers = await DB.getCustomers();
      const select = document.getElementById('customerSelect');
      select.innerHTML = `<option value="">Walk-in</option>` +
        customers.map(c => `<option value="${c.id}">${Utils.escapeHtml(c.name)}${c.balance > 0 ? ' (' + Utils.currency(c.balance) + ')' : ''}</option>`).join('');
      select.value = String(newId);
      select.dispatchEvent(new Event('change'));
    };

    document.getElementById('saveQuickCustBtn').addEventListener('click', save);
    document.getElementById('quickCustName').addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  addToCart(productId) {
    const product = this.products.find(p => p.id === productId);
    if (!product) return;

    const gpp = product.packetSizeGrams || 0;   // grams per packet (0 = unit item)
    const minRequired = gpp > 0 ? gpp : 0.001;

    if ((product.stock || 0) < minRequired) {
      Toast.warning('Out of Stock', `${product.name} is out of stock`);
      return;
    }

    const existing = this.cart.find(c => c.productId === productId && !c.variationId);
    if (existing) {
      const nextDeduction = (existing.quantity + 1) * (existing.gramsPerPacket || 1);
      if (nextDeduction > (product.stock || 0)) {
        const avail = gpp > 0 ? (product.stock / existing.gramsPerPacket) : product.stock;
        Toast.warning('Stock Limit', gpp > 0 ? `Only ${avail.toFixed(2)} packets available` : `Only ${avail.toFixed(2)} available`);
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
        discount: 0,
        gramsPerPacket: gpp,
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
    if (variationStock <= 0.001) {
      Toast.warning('Out of Stock', `${variationName} is out of stock`);
      return;
    }

    const existing = this.cart.find(c => c.variationId === variation.id);
    if (existing) {
      if (existing.quantity >= variationStock) {
        Toast.warning('Stock Limit', `Only ${variationStock.toFixed(2)} available`);
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
        discount: 0,
        gramsPerPacket: product.packetSizeGrams || 0,
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
            const nextDeduction = (item.quantity + 1) * (item.gramsPerPacket || 1);
            if (nextDeduction > (product?.stock || 0)) {
              const avail = item.gramsPerPacket > 0
                ? ((product?.stock || 0) / item.gramsPerPacket)
                : (product?.stock || 0);
              Toast.warning('Stock Limit', item.gramsPerPacket > 0 ? `Only ${avail.toFixed(2)} packets available` : `Only ${avail.toFixed(2)} available`);
            } else {
              item.quantity++;
            }
          } else if (action === 'dec') {
            item.quantity--;
            if (item.quantity <= 0.001) self.cart = self.cart.filter(c => c.productId !== id);
          }
          self.renderCart();
          self.renderProducts();
        }
        return;
      }
      // Click on card itself (exclude button & input)
      const card = e.target.closest('.product-card');
      if (card && !card.classList.contains('out-of-stock') && !e.target.closest('button') && !e.target.closest('input')) {
        self.addToCart(parseInt(card.dataset.productId));
      }
    });

    // Product grid quantity manual edit
    document.getElementById('billingProductGrid').addEventListener('change', (e) => {
      if (e.target.dataset.gridQty !== undefined) {
        const id = parseInt(e.target.dataset.gridQty);
        const val = parseFloat(e.target.value) || 1;
        const item = self.cart.find(c => c.productId === id && !c.variationId);
        if (item) {
          const product = self.products.find(p => p.id === id);
          const quantity = Math.max(0.001, val);
          const nextDeduction = quantity * (item.gramsPerPacket || 1);
          if (product && nextDeduction > (product.stock || 0)) {
            const avail = item.gramsPerPacket > 0
              ? (product.stock / item.gramsPerPacket)
              : product.stock;
            Toast.warning('Stock Limit', item.gramsPerPacket > 0 ? `Only ${avail.toFixed(2)} packets available` : `Only ${avail.toFixed(2)} available`);
            e.target.value = item.quantity;
            return;
          }
          item.quantity = quantity;
          self.renderCart();
          self.renderProducts();
        }
      }
    });

    // Cart actions
    document.getElementById('orderItems').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-cart-action]');
      if (!btn) return;
      const idx = parseInt(btn.dataset.idx);
      const action = btn.dataset.cartAction;
      if (action === 'inc') {
        const p    = self.products.find(x => x.id === self.cart[idx].productId);
        const item = self.cart[idx];
        const nextDeduction = (item.quantity + 1) * (item.gramsPerPacket || 1);
        if (nextDeduction > (p?.stock || 0)) {
          const avail = item.gramsPerPacket > 0
            ? ((p?.stock || 0) / item.gramsPerPacket)
            : (p?.stock || 0);
          Toast.warning('Stock Limit', item.gramsPerPacket > 0 ? `Only ${avail.toFixed(2)} packets available` : `Only ${avail.toFixed(2)} available`);
          return;
        }
        item.quantity++;
      } else if (action === 'dec') {
        self.cart[idx].quantity--;
        if (self.cart[idx].quantity <= 0.001) self.cart.splice(idx, 1);
      } else if (action === 'remove') {
        self.cart.splice(idx, 1);
      }
      self.renderCart();
      self.renderProducts();
    });

    // Editable g/pkt and price inputs in cart (event delegation on orderItems)
    document.getElementById('orderItems').addEventListener('change', (e) => {
      if (e.target.dataset.cartGrams !== undefined) {
        const idx = parseInt(e.target.dataset.cartGrams);
        const val = parseFloat(e.target.value) || 1;
        if (self.cart[idx]) { self.cart[idx].gramsPerPacket = Math.max(0.001, val); self.renderCart(); }
      }
      if (e.target.dataset.cartPrice !== undefined) {
        const idx = parseInt(e.target.dataset.cartPrice);
        const val = parseFloat(e.target.value) || 0;
        if (self.cart[idx]) { self.cart[idx].price = Math.max(0, val); self.renderCart(); self.updateTotals(); }
      }
      if (e.target.dataset.cartQty !== undefined) {
        const idx = parseInt(e.target.dataset.cartQty);
        const val = parseFloat(e.target.value) || 1;
        const item = self.cart[idx];
        if (item) {
          const p = self.products.find(x => x.id === item.productId);
          const quantity = Math.max(0.001, val);
          const nextDeduction = quantity * (item.gramsPerPacket || 1);
          if (p && nextDeduction > (p.stock || 0)) {
            const avail = item.gramsPerPacket > 0
              ? (p.stock / item.gramsPerPacket)
              : p.stock;
            Toast.warning('Stock Limit', item.gramsPerPacket > 0 ? `Only ${avail.toFixed(2)} packets available` : `Only ${avail.toFixed(2)} available`);
            e.target.value = item.quantity;
            return;
          }
          item.quantity = quantity;
          self.renderCart();
          self.renderProducts();
        }
      }
      if (e.target.dataset.cartDiscount !== undefined) {
        const idx = parseInt(e.target.dataset.cartDiscount);
        const val = parseFloat(e.target.value) || 0;
        const item = self.cart[idx];
        if (item) {
          const maxDiscount = item.quantity * item.price;
          if (val > maxDiscount) {
            Toast.warning('Invalid Discount', 'Discount cannot be greater than item total');
            e.target.value = item.discount;
            return;
          }
          item.discount = Math.max(0, val);
          self.renderCart();
        }
      }
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

      const chqFields = document.getElementById('chequeFieldsBilling');
      if (chqFields) chqFields.style.display = btn.dataset.method === 'cheque' ? 'block' : 'none';
      if (btn.dataset.method === 'cheque') self.updateChequeLimitPanel();

      const creditFields = document.getElementById('creditFieldsBilling');
      const paidInput    = document.getElementById('amountPaidInput');
      const amtLabel     = document.getElementById('amountPaidLabel');
      const chgLabel     = document.getElementById('changeLabel');
      const chgInput     = document.getElementById('changeValue');

      if (btn.dataset.method === 'credit') {
        if (creditFields) creditFields.style.display = 'block';
        if (amtLabel) amtLabel.textContent = 'Advance Payment';
        if (chgLabel) chgLabel.textContent = 'On Credit';
        if (paidInput) { paidInput.value = '0'; paidInput.disabled = true; }
        if (chgInput) chgInput.style.cssText = 'background:var(--danger-light);color:var(--danger-dark);font-weight:bold';
        // Reset partial check
        const partialCheck = document.getElementById('creditPartialCheck');
        if (partialCheck) partialCheck.checked = false;
        self.updateCreditPanel();
      } else {
        if (creditFields) creditFields.style.display = 'none';
        if (amtLabel) amtLabel.textContent = 'Amount Paid';
        if (chgLabel) chgLabel.textContent = 'Change';
        if (paidInput) paidInput.disabled = false;
        if (chgInput) chgInput.style.cssText = 'background:var(--success-light);color:var(--success-dark);font-weight:bold';
      }

      self.updateTotals();
    });

    // Credit partial checkbox
    document.getElementById('creditPartialCheck').addEventListener('change', (e) => {
      const paidInput = document.getElementById('amountPaidInput');
      if (e.target.checked) {
        paidInput.disabled = false;
        paidInput.focus();
      } else {
        paidInput.value = '0';
        paidInput.disabled = true;
        self.amountPaid = 0;
      }
      self.updateTotals();
      self.updateCreditPanel();
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

    // Quick-add customer
    document.getElementById('quickAddCustomerBtn').addEventListener('click', () => self.showQuickAddCustomer());

    // Customer select
    document.getElementById('customerSelect').addEventListener('change', async (e) => {
      self.customerId = e.target.value ? parseInt(e.target.value) : null;
      self.selectedCustomerBalance = 0;
      if (self.paymentMethod === 'credit') {
        await self.updateCreditPanel();
        self.updateTotals();
      }
      if (self.paymentMethod === 'cheque') {
        await self.updateChequeLimitPanel();
      }
    });

    // Place order
    document.getElementById('placeOrderBtn').addEventListener('click', () => self.placeOrder());
    document.getElementById('printPreviewBtn').addEventListener('click', () => self.previewReceipt());
    document.getElementById('shareInvoiceBtn').addEventListener('click', () => self.shareCart());

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

    // Mobile cart panel toggling
    const mobileCartToggleBtn = document.getElementById('mobileCartToggleBtn');
    const closeOrderPanelBtn = document.getElementById('closeOrderPanelBtn');
    const orderPanel = document.getElementById('orderPanel');

    if (mobileCartToggleBtn && orderPanel) {
      mobileCartToggleBtn.addEventListener('click', () => {
        orderPanel.classList.add('mobile-active');
      });
    }

    if (closeOrderPanelBtn && orderPanel) {
      closeOrderPanelBtn.addEventListener('click', () => {
        orderPanel.classList.remove('mobile-active');
      });
    }
  },

  async placeOrder() {
    if (this.cart.length === 0) {
      Toast.warning('Empty Cart', 'Add items to place an order');
      return;
    }

    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalItemDiscount = this.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    if (this.discount > (subtotal - totalItemDiscount)) {
      Toast.warning('Invalid Discount', 'Discount cannot be greater than subtotal');
      return;
    }
    const taxableAmount = Math.max(0, subtotal - totalItemDiscount - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;
    const amountPaid = parseFloat(document.getElementById('amountPaidInput').value) || 0;
    const change = Math.max(0, amountPaid - total);
    const dueAmount = Math.max(0, total - amountPaid);
    const customer = this.customerId ? await DB.getCustomer(this.customerId) : null;
    const availableCredit = customer?.creditBalance || 0;
    const remainingAfterCredit = Math.max(0, dueAmount - availableCredit);

    if (this.paymentMethod === 'credit' && !this.customerId) {
      Toast.warning('Select Customer', 'Credit sales must be assigned to a customer to track the outstanding balance');
      document.getElementById('customerSelect').focus();
      return;
    }
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
      subtotal, tax, discount: this.discount + totalItemDiscount, total,
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
        gramsPerPacket: item.gramsPerPacket || 0,
        total: item.quantity * item.price - (item.discount || 0)
      }))
    };

    try {
      const saleId = await DB.addSale(sale);
      sale.id = saleId;
      this.products = await DB.getProducts();

      // Save cheque details if payment method is cheque
      if (this.paymentMethod === 'cheque') {
        const chqNo      = document.getElementById('billChqNo')?.value.trim();
        const chqBank    = document.getElementById('billChqBank')?.value.trim();
        const chqBranch  = document.getElementById('billChqBranch')?.value.trim();
        const chqDrawer  = document.getElementById('billChqDrawer')?.value.trim();
        const chqReceived= document.getElementById('billChqReceived')?.value;
        const chqDue     = document.getElementById('billChqDue')?.value;
        if (chqNo && chqBank && chqDue) {
          try {
            await DB.addCheque({
              chequeNumber: chqNo,
              bankName: chqBank,
              bankBranch: chqBranch || '',
              drawerName: chqDrawer || '',
              amount: total,
              receivedDate: chqReceived || new Date().toISOString().split('T')[0],
              dueDate: chqDue,
              customerId: this.customerId,
              saleId: saleId,
              notes: `Invoice ${sale.invoiceNo}`
            });
          } catch(e) {
            console.warn('Cheque save failed:', e);
            Toast.error('Cheque Not Saved', `Sale ${sale.invoiceNo} was recorded, but the cheque details failed to save (${e.message || 'unknown error'}). Please add it manually from Cheques.`);
          }
        }
      }

      Toast.success('Order Placed!', `Invoice ${sale.invoiceNo} — ${Utils.currency(total)}`);

      const saleItems = sale.items;
      this.openCashDrawer();
      Receipt.print(sale, saleItems);
      Sidebar.updateLowStockBadge();
      this.newOrder();

      // Offer share options (panel is already reset)
      const creditNote = (sale.paymentMethod === 'credit' || sale.dueAmount > 0)
        ? `<div style="margin-top:8px;padding:8px 12px;background:var(--danger-light);border-radius:var(--radius-md);font-size:12px;color:var(--danger-dark)">
             ${sale.paymentMethod === 'credit' ? '💳 Credit Sale' : '⚠️ Partial Payment'} — LKR ${Utils.currency(sale.dueAmount)} added to customer's balance
           </div>` : '';
      Modal.show({
        title: 'Order Complete',
        content: `
          <div style="text-align:center;padding:8px 0 12px">
            <div style="font-size:28px;margin-bottom:8px">✅</div>
            <div style="font-weight:600;font-size:15px">Invoice ${Utils.escapeHtml(sale.invoiceNo)}</div>
            <div style="color:var(--text-secondary);margin-top:4px">Total: ${Utils.currency(total)}</div>
            ${creditNote}
          </div>
          <div style="display:flex;gap:8px">
            <button class="btn btn-success" id="postShareWaBtn" style="flex:1;font-size:13px">💬 WhatsApp</button>
            <button class="btn btn-outline" id="postShareSmsBtn" style="flex:1;font-size:13px">📱 SMS</button>
          </div>
        `,
        footer: `<button class="btn btn-primary" id="postNewOrderBtn" style="width:100%">Close</button>`
      });

      document.getElementById('postNewOrderBtn').addEventListener('click', () => Modal.close());
      document.getElementById('postShareWaBtn').addEventListener('click', async () => {
        await Receipt.showShareModal(sale, saleItems);
      });
      document.getElementById('postShareSmsBtn').addEventListener('click', async () => {
        const customer = sale.customerId ? await DB.getCustomer(sale.customerId) : null;
        const phone = (customer?.phone || '').replace(/[^\d]/g, '');
        await Receipt.shareViaSMS(sale, saleItems, phone);
      });
    } catch (err) {
      Toast.error('Error', 'Failed to save order: ' + err.message);
    }
  },

  async openCashDrawer() {
    if (!window.SupiriKarawala?.openCashDrawer) return;
    try {
      const receiptPrinter = await DB.getSetting('receiptPrinter');
      await window.SupiriKarawala.openCashDrawer({ deviceName: receiptPrinter || undefined });
    } catch (err) {
      console.warn('Cash drawer did not open:', err);
      Toast.warning('Cash Drawer', err.message || 'Could not open the cash drawer');
    }
  },

  async previewReceipt() {
    if (this.cart.length === 0) { Toast.warning('Empty Cart', 'Add items first'); return; }
    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalItemDiscount = this.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    if (this.discount > (subtotal - totalItemDiscount)) {
      Toast.warning('Invalid Discount', 'Discount cannot be greater than subtotal');
      return;
    }
    const taxableAmount = Math.max(0, subtotal - totalItemDiscount - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;
    const amountPaid = parseFloat(document.getElementById('amountPaidInput').value) || 0;
    const sale = {
      invoiceNo: this.invoiceNo, subtotal, tax, discount: this.discount + totalItemDiscount, total,
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

  async shareCart() {
    if (this.cart.length === 0) { Toast.warning('Empty Cart', 'Add items first'); return; }
    const subtotal = this.cart.reduce((sum, item) => sum + item.quantity * item.price, 0);
    const totalItemDiscount = this.cart.reduce((sum, item) => sum + (item.discount || 0), 0);
    const taxableAmount = Math.max(0, subtotal - totalItemDiscount - this.discount);
    const tax = taxableAmount * (this.taxRate / 100);
    const total = taxableAmount + tax;
    const sale = {
      invoiceNo: this.invoiceNo,
      subtotal, tax, discount: this.discount + totalItemDiscount, total,
      paymentMethod: this.paymentMethod,
      customerId: this.customerId,
      cashierName: App.currentUser?.name || 'Admin',
      createdAt: new Date()
    };
    const saleItems = this.cart.map(item => ({
      name: item.name, quantity: item.quantity, price: item.price,
      discount: item.discount || 0,
      total: item.quantity * item.price - (item.discount || 0)
    }));
    await Receipt.showShareModal(sale, saleItems);
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
    document.getElementById('amountPaidInput').disabled = false;
    document.querySelectorAll('.payment-method-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('.payment-method-btn[data-method="cash"]').classList.add('active');
    // Reset credit UI
    const creditFields = document.getElementById('creditFieldsBilling');
    if (creditFields) creditFields.style.display = 'none';
    const partialCheck = document.getElementById('creditPartialCheck');
    if (partialCheck) partialCheck.checked = false;
    const amtLabel = document.getElementById('amountPaidLabel');
    if (amtLabel) amtLabel.textContent = 'Amount Paid';
    const chgLabel = document.getElementById('changeLabel');
    if (chgLabel) chgLabel.textContent = 'Change';
    const chgInput = document.getElementById('changeValue');
    if (chgInput) chgInput.style.cssText = 'background:var(--success-light);color:var(--success-dark);font-weight:bold';
    this.selectedCustomerBalance = 0;
    // Reset cheque fields
    ['billChqNo','billChqBank','billChqBranch','billChqDrawer'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const chqReceived = document.getElementById('billChqReceived');
    if (chqReceived) chqReceived.value = new Date().toISOString().split('T')[0];
    const chqDue = document.getElementById('billChqDue');
    if (chqDue) chqDue.value = '';
    const chqPanel = document.getElementById('chequeLimitPanel');
    if (chqPanel) chqPanel.innerHTML = '';
    this.renderCart();
    this.renderProducts();
    
    // Close order panel on mobile
    const orderPanel = document.getElementById('orderPanel');
    if (orderPanel) {
      orderPanel.classList.remove('mobile-active');
    }
    
    document.getElementById('barcodeInput').focus();
  }
};
