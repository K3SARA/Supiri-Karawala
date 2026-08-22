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
    this.db.version(2).stores({
      cheques: '++id, paymentId, customerId, supplierId, saleId, chequeNumber, bankName, status, dueDate, receivedDate, createdAt'
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

  async resetToKarawalaProducts() {
    const migrationKey = 'karawalaProductsV1';
    if (await this.getSetting(migrationKey) === 'done') return;

    await this.db.transaction('rw', this.db.products, this.db.categories, this.db.variations, async () => {
      await this.db.variations.clear();
      await this.db.products.clear();
      await this.db.categories.clear();
    });

    const cats = {};
    cats['Karawala'] = await this.db.categories.add({ name: 'Karawala' });
    cats['Sprats']   = await this.db.categories.add({ name: 'Sprats' });
    cats['Spices']   = await this.db.categories.add({ name: 'Spices' });
    cats['Other']    = await this.db.categories.add({ name: 'Other' });

    const items = [
      { name: 'Balaya',          barcode: 'KW001', categoryId: cats['Karawala'] },
      { name: 'Linna',           barcode: 'KW002', categoryId: cats['Karawala'] },
      { name: 'Kukula',          barcode: 'KW003', categoryId: cats['Karawala'] },
      { name: 'Keerameen',       barcode: 'KW004', categoryId: cats['Karawala'] },
      { name: 'Katthah',         barcode: 'KW005', categoryId: cats['Karawala'] },
      { name: 'Lanka Keegan',    barcode: 'KW006', categoryId: cats['Karawala'] },
      { name: 'Koonisso',        barcode: 'KW007', categoryId: cats['Karawala'] },
      { name: 'Bombilly',        barcode: 'KW008', categoryId: cats['Karawala'] },
      { name: 'Lena Paraw',      barcode: 'KW009', categoryId: cats['Karawala'] },
      { name: 'Sparts Lanka',    barcode: 'SP001', categoryId: cats['Sprats']   },
      { name: 'Sparts Iran',     barcode: 'SP002', categoryId: cats['Sprats']   },
      { name: 'Sparts Thailand', barcode: 'SP003', categoryId: cats['Sprats']   },
      { name: 'Chilly P',        barcode: 'SC001', categoryId: cats['Spices']   },
      { name: 'Masala',          barcode: 'SC002', categoryId: cats['Spices']   },
      { name: 'R. Masala',       barcode: 'SC003', categoryId: cats['Spices']   },
      { name: 'Cutter P',        barcode: 'SC004', categoryId: cats['Spices']   },
      { name: 'Safroon',         barcode: 'SC005', categoryId: cats['Spices']   },
      { name: 'Cumin Sheed P',   barcode: 'SC006', categoryId: cats['Spices']   },
      { name: 'Temric',          barcode: 'SC007', categoryId: cats['Spices']   },
      { name: 'Kiri Moru',       barcode: 'OT001', categoryId: cats['Other']    },
      { name: 'Hurullo',         barcode: 'OT002', categoryId: cats['Other']    },
    ];

    for (const item of items) {
      await this.db.products.add({
        ...item,
        sellingPrice: 0, costPrice: 0, stock: 0, reorderLevel: 5, createdAt: new Date()
      });
    }

    await this.setSetting(migrationKey, 'done');
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
      'getDailySales','getMonthlySales','getCheques','getChequeById','getChequeSummary',
      'getCustomerChequeStats'
    ];
    const writeMethods = [
      'addProduct','updateProduct','deleteProduct','addCategory','updateCategory',
      'deleteCategory','addVariation','updateVariation','deleteVariation','addCustomer',
      'updateCustomer','deleteCustomer','addSupplier','updateSupplier','deleteSupplier',
      'addSale','updateSale','voidSale','addPurchase','reversePurchase','addReturn',
      'addStockAdjustment','addExpense','updateExpense','deleteExpense','addPayment',
      'addCheque','updateCheque','updateChequeStatus','deleteCheque','addPaymentWithCheque',
      'addUser','updateUser','deleteUser','ensureDefaultUserAccounts','setSetting','importData',
      'applyBusinessProfile','seedIfEmpty'
    ];

    readMethods.forEach(name => {
      if (typeof this[name] !== 'function') return;
      const original = this[name].bind(this);
      this[name] = async (...args) => {
        try { await this.pullFromCloud(); } catch (e) {
          console.warn(`pullFromCloud failed for ${name}, using local data:`, e.message);
        }
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
      { key: 'shopName', value: 'SLS' },
      { key: 'shopAddress', value: 'General merchants & wholesale and retail dealers in rice, oil, dried fish, prawns, bomba duck, golden anchovy and all kinds of fish products.' },
      { key: 'shopPhone', value: '' },
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
            const vDeduction = (item.gramsPerPacket > 0) ? item.quantity * item.gramsPerPacket : item.quantity;
            if (!v || (v.stock || 0) < vDeduction) {
              throw new Error(`Insufficient stock for variation ${item.variationId}`);
            }
            await this.db.variations.update(item.variationId, { stock: (v.stock || 0) - vDeduction });
          } else {
            const p = await this.db.products.get(item.productId);
            const deduction = (item.gramsPerPacket > 0) ? item.quantity * item.gramsPerPacket : item.quantity;
            if (!p || (p.stock || 0) < deduction) {
              throw new Error(`Insufficient stock for ${p?.name || 'product'}`);
            }
            await this.db.products.update(item.productId, { stock: Math.max(0, (p.stock || 0) - deduction) });
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
          const restoreAmt = (item.gramsPerPacket > 0) ? (item.quantity || 0) * item.gramsPerPacket : (item.quantity || 0);
          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (v) await this.db.variations.update(item.variationId, { stock: (v.stock || 0) + restoreAmt });
          } else {
            const p = await this.db.products.get(item.productId);
            if (p) await this.db.products.update(item.productId, { stock: (p.stock || 0) + restoreAmt });
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
            const vDeduction = (item.gramsPerPacket > 0) ? item.quantity * item.gramsPerPacket : item.quantity;
            if (!v || (v.stock || 0) < vDeduction) {
              throw new Error(`Insufficient stock for variation ${item.variationId}`);
            }
            await this.db.variations.update(item.variationId, { stock: (v.stock || 0) - vDeduction });
          } else {
            const deduction = (item.gramsPerPacket > 0) ? item.quantity * item.gramsPerPacket : item.quantity;
            const p = await this.db.products.get(item.productId);
            if (!p || (p.stock || 0) < deduction) {
              throw new Error(`Insufficient stock for ${p?.name || 'product'}`);
            }
            await this.db.products.update(item.productId, { stock: (p.stock || 0) - deduction });
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

          const restoreAmt = (item.gramsPerPacket > 0) ? restoreQty * item.gramsPerPacket : restoreQty;
          if (item.variationId) {
            const v = await this.db.variations.get(item.variationId);
            if (v) await this.db.variations.update(item.variationId, { stock: (v.stock || 0) + restoreAmt });
          } else {
            const p = await this.db.products.get(item.productId);
            if (p) await this.db.products.update(item.productId, { stock: (p.stock || 0) + restoreAmt });
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

  // ======= CHEQUES =======
  async getCheques() { return await this.db.cheques.orderBy('createdAt').reverse().toArray(); },
  async getChequeById(id) { return await this.db.cheques.get(id); },

  async addCheque(data) {
    const now = new Date().toISOString();
    return await this.db.cheques.add({ ...data, status: data.status || 'pending', createdAt: now, updatedAt: now });
  },

  async updateCheque(id, data) {
    return await this.db.cheques.update(id, { ...data, updatedAt: new Date().toISOString() });
  },

  async updateChequeStatus(id, newStatus) {
    const cheque = await this.db.cheques.get(id);
    if (!cheque) throw new Error('Cheque not found');
    // Guard invalid transitions
    if (cheque.status === 'cleared' || cheque.status === 'cancelled') {
      throw new Error(`Cannot change status from ${cheque.status}`);
    }
    if (cheque.status === 'bounced' && newStatus !== 'pending') {
      throw new Error('A bounced cheque can only be re-presented (set back to Pending)');
    }

    const now = new Date().toISOString();
    const update = { status: newStatus, updatedAt: now };
    if (newStatus === 'deposited') update.depositedDate = now;
    if (newStatus === 'cleared')   update.clearedDate   = now;
    if (newStatus === 'bounced')   update.bouncedDate   = now;

    if (newStatus === 'bounced' && cheque.customerId) {
      // Reverse the balance reduction: add bounced amount back to customer
      return await this.db.transaction('rw', this.db.cheques, this.db.customers, async () => {
        await this.db.cheques.update(id, update);
        const c = await this.db.customers.get(cheque.customerId);
        if (c) {
          await this.db.customers.update(cheque.customerId, {
            balance: (c.balance || 0) + (cheque.amount || 0)
          });
        }
      });
    }

    return await this.db.cheques.update(id, update);
  },

  async deleteCheque(id) {
    const cheque = await this.db.cheques.get(id);
    if (!cheque) return;
    if (cheque.status === 'cleared') throw new Error('Cannot delete a cleared cheque');
    return await this.db.cheques.delete(id);
  },

  // Records a customer payment and its cheque together as one atomic operation,
  // so a failure partway through never leaves a balance change with no cheque record.
  async addPaymentWithCheque(payment, chequeData) {
    return await this.db.transaction(
      'rw',
      this.db.payments,
      this.db.customers,
      this.db.sales,
      this.db.cheques,
      async () => {
        const paymentId = await this.addPayment(payment);
        const chequeId = await this.addCheque({ ...chequeData, paymentId });
        return { paymentId, chequeId };
      }
    );
  },

  async getChequeSummary() {
    const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
    const tomorrow   = new Date(todayStart); tomorrow.setDate(tomorrow.getDate() + 1);
    const in3Days    = new Date(todayStart); in3Days.setDate(in3Days.getDate() + 4);

    const all     = await this.db.cheques.toArray();
    const pending = all.filter(c => c.status === 'pending');
    const bounced = all.filter(c => c.status === 'bounced');

    const dueToday = pending.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0, 0, 0, 0);
      return d.getTime() === todayStart.getTime();
    });
    const dueSoon = pending.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0, 0, 0, 0);
      return d >= tomorrow && d < in3Days;
    });
    const overdue = pending.filter(c => {
      const d = new Date(c.dueDate); d.setHours(0, 0, 0, 0);
      return d < todayStart;
    });

    const sum = arr => arr.reduce((s, c) => s + (c.amount || 0), 0);
    return { pending, pendingAmount: sum(pending), dueToday, dueTodayAmount: sum(dueToday), dueSoon, dueSoonAmount: sum(dueSoon), overdue, overdueAmount: sum(overdue), bounced, bouncedAmount: sum(bounced) };
  },

  async getCustomerChequeStats(customerId) {
    const all     = await this.db.cheques.where('customerId').equals(customerId).toArray();
    const passed  = all.filter(c => c.status === 'deposited' || c.status === 'cleared');
    const pending = all.filter(c => c.status === 'pending');
    const bounced = all.filter(c => c.status === 'bounced');
    const sum = arr => arr.reduce((s, c) => s + (c.amount || 0), 0);
    return {
      totalCount:    all.length,
      passedCount:   passed.length,
      pendingCount:  pending.length,
      bouncedCount:  bounced.length,
      passedAmount:  sum(passed),
      pendingAmount: sum(pending),
      bouncedAmount: sum(bounced),
    };
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
    return products.filter(p => {
      const gpp = p.packetSizeGrams || 0;
      if (gpp > 0) return Math.floor((p.stock || 0) / gpp) <= (p.reorderLevel || 5);
      return (p.stock || 0) <= (p.reorderLevel || 5);
    });
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
      'stockAdjustments','expenses','payments','users','settings','cheques'];
    for (const t of tables) {
      data[t] = await this.db[t].toArray();
    }
    return data;
  },

  async importData(data) {
    const tables = ['settings','users','categories','products','variations','customers',
      'suppliers','sales','saleItems','purchases','purchaseItems','returns','returnItems',
      'stockAdjustments','expenses','payments','cheques'];
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
      { key: 'a5Printer', value: '' },
      { key: 'businessProfileVersion', value: 'print-care-plus-2026-05' }
    ]);

    await this.ensureDefaultUserAccounts();

    // Categories
    const catIds = {};
    catIds['Karawala'] = await this.db.categories.add({ name: 'Karawala' });
    catIds['Sprats']   = await this.db.categories.add({ name: 'Sprats' });
    catIds['Spices']   = await this.db.categories.add({ name: 'Spices' });
    catIds['Other']    = await this.db.categories.add({ name: 'Other' });

    // Default products
    const products = [
      { name: 'Balaya',          barcode: 'KW001', categoryId: catIds['Karawala'] },
      { name: 'Linna',           barcode: 'KW002', categoryId: catIds['Karawala'] },
      { name: 'Kukula',          barcode: 'KW003', categoryId: catIds['Karawala'] },
      { name: 'Keerameen',       barcode: 'KW004', categoryId: catIds['Karawala'] },
      { name: 'Katthah',         barcode: 'KW005', categoryId: catIds['Karawala'] },
      { name: 'Lanka Keegan',    barcode: 'KW006', categoryId: catIds['Karawala'] },
      { name: 'Koonisso',        barcode: 'KW007', categoryId: catIds['Karawala'] },
      { name: 'Bombilly',        barcode: 'KW008', categoryId: catIds['Karawala'] },
      { name: 'Lena Paraw',      barcode: 'KW009', categoryId: catIds['Karawala'] },
      { name: 'Sparts Lanka',    barcode: 'SP001', categoryId: catIds['Sprats']   },
      { name: 'Sparts Iran',     barcode: 'SP002', categoryId: catIds['Sprats']   },
      { name: 'Sparts Thailand', barcode: 'SP003', categoryId: catIds['Sprats']   },
      { name: 'Chilly P',        barcode: 'SC001', categoryId: catIds['Spices']   },
      { name: 'Masala',          barcode: 'SC002', categoryId: catIds['Spices']   },
      { name: 'R. Masala',       barcode: 'SC003', categoryId: catIds['Spices']   },
      { name: 'Cutter P',        barcode: 'SC004', categoryId: catIds['Spices']   },
      { name: 'Safroon',         barcode: 'SC005', categoryId: catIds['Spices']   },
      { name: 'Cumin Sheed P',   barcode: 'SC006', categoryId: catIds['Spices']   },
      { name: 'Temric',          barcode: 'SC007', categoryId: catIds['Spices']   },
      { name: 'Kiri Moru',       barcode: 'OT001', categoryId: catIds['Other']    },
      { name: 'Hurullo',         barcode: 'OT002', categoryId: catIds['Other']    },
    ];

    for (const p of products) {
      await this.db.products.add({ ...p, sellingPrice: 0, costPrice: 0, stock: 0, reorderLevel: 5, createdAt: new Date() });
    }

    // Sample customers
    await this.db.customers.bulkAdd([
      { name: 'Walk-in Customer', phone: '', balance: 0, createdAt: new Date() },
      { name: 'Royal College', phone: '+94 11 269 1592', balance: 0, createdAt: new Date() },
      { name: 'ABC Office Supplies', phone: '+94 77 123 4567', balance: 2500, createdAt: new Date() },
    ]);
  }
};
