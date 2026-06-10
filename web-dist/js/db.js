/* ===== DATABASE MODULE (Dexie.js / IndexedDB) ===== */
const DB = {
  db: null,
  cloudEnabled: false,
  cloudRevision: 0,
  _cloudWrapped: false,
  _applyingCloudSnapshot: false,

  async init() {
    this.db = new Dexie('PrintCarePlusPOS');
    this.db.version(1).stores({
      products: '++id, name, barcode, categoryId, brand, createdAt',
      categories: '++id, name',
      variations: '++id, productId, type, barcode',
      customers: '++id, name, phone',
      suppliers: '++id, name, phone',
      sales: '++id, invoiceNo, customerId, cashierId, createdAt, status',
      saleItems: '++id, saleId, productId, variationId',
      purchases: '++id, supplierId, date, createdAt',
      purchaseItems: '++id, purchaseId, productId',
      returns: '++id, saleId, invoiceNo, date',
      returnItems: '++id, returnId, productId',
      stockAdjustments: '++id, productId, type, date',
      expenses: '++id, category, date',
      payments: '++id, customerId, date',
      users: '++id, username, role',
      settings: 'key'
    });
    await this.db.open();

    // Read cloud settings before initialization
    const cloudUrlSetting = await this.db.settings.get('cloudUrl');
    this._cloudUrl = cloudUrlSetting ? cloudUrlSetting.value : '';
    const cloudEnabledSetting = await this.db.settings.get('cloudEnabled');
    this._cloudEnabledOverride = cloudEnabledSetting ? (cloudEnabledSetting.value === 'true') : false;

    await this.initCloudSync();
  },

  getCloudUrl(path) {
    const base = this._cloudUrl ? this._cloudUrl.replace(/\/$/, '') : '';
    return `${base}${path}`;
  },

  demoProductBarcodes() {
    return [
      '100001','100002','100003','100004','100005','100006','100007',
      '200001','200002','200003','200004',
      '300001','300002','300003',
      '400001','400002','400003',
      '500001','500002','500003','500004',
      '600001','600002','600003','600004','600005','600006',
      '700001','700002','700003',
      '800001','800002',
      '900001','900002','900003',
      '1000001','1000002','1000003',
      '1100001','1100002',
      '1200001','1200002'
    ];
  },

  async removeDemoInventoryItems() {
    const migrationKey = 'demoInventoryRemovedVersion';
    if (await this.getSetting(migrationKey) === 'print-care-plus-2026-05') return;

    const demoBarcodes = new Set(this.demoProductBarcodes());
    const demoProducts = (await this.db.products.toArray()).filter(p => demoBarcodes.has(String(p.barcode || '')));
    const demoProductIds = demoProducts.map(p => p.id);

    if (demoProductIds.length > 0) {
      await this.db.transaction('rw', this.db.products, this.db.variations, async () => {
        for (const productId of demoProductIds) {
          await this.db.variations.where('productId').equals(productId).delete();
          await this.db.products.delete(productId);
        }
      });
    }

    await this.setSetting(migrationKey, 'print-care-plus-2026-05');
  },

  async clearInitialInventoryItems() {
    const migrationKey = 'initialInventoryClearedVersion';
    if (await this.getSetting(migrationKey) === 'print-care-plus-empty-inventory-2026-05-24') return;

    await this.db.transaction(
      'rw',
      this.db.products,
      this.db.categories,
      this.db.variations,
      this.db.stockAdjustments,
      this.db.expenses,
      async () => {
        await this.db.variations.clear();
        await this.db.products.clear();
        await this.db.categories.clear();
        await this.db.stockAdjustments.clear();
        await this.db.expenses
          .filter(expense => Boolean(expense.stockAdjustmentId))
          .delete();
      }
    );

    await this.setSetting(migrationKey, 'print-care-plus-empty-inventory-2026-05-24');
  },

  async initCloudSync() {
    const isLocalFile = location.protocol === 'file:';
    const hasOverride = this._cloudEnabledOverride && this._cloudUrl;

    if (!hasOverride && (isLocalFile || !window.fetch)) return;

    try {
      const res = await fetch(this.getCloudUrl('/api/health'), { cache: 'no-store' });
      if (!res.ok) return;
      const health = await res.json();
      if (!health.database) return;

      this.cloudEnabled = true;
      const snapshot = await this.fetchCloudSnapshot();
      if (snapshot?.initialized && snapshot.data) {
        this._applyingCloudSnapshot = true;
        await this.importData(this.reviveDataDates(snapshot.data));
        this._applyingCloudSnapshot = false;
        this.cloudRevision = snapshot.revision || 0;
      }
      this.cloudInitialized = Boolean(snapshot?.initialized);
    } catch (err) {
      console.warn('Cloud sync unavailable; using local IndexedDB.', err);
      this.cloudEnabled = false;
      this._applyingCloudSnapshot = false;
    }
  },

  async finalizeCloudSync() {
    if (!this.cloudEnabled) return;

    if (!this.cloudInitialized) {
      const data = await this.exportData();
      const res = await fetch(this.getCloudUrl('/api/db/snapshot'), {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: 0, data })
      });
      if (res.status === 409) {
        const latest = await res.json();
        this._applyingCloudSnapshot = true;
        await this.importData(this.reviveDataDates(latest.data));
        this._applyingCloudSnapshot = false;
        this.cloudRevision = latest.revision || 0;
        this.cloudInitialized = true;
        this.wrapCloudMethods();
        return;
      }
      if (!res.ok) throw new Error(`Initial cloud sync failed (${res.status})`);
      const result = await res.json();
      this.cloudRevision = result.revision || 0;
      this.cloudInitialized = true;
    }

    this.wrapCloudMethods();
  },

  wrapCloudMethods() {
    if (this._cloudWrapped) return;
    this._cloudWrapped = true;

    const readMethods = [
      'getProducts','getProduct','getProductByBarcode','getCategories','getCategory',
      'getVariations','getVariationByBarcode','getCustomers','getCustomer','getSuppliers',
      'getSupplier','getSales','getAllSales','getSale','getSalesByDate','getSaleItems',
      'getPurchases','getPurchase','getPurchaseItems','getReturns','getReturnItems',
      'getStockAdjustments','getExpenses','getExpense','getPayments','getUsers','getUser',
      'getUserByUsername','getSetting','getAllSettings','getLowStockProducts',
      'getDailySales','getMonthlySales'
    ];
    const writeMethods = [
      'addProduct','updateProduct','deleteProduct','addCategory','updateCategory',
      'deleteCategory','addVariation','updateVariation','deleteVariation','addCustomer',
      'updateCustomer','deleteCustomer','addSupplier','updateSupplier','deleteSupplier',
      'addSale','updateSale','voidSale','addPurchase','reversePurchase','addReturn',
      'addStockAdjustment','addExpense','updateExpense','deleteExpense','addPayment',
      'addUser','updateUser','deleteUser','ensureDefaultUserAccounts','setSetting','importData',
      'applyBusinessProfile','seedIfEmpty'
    ];

    readMethods.forEach(name => {
      if (typeof this[name] !== 'function') return;
      const original = this[name].bind(this);
      this[name] = async (...args) => {
        await this.pullFromCloud();
        return original(...args);
      };
    });

    writeMethods.forEach(name => {
      if (typeof this[name] !== 'function') return;
      this[name] = async (...args) => {
        return await this.mutateCloud(name, args);
      };
    });
  },

  async mutateCloud(method, args) {
    if (!this.cloudEnabled || this._applyingCloudSnapshot) return null;

    const res = await fetch(this.getCloudUrl('/api/db/mutate'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ method, args })
    });

    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Cloud mutation failed (${res.status})`);

    this._applyingCloudSnapshot = true;
    await this.importData(this.reviveDataDates(body.data));
    this._applyingCloudSnapshot = false;
    this.cloudRevision = body.revision || this.cloudRevision;
    return body.result;
  },

  async fetchCloudSnapshot() {
    const res = await fetch(this.getCloudUrl('/api/db/snapshot'), { cache: 'no-store' });
    if (!res.ok) throw new Error(`Cloud snapshot fetch failed (${res.status})`);
    return await res.json();
  },

  async pullFromCloud() {
    if (!this.cloudEnabled || this._applyingCloudSnapshot) return;
    const snapshot = await this.fetchCloudSnapshot();
    if (!snapshot.initialized || !snapshot.data || snapshot.revision === this.cloudRevision) return;

    this._applyingCloudSnapshot = true;
    await this.importData(this.reviveDataDates(snapshot.data));
    this._applyingCloudSnapshot = false;
    this.cloudRevision = snapshot.revision || 0;
  },

  async syncToCloud() {
    if (!this.cloudEnabled || this._applyingCloudSnapshot) return;

    const data = await this.exportData();
    const res = await fetch(this.getCloudUrl('/api/db/snapshot'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ revision: this.cloudRevision, data })
    });

    if (res.status === 409) {
      const conflict = await res.json();
      this._applyingCloudSnapshot = true;
      await this.importData(this.reviveDataDates(conflict.data));
      this._applyingCloudSnapshot = false;
      this.cloudRevision = conflict.revision || 0;
      throw new Error('Cloud data changed in another browser. The latest database was reloaded; please try again.');
    }

    if (!res.ok) throw new Error(`Cloud sync failed (${res.status})`);
    const result = await res.json();
    this.cloudRevision = result.revision || this.cloudRevision;
  },

  reviveDataDates(data) {
    const dateFields = new Set([
      'createdAt','editedAt','voidedAt','reversedAt','lastReturnedAt','lastPaymentAt',
      'date','updatedAt'
    ]);
    const revived = {};
    for (const [table, rows] of Object.entries(data || {})) {
      revived[table] = Array.isArray(rows) ? rows.map(row => {
        const next = { ...row };
        for (const key of dateFields) {
          if (next[key] && typeof next[key] === 'string') {
            const parsed = new Date(next[key]);
            if (!Number.isNaN(parsed.getTime())) next[key] = parsed;
          }
        }
        return next;
      }) : [];
    }
    return revived;
  },

  async applyBusinessProfile() {
    const migrationKey = 'businessProfileVersion';
    if (await this.getSetting(migrationKey) === 'print-care-plus-2026-05') return;

    await this.db.settings.bulkPut([
      { key: 'shopName', value: 'Supiri Karawala' },
      { key: 'shopAddress', value: 'Daulagala Handassa' },
      { key: 'shopPhone', value: '077 944 5144' },
      { key: migrationKey, value: 'print-care-plus-2026-05' }
    ]);
  },

  // ======= PRODUCTS =======
  async getProducts() { return await this.db.products.toArray(); },
  async getProduct(id) { return await this.db.products.get(id); },
  async getProductByBarcode(barcode) { return await this.db.products.where('barcode').equals(barcode).first(); },
  async addProduct(p) { p.createdAt = new Date(); return await this.db.products.add(p); },
  async updateProduct(id, data) { return await this.db.products.update(id, data); },
  async deleteProduct(id) {
    await this.db.variations.where('productId').equals(id).delete();
    return await this.db.products.delete(id);
  },

  // ======= CATEGORIES =======
  async getCategories() { return await this.db.categories.toArray(); },
  async getCategory(id) { return await this.db.categories.get(id); },
  async addCategory(c) { return await this.db.categories.add(c); },
  async updateCategory(id, data) { return await this.db.categories.update(id, data); },
  async deleteCategory(id) { return await this.db.categories.delete(id); },

  // ======= VARIATIONS =======
  async getVariations(productId) { return await this.db.variations.where('productId').equals(productId).toArray(); },
  async getVariationByBarcode(barcode) { return await this.db.variations.where('barcode').equals(barcode).first(); },
  async addVariation(v) { return await this.db.variations.add(v); },
  async updateVariation(id, data) { return await this.db.variations.update(id, data); },
  async deleteVariation(id) { return await this.db.variations.delete(id); },

  // ======= CUSTOMERS =======
  async getCustomers() { return await this.db.customers.toArray(); },
  async getCustomer(id) { return await this.db.customers.get(id); },
  async addCustomer(c) { c.createdAt = new Date(); c.balance = c.balance || 0; c.creditBalance = c.creditBalance || 0; return await this.db.customers.add(c); },
  async updateCustomer(id, data) { return await this.db.customers.update(id, data); },
  async deleteCustomer(id) { return await this.db.customers.delete(id); },

  // ======= SUPPLIERS =======
  async getSuppliers() { return await this.db.suppliers.toArray(); },
  async getSupplier(id) { return await this.db.suppliers.get(id); },
  async addSupplier(s) { s.createdAt = new Date(); return await this.db.suppliers.add(s); },
  async updateSupplier(id, data) { return await this.db.suppliers.update(id, data); },
  async deleteSupplier(id) { return await this.db.suppliers.delete(id); },

  // ======= SALES =======
  async getSales() {
    const sales = await this.db.sales.orderBy('createdAt').reverse().toArray();
    return sales.filter(s => s.status !== 'voided');
  },
  async getAllSales() { return await this.db.sales.orderBy('createdAt').reverse().toArray(); },
  async getSale(id) { return await this.db.sales.get(id); },
  async getSalesByDate(start, end) {
    const sales = await this.db.sales.where('createdAt').between(start, end, true, true).toArray();
    return sales.filter(s => s.status !== 'voided');
  },
  async addSale(sale) {
    return await this.db.transaction(
      'rw',
      this.db.sales,
      this.db.saleItems,
      this.db.products,
      this.db.variations,
      this.db.customers,
      async () => {
        sale.createdAt = new Date();
        sale.status = sale.status || 'completed';
        sale.taxRate = sale.taxRate || 0;
        if (sale.customerId && (sale.dueAmount || 0) > 0) {
          const c = await this.db.customers.get(sale.customerId);
          const availableCredit = c?.creditBalance || 0;
          const creditApplied = Math.min(availableCredit, sale.dueAmount || 0);
          if (creditApplied > 0) {
            sale.amountPaid = (sale.amountPaid || 0) + creditApplied;
            sale.dueAmount = Math.max(0, (sale.dueAmount || 0) - creditApplied);
            sale.creditApplied = creditApplied;
          }
        }
        const saleId = await this.db.sales.add(sale);

        for (const item of (sale.items || [])) {
          item.saleId = saleId;
          await this.db.saleItems.add(item);

          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (!v || (v.stock || 0) < item.quantity) {
              throw new Error(`Insufficient stock for variation ${item.variationId}`);
            }
            await this.db.variations.update(item.variationId, { stock: (v.stock || 0) - item.quantity });
          } else {
            const p = await this.db.products.get(item.productId);
            if (!p || (p.stock || 0) < item.quantity) {
              throw new Error(`Insufficient stock for product ${item.productId}`);
            }
            await this.db.products.update(item.productId, { stock: (p.stock || 0) - item.quantity });
          }
        }

        // Update customer balance for credit sales
        if (sale.customerId && sale.dueAmount > 0) {
          const c = await this.db.customers.get(sale.customerId);
          if (c) await this.db.customers.update(sale.customerId, {
            balance: (c.balance || 0) + sale.dueAmount,
            creditBalance: Math.max(0, (c.creditBalance || 0) - (sale.creditApplied || 0))
          });
        } else if (sale.customerId && sale.creditApplied > 0) {
          const c = await this.db.customers.get(sale.customerId);
          if (c) await this.db.customers.update(sale.customerId, {
            creditBalance: Math.max(0, (c.creditBalance || 0) - sale.creditApplied)
          });
        }

        return saleId;
      }
    );
  },
  async getSaleItems(saleId) { return await this.db.saleItems.where('saleId').equals(saleId).toArray(); },
  async applyCustomerCreditToSale(sale) {
    sale.creditApplied = 0;
    if (!sale.customerId || (sale.dueAmount || 0) <= 0) return sale;

    const c = await this.db.customers.get(sale.customerId);
    const availableCredit = c?.creditBalance || 0;
    const creditApplied = Math.min(availableCredit, sale.dueAmount || 0);
    if (creditApplied > 0) {
      sale.amountPaid = (sale.amountPaid || 0) + creditApplied;
      sale.dueAmount = Math.max(0, (sale.dueAmount || 0) - creditApplied);
      sale.creditApplied = creditApplied;
    }
    return sale;
  },
  async updateSale(saleId, updatedSale) {
    return await this.db.transaction(
      'rw',
      this.db.sales,
      this.db.saleItems,
      this.db.products,
      this.db.variations,
      this.db.returns,
      this.db.customers,
      async () => {
        const oldSale = await this.db.sales.get(saleId);
        if (!oldSale) throw new Error('Sale not found');
        if (oldSale.status === 'voided') throw new Error('Cannot edit a voided bill');
        const existingReturns = await this.db.returns.where('saleId').equals(saleId).count();
        if (existingReturns > 0) throw new Error('Cannot edit a bill that has returns');

        const oldItems = await this.db.saleItems.where('saleId').equals(saleId).toArray();

        for (const item of oldItems) {
          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (v) await this.db.variations.update(item.variationId, { stock: (v.stock || 0) + (item.quantity || 0) });
          } else {
            const p = await this.db.products.get(item.productId);
            if (p) await this.db.products.update(item.productId, { stock: (p.stock || 0) + (item.quantity || 0) });
          }
        }

        if (oldSale.customerId && ((oldSale.dueAmount || 0) > 0 || (oldSale.creditApplied || 0) > 0)) {
          const c = await this.db.customers.get(oldSale.customerId);
          if (c) {
            await this.db.customers.update(oldSale.customerId, {
              balance: Math.max(0, (c.balance || 0) - (oldSale.dueAmount || 0)),
              creditBalance: (c.creditBalance || 0) + Math.max(0, (oldSale.creditApplied || 0) - (oldSale.creditReturned || 0))
            });
          }
        }

        updatedSale.creditReturned = 0;
        await this.applyCustomerCreditToSale(updatedSale);

        await this.db.saleItems.where('saleId').equals(saleId).delete();

        for (const item of (updatedSale.items || [])) {
          item.saleId = saleId;
          await this.db.saleItems.add(item);

          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (!v || (v.stock || 0) < item.quantity) {
              throw new Error(`Insufficient stock for variation ${item.variationId}`);
            }
            await this.db.variations.update(item.variationId, { stock: (v.stock || 0) - item.quantity });
          } else {
            const p = await this.db.products.get(item.productId);
            if (!p || (p.stock || 0) < item.quantity) {
              throw new Error(`Insufficient stock for product ${item.productId}`);
            }
            await this.db.products.update(item.productId, { stock: (p.stock || 0) - item.quantity });
          }
        }

        if (updatedSale.customerId && updatedSale.dueAmount > 0) {
          const c = await this.db.customers.get(updatedSale.customerId);
          if (c) {
            await this.db.customers.update(updatedSale.customerId, {
              balance: (c.balance || 0) + updatedSale.dueAmount,
              creditBalance: Math.max(0, (c.creditBalance || 0) - (updatedSale.creditApplied || 0))
            });
          }
        } else if (updatedSale.customerId && updatedSale.creditApplied > 0) {
          const c = await this.db.customers.get(updatedSale.customerId);
          if (c) {
            await this.db.customers.update(updatedSale.customerId, {
              creditBalance: Math.max(0, (c.creditBalance || 0) - updatedSale.creditApplied)
            });
          }
        }

        updatedSale.editedAt = new Date();
        updatedSale.status = updatedSale.status || 'completed';
        delete updatedSale.items;
        delete updatedSale.id;
        await this.db.sales.update(saleId, updatedSale);
        return saleId;
      }
    );
  },
  async voidSale(saleId) {
    return await this.db.transaction(
      'rw',
      this.db.sales,
      this.db.saleItems,
      this.db.products,
      this.db.variations,
      this.db.returns,
      this.db.returnItems,
      this.db.customers,
      async () => {
        const sale = await this.db.sales.get(saleId);
        if (!sale) throw new Error('Sale not found');
        if (sale.status === 'voided') return saleId;

        const items = await this.db.saleItems.where('saleId').equals(saleId).toArray();
        const returnedQtyByItem = {};
        const returns = await this.db.returns.where('saleId').equals(saleId).toArray();
        for (const ret of returns) {
          const returnItems = await this.db.returnItems.where('returnId').equals(ret.id).toArray();
          for (const item of returnItems) {
            const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
            returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (item.quantity || 0);
          }
        }

        for (const item of items) {
          const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
          const returnQty = returnedQtyByItem[key] || 0;
          const restoreQty = Math.max(0, (item.quantity || 0) - returnQty);
          if (restoreQty <= 0) continue;

          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (v) await this.db.variations.update(item.variationId, { stock: (v.stock || 0) + restoreQty });
          } else {
            const p = await this.db.products.get(item.productId);
            if (p) await this.db.products.update(item.productId, { stock: (p.stock || 0) + restoreQty });
          }
        }

        if (sale.customerId && ((sale.dueAmount || 0) > 0 || (sale.creditApplied || 0) > (sale.creditReturned || 0))) {
          const c = await this.db.customers.get(sale.customerId);
          if (c) {
            await this.db.customers.update(sale.customerId, {
              balance: Math.max(0, (c.balance || 0) - (sale.dueAmount || 0)),
              creditBalance: (c.creditBalance || 0) + Math.max(0, (sale.creditApplied || 0) - (sale.creditReturned || 0))
            });
          }
        }

        await this.db.sales.update(saleId, {
          status: 'voided',
          voidedAt: new Date(),
          voidedBy: App.currentUser?.id || null
        });
        return saleId;
      }
    );
  },

  // ======= PURCHASES =======
  async getPurchases() { return await this.db.purchases.orderBy('createdAt').reverse().toArray(); },
  async getPurchase(id) { return await this.db.purchases.get(id); },
  async addPurchase(purchase) {
    return await this.db.transaction(
      'rw',
      this.db.purchases,
      this.db.purchaseItems,
      this.db.products,
      async () => {
        purchase.createdAt = new Date();
        purchase.status = purchase.status || 'posted';
        const purchaseId = await this.db.purchases.add(purchase);
        if (purchase.items && purchase.items.length) {
          for (const item of purchase.items) {
            item.purchaseId = purchaseId;
            await this.db.purchaseItems.add(item);

            const p = await this.db.products.get(item.productId);
            if (p) {
              const currentStock = p.stock || 0;
              const incomingQty = item.quantity || 0;
              const currentCost = p.costPrice || 0;
              const incomingCost = item.buyingPrice || currentCost;
              const newStock = currentStock + incomingQty;
              const weightedCost = newStock > 0
                ? ((currentStock * currentCost) + (incomingQty * incomingCost)) / newStock
                : incomingCost;

              await this.db.products.update(item.productId, {
                stock: newStock,
                costPrice: weightedCost
              });
            }
          }
        }
        return purchaseId;
      }
    );
  },
  async getPurchaseItems(purchaseId) { return await this.db.purchaseItems.where('purchaseId').equals(purchaseId).toArray(); },
  async reversePurchase(purchaseId) {
    return await this.db.transaction(
      'rw',
      this.db.purchases,
      this.db.purchaseItems,
      this.db.products,
      this.db.sales,
      this.db.returns,
      this.db.stockAdjustments,
      async () => {
        const purchase = await this.db.purchases.get(purchaseId);
        if (!purchase) throw new Error('Purchase not found');
        if (purchase.status === 'reversed') return purchaseId;
        const purchaseDate = purchase.createdAt || purchase.date || new Date(0);
        const laterPurchases = await this.db.purchases
          .where('createdAt')
          .above(purchaseDate)
          .filter(p => p.status !== 'reversed')
          .count();
        if (laterPurchases > 0) {
          throw new Error('Only the latest posted purchase can be reversed. Use stock adjustment for older corrections');
        }
        const laterSales = await this.db.sales
          .where('createdAt')
          .above(purchaseDate)
          .filter(s => s.status !== 'voided')
          .count();
        const laterReturns = await this.db.returns.where('date').above(purchaseDate).count();
        const laterAdjustments = await this.db.stockAdjustments.where('date').above(purchaseDate).count();
        if (laterSales > 0 || laterReturns > 0 || laterAdjustments > 0) {
          throw new Error('Cannot reverse purchase after sales, returns, or stock adjustments. Use stock adjustment for corrections');
        }

        const items = await this.db.purchaseItems.where('purchaseId').equals(purchaseId).toArray();
        for (const item of items) {
          const p = await this.db.products.get(item.productId);
          if (!p) continue;

          const currentStock = p.stock || 0;
          const reverseQty = item.quantity || 0;
          if (currentStock < reverseQty) {
            throw new Error(`Cannot reverse purchase. ${p.name} has only ${currentStock} in stock`);
          }

          const buyingPrice = item.buyingPrice || p.costPrice || 0;
          const currentCost = p.costPrice || 0;
          const newStock = currentStock - reverseQty;
          const previousCost = newStock > 0
            ? Math.max(0, ((currentStock * currentCost) - (reverseQty * buyingPrice)) / newStock)
            : currentCost;

          await this.db.products.update(item.productId, {
            stock: newStock,
            costPrice: previousCost
          });
        }

        await this.db.purchases.update(purchaseId, {
          status: 'reversed',
          reversedAt: new Date(),
          reversedBy: App.currentUser?.id || null
        });
        return purchaseId;
      }
    );
  },

  // ======= RETURNS =======
  async getReturns() { return await this.db.returns.orderBy('date').reverse().toArray(); },
  async addReturn(ret) {
    return await this.db.transaction(
      'rw',
      this.db.returns,
      this.db.returnItems,
      this.db.products,
      this.db.variations,
      this.db.sales,
      this.db.customers,
      async () => {
        ret.date = ret.date || new Date();
        const returnId = await this.db.returns.add(ret);
        const sale = ret.saleId ? await this.db.sales.get(ret.saleId) : null;

        for (const item of (ret.items || [])) {
          item.returnId = returnId;
          await this.db.returnItems.add(item);
          if (item.restock) {
            if (item.variationId) {
              const v = await this.db.variations.get(item.variationId);
              if (v) await this.db.variations.update(item.variationId, { stock: (v.stock || 0) + item.quantity });
            } else {
              const p = await this.db.products.get(item.productId);
              if (p) await this.db.products.update(item.productId, { stock: (p.stock || 0) + item.quantity });
            }
          }
        }

        if (sale && ret.totalRefund > 0) {
          const subtotalRefund = (ret.items || []).reduce((s, item) => s + (item.subtotalRefund ?? ((item.quantity || 0) * (item.price || 0))), 0);
          const discountRefund = (ret.items || []).reduce((s, item) => s + (item.discountRefund || 0), 0);
          const taxRefund = (ret.items || []).reduce((s, item) => s + (item.taxRefund || 0), 0);
          const costRefund = (ret.items || []).reduce((s, item) => s + (item.costRefund || ((item.quantity || 0) * (item.costPrice || 0))), 0);
          const itemCountRefund = (ret.items || []).reduce((s, item) => s + (item.quantity || 0), 0);
          const dueBefore = sale.dueAmount || 0;
          const dueAfter = Math.max(0, dueBefore - ret.totalRefund);
          const dueReduction = dueBefore - dueAfter;
          const paidRefund = Math.max(0, ret.totalRefund - dueReduction);
          const remainingCreditApplied = Math.max(0, (sale.creditApplied || 0) - (sale.creditReturned || 0));
          const creditRefund = Math.min(remainingCreditApplied, paidRefund);
          const totalAfter = Math.max(0, (sale.total || 0) - ret.totalRefund);
          const amountPaidAfter = Math.min(sale.amountPaid || 0, totalAfter);

          await this.db.sales.update(sale.id, {
            subtotal: Math.max(0, (sale.subtotal || 0) - subtotalRefund),
            discount: Math.max(0, (sale.discount || 0) - discountRefund),
            tax: Math.max(0, (sale.tax || 0) - taxRefund),
            total: totalAfter,
            amountPaid: amountPaidAfter,
            change: Math.max(0, amountPaidAfter - totalAfter),
            dueAmount: dueAfter,
            totalCost: Math.max(0, (sale.totalCost || 0) - costRefund),
            itemCount: Math.max(0, (sale.itemCount || 0) - itemCountRefund),
            returnedTotal: (sale.returnedTotal || 0) + ret.totalRefund,
            creditReturned: (sale.creditReturned || 0) + creditRefund,
            lastReturnedAt: ret.date
          });

          if (sale.customerId && (dueBefore > 0 || creditRefund > 0)) {
            const customer = await this.db.customers.get(sale.customerId);
            if (customer) {
              const current = customer.balance || 0;
              const next = Math.max(0, current - (dueBefore - dueAfter));
              await this.db.customers.update(sale.customerId, {
                balance: next,
                creditBalance: (customer.creditBalance || 0) + creditRefund
              });
            }
          }
        }

        return returnId;
      }
    );
  },
  async getReturnItems(returnId) { return await this.db.returnItems.where('returnId').equals(returnId).toArray(); },

  // ======= STOCK ADJUSTMENTS =======
  async getStockAdjustments() { return await this.db.stockAdjustments.orderBy('date').reverse().toArray(); },
  async addStockAdjustment(adj) {
    return await this.db.transaction(
      'rw',
      this.db.stockAdjustments,
      this.db.products,
      this.db.expenses,
      async () => {
        adj.date = adj.date || new Date();
        const p = await this.db.products.get(adj.productId);
        if (p) {
          const currentStock = p.stock || 0;
          const costPrice = adj.type === 'in'
            ? (adj.costPrice || adj.buyingPrice || p.costPrice || 0)
            : (p.costPrice || 0);
          const quantity = adj.quantity || 0;
          const lossQty = adj.type === 'in' ? 0 : Math.min(quantity, currentStock);
          adj.costPrice = costPrice;
          adj.lossAmount = lossQty * costPrice;
        }

        const id = await this.db.stockAdjustments.add(adj);
        if (p) {
          let newStock = p.stock || 0;
          if (adj.type === 'in') newStock += adj.quantity;
          else newStock -= adj.quantity;
          if (newStock < 0) newStock = 0;
          const updateData = { stock: newStock };
          if (adj.type === 'in') {
            const currentStock = p.stock || 0;
            const incomingQty = adj.quantity || 0;
            const incomingCost = adj.costPrice || p.costPrice || 0;
            updateData.costPrice = newStock > 0
              ? ((currentStock * (p.costPrice || 0)) + (incomingQty * incomingCost)) / newStock
              : incomingCost;
          }
          await this.db.products.update(adj.productId, updateData);

          if (adj.type !== 'in' && (adj.lossAmount || 0) > 0) {
            await this.db.expenses.add({
              category: 'Stock Loss',
              date: adj.date,
              description: `${adj.type === 'out' ? 'Stock out' : adj.type} adjustment - ${p.name}${adj.reason ? ` (${adj.reason})` : ''}`,
              amount: adj.lossAmount,
              stockAdjustmentId: id,
              productId: adj.productId
            });
          }
        }
        return id;
      }
    );
  },

  // ======= EXPENSES =======
  async getExpenses() { return await this.db.expenses.orderBy('date').reverse().toArray(); },
  async getExpense(id) { return await this.db.expenses.get(id); },
  async addExpense(e) { e.date = e.date || new Date(); return await this.db.expenses.add(e); },
  async updateExpense(id, data) {
    const expense = await this.db.expenses.get(id);
    if (expense?.stockAdjustmentId) throw new Error('Stock loss expenses are linked to inventory adjustments and cannot be edited');
    return await this.db.expenses.update(id, data);
  },
  async deleteExpense(id) {
    const expense = await this.db.expenses.get(id);
    if (expense?.stockAdjustmentId) throw new Error('Stock loss expenses are linked to inventory adjustments and cannot be deleted');
    return await this.db.expenses.delete(id);
  },

  // ======= PAYMENTS =======
  async getPayments() { return await this.db.payments.orderBy('date').reverse().toArray(); },
  async addPayment(payment) {
    return await this.db.transaction(
      'rw',
      this.db.payments,
      this.db.customers,
      this.db.sales,
      async () => {
        payment.date = payment.date || new Date();
        if (payment.customerId) {
          const amount = payment.amount || 0;
          let remaining = amount;
          let appliedTotal = 0;
          const sales = (await this.db.sales.where('customerId').equals(payment.customerId).toArray())
            .filter(s => s.status !== 'voided' && (s.dueAmount || 0) > 0)
            .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

          for (const sale of sales) {
            if (remaining <= 0) break;
            const due = sale.dueAmount || 0;
            const applied = Math.min(remaining, due);
            const nextAmountPaid = Math.min(sale.total || 0, (sale.amountPaid || 0) + applied);
            await this.db.sales.update(sale.id, {
              amountPaid: nextAmountPaid,
              dueAmount: Math.max(0, due - applied),
              change: Math.max(0, nextAmountPaid - (sale.total || 0)),
              lastPaymentAt: payment.date
            });
            remaining -= applied;
            appliedTotal += applied;
          }

          payment.appliedAmount = appliedTotal;
          payment.creditAmount = Math.max(0, remaining);
          const c = await this.db.customers.get(payment.customerId);
          if (c) {
            const nextBalance = Math.max(0, (c.balance || 0) - appliedTotal);
            const nextCredit = (c.creditBalance || 0) + payment.creditAmount;
            await this.db.customers.update(payment.customerId, {
              balance: nextBalance,
              creditBalance: nextCredit
            });
          }
        }
        const id = await this.db.payments.add(payment);
        return id;
      }
    );
  },

  // ======= USERS =======
  async getUsers() { return await this.db.users.toArray(); },
  async getUser(id) { return await this.db.users.get(id); },
  async getUserByUsername(username) { return await this.db.users.where('username').equals(username).first(); },
  async addUser(u) {
    if (u.password && !u.passwordHash) {
      const creds = await Utils.createPasswordHash(u.password);
      u.passwordHash = creds.passwordHash;
      u.passwordSalt = creds.passwordSalt;
      u.password = null;
    }
    return await this.db.users.add(u);
  },
  async updateUser(id, data) {
    if (data.password) {
      const creds = await Utils.createPasswordHash(data.password);
      data.passwordHash = creds.passwordHash;
      data.passwordSalt = creds.passwordSalt;
      data.password = null;
    }
    return await this.db.users.update(id, data);
  },
  async deleteUser(id) { return await this.db.users.delete(id); },

  async ensureDefaultUserAccounts() {
    const legacyDefaults = [
      { username: 'admin', name: 'Administrator' },
      { username: 'cashier', name: 'Cashier User' }
    ];

    for (const legacy of legacyDefaults) {
      const user = await this.getUserByUsername(legacy.username);
      if (user?.name === legacy.name) {
        await this.deleteUser(user.id);
      }
    }

    const defaults = [
      { username: 'owner', password: 'owner123', role: 'owner', name: 'Owner' },
      { username: 'worker1', password: 'worker123', role: 'worker', name: 'Worker 1' },
      { username: 'worker2', password: 'worker123', role: 'worker', name: 'Worker 2' },
      { username: 'worker3', password: 'worker123', role: 'worker', name: 'Worker 3' }
    ];

    for (const account of defaults) {
      const existing = await this.getUserByUsername(account.username);
      if (existing) continue;
      await this.addUser(account);
    }
  },

  // ======= SETTINGS =======
  async getSetting(key) {
    const s = await this.db.settings.get(key);
    return s ? s.value : null;
  },
  async setSetting(key, value) {
    return await this.db.settings.put({ key, value });
  },
  async getAllSettings() {
    const arr = await this.db.settings.toArray();
    const obj = {};
    arr.forEach(s => obj[s.key] = s.value);
    return obj;
  },

  // ======= LOW STOCK =======
  async getLowStockProducts() {
    const products = await this.db.products.toArray();
    return products.filter(p => (p.stock || 0) <= (p.reorderLevel || 5));
  },

  // ======= REPORTS HELPERS =======
  async getDailySales(date) {
    const start = Utils.startOfDay(date);
    const end = Utils.endOfDay(date);
    const sales = await this.db.sales.where('createdAt').between(start, end, true, true).toArray();
    return sales.filter(s => s.status !== 'voided');
  },

  async getMonthlySales(year, month) {
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0, 23, 59, 59, 999);
    const sales = await this.db.sales.where('createdAt').between(start, end, true, true).toArray();
    return sales.filter(s => s.status !== 'voided');
  },

  // ======= DATA EXPORT/IMPORT =======
  async exportData() {
    const data = {};
    const tables = ['products','categories','variations','customers','suppliers',
      'sales','saleItems','purchases','purchaseItems','returns','returnItems',
      'stockAdjustments','expenses','payments','users','settings'];
    for (const t of tables) {
      data[t] = await this.db[t].toArray();
    }
    return data;
  },

  async importData(data) {
    const tables = ['settings','users','categories','products','variations','customers',
      'suppliers','sales','saleItems','purchases','purchaseItems','returns','returnItems',
      'stockAdjustments','expenses','payments'];
    await this.db.transaction('rw', ...tables.map(t => this.db[t]), async () => {
      for (const t of tables) {
        await this.db[t].clear();
        const rows = Array.isArray(data[t]) ? data[t] : [];
        if (rows.length) {
          await this.db[t].bulkAdd(rows);
        }
      }
    });
  },

  // ======= SEED DATA =======
  async seedIfEmpty() {
    const count = await this.db.products.count();
    if (count > 0) return;

    // Default settings
    await this.db.settings.bulkPut([
      { key: 'shopName', value: 'Supiri Karawala' },
      { key: 'shopAddress', value: 'Daulagala Handassa' },
      { key: 'shopPhone', value: '077 944 5144' },
      { key: 'shopEmail', value: 'info@myshop.lk' },
      { key: 'receiptFooter', value: 'Thank You, Please Come Again!' },
      { key: 'taxRate', value: '0' },
      { key: 'taxName', value: 'Tax' },
      { key: 'taxEnabled', value: 'false' },
      { key: 'currency', value: 'LKR' },
      { key: 'receiptWidth', value: '80' },
      { key: 'labelPrinter', value: '' },
      { key: 'receiptPrinter', value: '' },
      { key: 'a4Printer', value: '' },
      { key: 'businessProfileVersion', value: 'print-care-plus-2026-05' }
    ]);

    await this.ensureDefaultUserAccounts();

    // Categories
    const cats = [
      { name: 'Pens' }, { name: 'Pencils' }, { name: 'Books' },
      { name: 'Notebooks' }, { name: 'Art Supplies' }, { name: 'Office Items' },
      { name: 'School Items' }, { name: 'Paper' }, { name: 'Files' },
      { name: 'Markers' }, { name: 'Erasers' }, { name: 'Rulers' }
    ];
    const catIds = {};
    for (const c of cats) {
      catIds[c.name] = await this.db.categories.add(c);
    }

    // Sample products
    const products = [
      { name: 'Pilot G2 Blue', barcode: '100001', categoryId: catIds['Pens'], brand: 'Pilot', sellingPrice: 350, costPrice: 250, stock: 50, reorderLevel: 10, emoji: '🖊️' },
      { name: 'Pilot G2 Black', barcode: '100002', categoryId: catIds['Pens'], brand: 'Pilot', sellingPrice: 350, costPrice: 250, stock: 45, reorderLevel: 10, emoji: '🖊️' },
      { name: 'Pilot G2 Red', barcode: '100003', categoryId: catIds['Pens'], brand: 'Pilot', sellingPrice: 350, costPrice: 250, stock: 30, reorderLevel: 10, emoji: '🖊️' },
      { name: 'BIC Crystal Blue', barcode: '100004', categoryId: catIds['Pens'], brand: 'BIC', sellingPrice: 75, costPrice: 45, stock: 100, reorderLevel: 20, emoji: '🖊️' },
      { name: 'BIC Crystal Black', barcode: '100005', categoryId: catIds['Pens'], brand: 'BIC', sellingPrice: 75, costPrice: 45, stock: 80, reorderLevel: 20, emoji: '🖊️' },
      { name: 'Uni-ball Signo', barcode: '100006', categoryId: catIds['Pens'], brand: 'Uni', sellingPrice: 450, costPrice: 320, stock: 25, reorderLevel: 5, emoji: '🖊️' },
      { name: 'Atlas Chooty Pen', barcode: '100007', categoryId: catIds['Pens'], brand: 'Atlas', sellingPrice: 25, costPrice: 15, stock: 200, reorderLevel: 50, emoji: '🖊️' },

      { name: 'HB Pencil', barcode: '200001', categoryId: catIds['Pencils'], brand: 'Atlas', sellingPrice: 20, costPrice: 12, stock: 300, reorderLevel: 50, emoji: '✏️' },
      { name: '2B Pencil', barcode: '200002', categoryId: catIds['Pencils'], brand: 'Atlas', sellingPrice: 25, costPrice: 15, stock: 200, reorderLevel: 40, emoji: '✏️' },
      { name: 'Mechanical Pencil 0.5mm', barcode: '200003', categoryId: catIds['Pencils'], brand: 'Pentel', sellingPrice: 280, costPrice: 180, stock: 40, reorderLevel: 10, emoji: '✏️' },
      { name: 'Colored Pencils 12 Pack', barcode: '200004', categoryId: catIds['Pencils'], brand: 'Faber-Castell', sellingPrice: 650, costPrice: 450, stock: 20, reorderLevel: 5, emoji: '✏️' },

      { name: 'CR Book 200 Pages', barcode: '300001', categoryId: catIds['Books'], brand: 'Atlas', sellingPrice: 180, costPrice: 130, stock: 60, reorderLevel: 15, emoji: '📚' },
      { name: 'CR Book 400 Pages', barcode: '300002', categoryId: catIds['Books'], brand: 'Atlas', sellingPrice: 320, costPrice: 240, stock: 40, reorderLevel: 10, emoji: '📚' },
      { name: 'Square Ruled Book', barcode: '300003', categoryId: catIds['Books'], brand: 'Atlas', sellingPrice: 150, costPrice: 100, stock: 55, reorderLevel: 15, emoji: '📚' },

      { name: 'A4 Notebook 80 Pages', barcode: '400001', categoryId: catIds['Notebooks'], brand: 'Promate', sellingPrice: 220, costPrice: 150, stock: 35, reorderLevel: 10, emoji: '📓' },
      { name: 'A4 Notebook 120 Pages', barcode: '400002', categoryId: catIds['Notebooks'], brand: 'Promate', sellingPrice: 320, costPrice: 220, stock: 25, reorderLevel: 8, emoji: '📓' },
      { name: 'A5 Notebook Spiral', barcode: '400003', categoryId: catIds['Notebooks'], brand: 'Promate', sellingPrice: 180, costPrice: 120, stock: 40, reorderLevel: 10, emoji: '📓' },

      { name: 'Watercolor Set 12', barcode: '500001', categoryId: catIds['Art Supplies'], brand: 'Faber-Castell', sellingPrice: 850, costPrice: 600, stock: 15, reorderLevel: 5, emoji: '🎨' },
      { name: 'Oil Pastel 24 Colors', barcode: '500002', categoryId: catIds['Art Supplies'], brand: 'Faber-Castell', sellingPrice: 950, costPrice: 680, stock: 12, reorderLevel: 3, emoji: '🎨' },
      { name: 'Paint Brush Set', barcode: '500003', categoryId: catIds['Art Supplies'], brand: 'Generic', sellingPrice: 450, costPrice: 280, stock: 20, reorderLevel: 5, emoji: '🎨' },
      { name: 'Sketch Pad A4', barcode: '500004', categoryId: catIds['Art Supplies'], brand: 'Generic', sellingPrice: 380, costPrice: 250, stock: 18, reorderLevel: 5, emoji: '🎨' },

      { name: 'Stapler', barcode: '600001', categoryId: catIds['Office Items'], brand: 'Kangaro', sellingPrice: 550, costPrice: 380, stock: 15, reorderLevel: 5, emoji: '📎' },
      { name: 'Stapler Pins Box', barcode: '600002', categoryId: catIds['Office Items'], brand: 'Kangaro', sellingPrice: 120, costPrice: 70, stock: 50, reorderLevel: 15, emoji: '📎' },
      { name: 'Paper Clips Box', barcode: '600003', categoryId: catIds['Office Items'], brand: 'Generic', sellingPrice: 80, costPrice: 45, stock: 60, reorderLevel: 15, emoji: '📎' },
      { name: 'Scotch Tape', barcode: '600004', categoryId: catIds['Office Items'], brand: '3M', sellingPrice: 180, costPrice: 120, stock: 30, reorderLevel: 10, emoji: '📎' },
      { name: 'Scissors Large', barcode: '600005', categoryId: catIds['Office Items'], brand: 'Generic', sellingPrice: 350, costPrice: 220, stock: 20, reorderLevel: 5, emoji: '✂️' },
      { name: 'Glue Stick', barcode: '600006', categoryId: catIds['Office Items'], brand: 'UHU', sellingPrice: 150, costPrice: 95, stock: 40, reorderLevel: 10, emoji: '🧴' },

      { name: 'School Bag Blue', barcode: '700001', categoryId: catIds['School Items'], brand: 'Generic', sellingPrice: 2500, costPrice: 1800, stock: 8, reorderLevel: 3, emoji: '🎒' },
      { name: 'Geometry Box', barcode: '700002', categoryId: catIds['School Items'], brand: 'Maped', sellingPrice: 650, costPrice: 420, stock: 20, reorderLevel: 5, emoji: '📐' },
      { name: 'Lunch Box', barcode: '700003', categoryId: catIds['School Items'], brand: 'Generic', sellingPrice: 800, costPrice: 550, stock: 12, reorderLevel: 3, emoji: '🍱' },

      { name: 'A4 Paper Ream', barcode: '800001', categoryId: catIds['Paper'], brand: 'IK', sellingPrice: 1200, costPrice: 950, stock: 25, reorderLevel: 5, emoji: '📄' },
      { name: 'Color Paper Pack', barcode: '800002', categoryId: catIds['Paper'], brand: 'Generic', sellingPrice: 350, costPrice: 220, stock: 15, reorderLevel: 5, emoji: '📄' },

      { name: 'Document File A4', barcode: '900001', categoryId: catIds['Files'], brand: 'Promate', sellingPrice: 250, costPrice: 160, stock: 30, reorderLevel: 10, emoji: '📁' },
      { name: 'L-Shape Folder Clear', barcode: '900002', categoryId: catIds['Files'], brand: 'Generic', sellingPrice: 45, costPrice: 25, stock: 100, reorderLevel: 25, emoji: '📁' },
      { name: 'Box File', barcode: '900003', categoryId: catIds['Files'], brand: 'Generic', sellingPrice: 480, costPrice: 320, stock: 15, reorderLevel: 5, emoji: '📁' },

      { name: 'Whiteboard Marker Blue', barcode: '1000001', categoryId: catIds['Markers'], brand: 'Artline', sellingPrice: 280, costPrice: 180, stock: 35, reorderLevel: 10, emoji: '🖍️' },
      { name: 'Highlighter Yellow', barcode: '1000002', categoryId: catIds['Markers'], brand: 'Stabilo', sellingPrice: 250, costPrice: 160, stock: 30, reorderLevel: 8, emoji: '🖍️' },
      { name: 'Permanent Marker Blk', barcode: '1000003', categoryId: catIds['Markers'], brand: 'Artline', sellingPrice: 320, costPrice: 210, stock: 25, reorderLevel: 8, emoji: '🖍️' },

      { name: 'Eraser Large', barcode: '1100001', categoryId: catIds['Erasers'], brand: 'Pelikan', sellingPrice: 40, costPrice: 22, stock: 150, reorderLevel: 30, emoji: '🧹' },
      { name: 'Eraser Small', barcode: '1100002', categoryId: catIds['Erasers'], brand: 'Pelikan', sellingPrice: 20, costPrice: 10, stock: 200, reorderLevel: 50, emoji: '🧹' },

      { name: 'Plastic Ruler 30cm', barcode: '1200001', categoryId: catIds['Rulers'], brand: 'Maped', sellingPrice: 80, costPrice: 45, stock: 60, reorderLevel: 15, emoji: '📏' },
      { name: 'Steel Ruler 30cm', barcode: '1200002', categoryId: catIds['Rulers'], brand: 'Generic', sellingPrice: 220, costPrice: 140, stock: 20, reorderLevel: 5, emoji: '📏' },
    ];

    for (const p of products) {
      p.createdAt = new Date();
      await this.db.products.add(p);
    }

    // Sample suppliers
    await this.db.suppliers.bulkAdd([
      { name: 'Atlas Stationary Ltd', phone: '+94 11 222 3333', email: 'sales@atlas.lk', address: 'Colombo 10', createdAt: new Date() },
      { name: 'Promate Lanka', phone: '+94 11 444 5555', email: 'orders@promate.lk', address: 'Nugegoda', createdAt: new Date() },
      { name: 'Faber-Castell Distributor', phone: '+94 77 888 9999', email: 'dist@faber.lk', address: 'Maharagama', createdAt: new Date() },
    ]);

    // Sample customers
    await this.db.customers.bulkAdd([
      { name: 'Walk-in Customer', phone: '', balance: 0, createdAt: new Date() },
      { name: 'Royal College', phone: '+94 11 269 1592', balance: 0, createdAt: new Date() },
      { name: 'ABC Office Supplies', phone: '+94 77 123 4567', balance: 2500, createdAt: new Date() },
    ]);
  }
};
