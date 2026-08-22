const fs = require('fs');
const http = require('http');
const path = require('path');
const crypto = require('crypto');
const { Pool } = require('pg');

const publicDir = path.join(__dirname, 'web-dist');
const port = Number(process.env.PORT || 3000);
const databaseUrl = process.env.DATABASE_URL;
const pool = databaseUrl ? new Pool({ connectionString: databaseUrl }) : null;
const TABLES = ['products','categories','variations','customers','suppliers','sales','saleItems','purchases','purchaseItems','returns','returnItems','stockAdjustments','expenses','payments','users','settings','cheques'];

const mimeTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function resolveFile(requestUrl) {
  const url = new URL(requestUrl, `http://localhost:${port}`);
  const decodedPath = decodeURIComponent(url.pathname);
  const normalizedPath = path.normalize(decodedPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(publicDir, normalizedPath);
  const resolvedPath = path.resolve(filePath);

  if (!resolvedPath.startsWith(path.resolve(publicDir))) {
    return null;
  }

  if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
    return resolvedPath;
  }

  return path.join(publicDir, 'index.html');
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Requested-With',
    'Access-Control-Max-Age': '86400'
  };
}

function sendJson(res, statusCode, body) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...corsHeaders()
  });
  res.end(JSON.stringify(body));
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function ensureCloudDb() {
  if (!pool) return false;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      data JSONB NOT NULL,
      revision INTEGER NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  return true;
}

function emptyData() {
  return Object.fromEntries(TABLES.map(table => [table, []]));
}

function normalizeData(data) {
  const next = emptyData();
  for (const table of TABLES) next[table] = Array.isArray(data?.[table]) ? data[table] : [];
  return next;
}

function nextId(rows) {
  return rows.reduce((max, row) => Math.max(max, Number(row.id || 0)), 0) + 1;
}

function byId(rows, id) {
  return rows.find(row => Number(row.id) === Number(id)) || null;
}

function removeById(rows, id) {
  const index = rows.findIndex(row => Number(row.id) === Number(id));
  if (index >= 0) rows.splice(index, 1);
}

function orderByDateDesc(rows, field) {
  return [...rows].sort((a, b) => new Date(b[field] || 0) - new Date(a[field] || 0));
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.pbkdf2Sync(String(password), Buffer.from(salt, 'hex'), 100000, 32, 'sha256').toString('hex');
  return { passwordSalt: salt, passwordHash: hash };
}

function prepareUser(user) {
  const next = { ...user };
  if (next.password && !next.passwordHash) {
    const creds = hashPassword(next.password);
    next.passwordHash = creds.passwordHash;
    next.passwordSalt = creds.passwordSalt;
    next.password = null;
  }
  return next;
}

function addRow(data, table, row) {
  const next = { ...row, id: nextId(data[table]) };
  data[table].push(next);
  return next.id;
}

function updateRow(data, table, id, updates) {
  const row = byId(data[table], id);
  if (!row) return 0;
  Object.assign(row, updates);
  return 1;
}

function getLowStockProducts(data) {
  return data.products.filter(p => (p.stock || 0) <= (p.reorderLevel || 5));
}

function getSettingValue(data, key) {
  const setting = data.settings.find(s => s.key === key);
  return setting ? setting.value : null;
}

function setSettingValue(data, key, value) {
  const setting = data.settings.find(s => s.key === key);
  if (setting) setting.value = value;
  else data.settings.push({ key, value });
}

function applyCustomerCreditToSale(data, sale) {
  sale.creditApplied = 0;
  if (!sale.customerId || (sale.dueAmount || 0) <= 0) return sale;

  const customer = byId(data.customers, sale.customerId);
  const availableCredit = customer?.creditBalance || 0;
  const creditApplied = Math.min(availableCredit, sale.dueAmount || 0);
  if (creditApplied > 0) {
    sale.amountPaid = (sale.amountPaid || 0) + creditApplied;
    sale.dueAmount = Math.max(0, (sale.dueAmount || 0) - creditApplied);
    sale.creditApplied = creditApplied;
  }
  return sale;
}

function addSale(data, saleInput) {
  const sale = { ...saleInput, createdAt: new Date().toISOString(), status: saleInput.status || 'completed', taxRate: saleInput.taxRate || 0 };
  applyCustomerCreditToSale(data, sale);
  const items = sale.items || [];
  delete sale.items;
  const saleId = addRow(data, 'sales', sale);

  for (const itemInput of items) {
    const item = { ...itemInput, saleId };
    addRow(data, 'saleItems', item);

    if (item.variationId) {
      const variation = byId(data.variations, item.variationId);
      const netQty = Math.max(0, item.quantity - (item.boxWeight || 0));
      const vDeduction = (item.gramsPerPacket > 0) ? netQty * item.gramsPerPacket : netQty;
      if (!variation || (variation.stock || 0) < vDeduction) throw new Error(`Insufficient stock for variation ${item.variationId}`);
      variation.stock = (variation.stock || 0) - vDeduction;
    } else {
      const product = byId(data.products, item.productId);
      const netQty = Math.max(0, item.quantity - (item.boxWeight || 0));
      const deduction = (item.gramsPerPacket > 0) ? netQty * item.gramsPerPacket : netQty;
      if (!product || (product.stock || 0) < deduction) throw new Error(`Insufficient stock for ${product?.name || 'product'}`);
      product.stock = (product.stock || 0) - deduction;
    }
  }

  if (sale.customerId && sale.dueAmount > 0) {
    const customer = byId(data.customers, sale.customerId);
    if (customer) {
      customer.balance = (customer.balance || 0) + sale.dueAmount;
      customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - (sale.creditApplied || 0));
    }
  } else if (sale.customerId && sale.creditApplied > 0) {
    const customer = byId(data.customers, sale.customerId);
    if (customer) customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - sale.creditApplied);
  }

  return saleId;
}

function updateSale(data, saleId, updatedSaleInput) {
  const oldSale = byId(data.sales, saleId);
  if (!oldSale) throw new Error('Sale not found');
  if (oldSale.status === 'voided') throw new Error('Cannot edit a voided bill');
  if (data.returns.some(ret => Number(ret.saleId) === Number(saleId))) throw new Error('Cannot edit a bill that has returns');

  const oldItems = data.saleItems.filter(item => Number(item.saleId) === Number(saleId));
  for (const item of oldItems) {
    const netQty = Math.max(0, (item.quantity || 0) - (item.boxWeight || 0));
    const restoreAmt = (item.gramsPerPacket > 0) ? netQty * item.gramsPerPacket : netQty;
    if (item.variationId) {
      const variation = byId(data.variations, item.variationId);
      if (variation) variation.stock = (variation.stock || 0) + restoreAmt;
    } else {
      const product = byId(data.products, item.productId);
      if (product) product.stock = (product.stock || 0) + restoreAmt;
    }
  }

  if (oldSale.customerId && ((oldSale.dueAmount || 0) > 0 || (oldSale.creditApplied || 0) > 0)) {
    const customer = byId(data.customers, oldSale.customerId);
    if (customer) {
      customer.balance = Math.max(0, (customer.balance || 0) - (oldSale.dueAmount || 0));
      customer.creditBalance = (customer.creditBalance || 0) + Math.max(0, (oldSale.creditApplied || 0) - (oldSale.creditReturned || 0));
    }
  }

  data.saleItems = data.saleItems.filter(item => Number(item.saleId) !== Number(saleId));
  const updatedSale = { ...updatedSaleInput, creditReturned: 0, editedAt: new Date().toISOString(), status: updatedSaleInput.status || 'completed' };
  applyCustomerCreditToSale(data, updatedSale);

  for (const itemInput of (updatedSale.items || [])) {
    const item = { ...itemInput, saleId: Number(saleId) };
    addRow(data, 'saleItems', item);
    if (item.variationId) {
      const variation = byId(data.variations, item.variationId);
      const netQty = Math.max(0, item.quantity - (item.boxWeight || 0));
      const vDeduction = (item.gramsPerPacket > 0) ? netQty * item.gramsPerPacket : netQty;
      if (!variation || (variation.stock || 0) < vDeduction) throw new Error(`Insufficient stock for variation ${item.variationId}`);
      variation.stock = (variation.stock || 0) - vDeduction;
    } else {
      const netQty = Math.max(0, item.quantity - (item.boxWeight || 0));
      const deduction = (item.gramsPerPacket > 0) ? netQty * item.gramsPerPacket : netQty;
      const product = byId(data.products, item.productId);
      if (!product || (product.stock || 0) < deduction) throw new Error(`Insufficient stock for ${product?.name || 'product'}`);
      product.stock = (product.stock || 0) - deduction;
    }
  }

  if (updatedSale.customerId && updatedSale.dueAmount > 0) {
    const customer = byId(data.customers, updatedSale.customerId);
    if (customer) {
      customer.balance = (customer.balance || 0) + updatedSale.dueAmount;
      customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - (updatedSale.creditApplied || 0));
    }
  } else if (updatedSale.customerId && updatedSale.creditApplied > 0) {
    const customer = byId(data.customers, updatedSale.customerId);
    if (customer) customer.creditBalance = Math.max(0, (customer.creditBalance || 0) - updatedSale.creditApplied);
  }

  delete updatedSale.items;
  delete updatedSale.id;
  Object.assign(oldSale, updatedSale);
  return Number(saleId);
}

function voidSale(data, saleId) {
  const sale = byId(data.sales, saleId);
  if (!sale) throw new Error('Sale not found');
  if (sale.status === 'voided') return Number(saleId);

  const returnedQtyByItem = {};
  for (const ret of data.returns.filter(r => Number(r.saleId) === Number(saleId))) {
    for (const item of data.returnItems.filter(i => Number(i.returnId) === Number(ret.id))) {
      const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
      returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (item.quantity || 0);
    }
  }

  for (const item of data.saleItems.filter(i => Number(i.saleId) === Number(saleId))) {
    const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
    const netQty = Math.max(0, (item.quantity || 0) - (item.boxWeight || 0));
    const restoreQty = Math.max(0, netQty - (returnedQtyByItem[key] || 0));
    if (restoreQty <= 0) continue;
    const restoreAmt = (item.gramsPerPacket > 0) ? restoreQty * item.gramsPerPacket : restoreQty;
    if (item.variationId) {
      const variation = byId(data.variations, item.variationId);
      if (variation) variation.stock = (variation.stock || 0) + restoreAmt;
    } else {
      const product = byId(data.products, item.productId);
      if (product) product.stock = (product.stock || 0) + restoreAmt;
    }
  }

  if (sale.customerId && ((sale.dueAmount || 0) > 0 || (sale.creditApplied || 0) > (sale.creditReturned || 0))) {
    const customer = byId(data.customers, sale.customerId);
    if (customer) {
      customer.balance = Math.max(0, (customer.balance || 0) - (sale.dueAmount || 0));
      customer.creditBalance = (customer.creditBalance || 0) + Math.max(0, (sale.creditApplied || 0) - (sale.creditReturned || 0));
    }
  }

  Object.assign(sale, { status: 'voided', voidedAt: new Date().toISOString(), voidedBy: null });
  return Number(saleId);
}

function addPurchase(data, purchaseInput) {
  const purchase = { ...purchaseInput, createdAt: new Date().toISOString(), status: purchaseInput.status || 'posted' };
  const items = purchase.items || [];
  delete purchase.items;
  const purchaseId = addRow(data, 'purchases', purchase);
  for (const itemInput of items) {
    const item = { ...itemInput, purchaseId };
    addRow(data, 'purchaseItems', item);
    const product = byId(data.products, item.productId);
    if (!product) continue;
    const currentStock = product.stock || 0;
    const incomingQty = item.quantity || 0;
    const currentCost = product.costPrice || 0;
    const incomingCost = item.buyingPrice || currentCost;
    const newStock = currentStock + incomingQty;
    const gpp = product.packetSizeGrams || 0;
    
    let actualIncomingCostPerPacket = incomingCost;
    if (gpp > 0) actualIncomingCostPerPacket = incomingCost * (gpp / 1000);
    
    let weightedCost = actualIncomingCostPerPacket;
    if (newStock > 0) {
      if (gpp > 0) {
         const currentPackets = currentStock / gpp;
         const incomingPackets = incomingQty / gpp;
         const newPackets = newStock / gpp;
         weightedCost = ((currentPackets * currentCost) + (incomingPackets * actualIncomingCostPerPacket)) / newPackets;
      } else {
         weightedCost = ((currentStock * currentCost) + (incomingQty * actualIncomingCostPerPacket)) / newStock;
      }
    }
    
    product.stock = newStock;
    product.costPrice = weightedCost;
  }
  return purchaseId;
}

function reversePurchase(data, purchaseId) {
  const purchase = byId(data.purchases, purchaseId);
  if (!purchase) throw new Error('Purchase not found');
  if (purchase.status === 'reversed') return Number(purchaseId);
  const purchaseDate = new Date(purchase.createdAt || purchase.date || 0);
  if (data.purchases.some(p => p.status !== 'reversed' && new Date(p.createdAt || 0) > purchaseDate)) {
    throw new Error('Only the latest posted purchase can be reversed. Use stock adjustment for older corrections');
  }
  if (data.sales.some(s => s.status !== 'voided' && new Date(s.createdAt || 0) > purchaseDate) ||
      data.returns.some(r => new Date(r.date || 0) > purchaseDate) ||
      data.stockAdjustments.some(a => new Date(a.date || 0) > purchaseDate)) {
    throw new Error('Cannot reverse purchase after sales, returns, or stock adjustments. Use stock adjustment for corrections');
  }
  for (const item of data.purchaseItems.filter(i => Number(i.purchaseId) === Number(purchaseId))) {
    const product = byId(data.products, item.productId);
    if (!product) continue;
    const currentStock = product.stock || 0;
    const reverseQty = item.quantity || 0;
    if (currentStock < reverseQty) throw new Error(`Cannot reverse purchase. ${product.name} has only ${currentStock} in stock`);
    const buyingPrice = item.buyingPrice || product.costPrice || 0;
    const currentCost = product.costPrice || 0;
    const newStock = currentStock - reverseQty;
    product.stock = newStock;
    product.costPrice = newStock > 0 ? Math.max(0, ((currentStock * currentCost) - (reverseQty * buyingPrice)) / newStock) : currentCost;
  }
  Object.assign(purchase, { status: 'reversed', reversedAt: new Date().toISOString(), reversedBy: null });
  return Number(purchaseId);
}

function addReturn(data, retInput) {
  const ret = { ...retInput, date: retInput.date || new Date().toISOString() };
  const items = ret.items || [];
  delete ret.items;
  const returnId = addRow(data, 'returns', ret);
  const sale = ret.saleId ? byId(data.sales, ret.saleId) : null;
  for (const item of items) {
    addRow(data, 'returnItems', { ...item, returnId });
    if (!item.restock) continue;
    if (item.variationId) {
      const variation = byId(data.variations, item.variationId);
      if (variation) variation.stock = (variation.stock || 0) + item.quantity;
    } else {
      const product = byId(data.products, item.productId);
      if (product) {
         const addBack = (product.packetSizeGrams || 0) > 0 ? item.quantity * product.packetSizeGrams : item.quantity;
         product.stock = (product.stock || 0) + addBack;
      }
    }
  }
  if (sale && ret.totalRefund > 0) {
    const subtotalRefund = items.reduce((s, item) => s + (item.subtotalRefund ?? ((item.quantity || 0) * (item.price || 0))), 0);
    const discountRefund = items.reduce((s, item) => s + (item.discountRefund || 0), 0);
    const taxRefund = items.reduce((s, item) => s + (item.taxRefund || 0), 0);
    const costRefund = items.reduce((s, item) => s + (item.costRefund || ((item.quantity || 0) * (item.costPrice || 0))), 0);
    const itemCountRefund = items.reduce((s, item) => s + (item.quantity || 0), 0);
    const dueBefore = sale.dueAmount || 0;
    const dueAfter = Math.max(0, dueBefore - ret.totalRefund);
    const paidRefund = Math.max(0, ret.totalRefund - (dueBefore - dueAfter));
    const remainingCreditApplied = Math.max(0, (sale.creditApplied || 0) - (sale.creditReturned || 0));
    const creditRefund = Math.min(remainingCreditApplied, paidRefund);
    const totalAfter = Math.max(0, (sale.total || 0) - ret.totalRefund);
    const amountPaidAfter = Math.min(sale.amountPaid || 0, totalAfter);
    Object.assign(sale, {
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
      const customer = byId(data.customers, sale.customerId);
      if (customer) {
        customer.balance = Math.max(0, (customer.balance || 0) - (dueBefore - dueAfter));
        customer.creditBalance = (customer.creditBalance || 0) + creditRefund;
      }
    }
  }
  return returnId;
}

function addStockAdjustment(data, adjInput) {
  const adj = { ...adjInput, date: adjInput.date || new Date().toISOString() };
  const product = byId(data.products, adj.productId);
  if (product) {
    const currentStock = product.stock || 0;
    const costPrice = adj.type === 'in'
      ? (adj.costPrice || adj.buyingPrice || product.costPrice || 0)
      : (product.costPrice || 0);
    const quantity = adj.quantity || 0;
    const lossQty = adj.type === 'in' ? 0 : Math.min(quantity, currentStock);
    
    const gpp = product.packetSizeGrams || 0;
    const lossPackets = gpp > 0 ? (lossQty / gpp) : lossQty;
    
    adj.costPrice = costPrice;
    if (newStock < 0) newStock = 0;
    if (adj.type === 'in') {
      const currentStock = product.stock || 0;
      const incomingQty = adj.quantity || 0;
      const incomingCost = adj.costPrice || product.costPrice || 0;
      product.costPrice = newStock > 0 ? ((currentStock * (product.costPrice || 0)) + (incomingQty * incomingCost)) / newStock : incomingCost;
    }
    product.stock = newStock;
    if (adj.type !== 'in' && (adj.lossAmount || 0) > 0) {
      addRow(data, 'expenses', {
        category: 'Stock Loss',
        date: adj.date,
        description: `${adj.type === 'out' ? 'Stock out' : adj.type} adjustment - ${product.name}${adj.reason ? ` (${adj.reason})` : ''}`,
        amount: adj.lossAmount,
        stockAdjustmentId: id,
        productId: adj.productId
      });
    }
  }
  return id;
}

function addPayment(data, paymentInput) {
  const payment = { ...paymentInput, date: paymentInput.date || new Date().toISOString() };
  if (payment.customerId) {
    let remaining = payment.amount || 0;
    let appliedTotal = 0;
    const sales = data.sales
      .filter(s => Number(s.customerId) === Number(payment.customerId) && s.status !== 'voided' && (s.dueAmount || 0) > 0)
      .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0));
    for (const sale of sales) {
      if (remaining <= 0) break;
      const due = sale.dueAmount || 0;
      const applied = Math.min(remaining, due);
      sale.amountPaid = Math.min(sale.total || 0, (sale.amountPaid || 0) + applied);
      sale.dueAmount = Math.max(0, due - applied);
      sale.change = Math.max(0, sale.amountPaid - (sale.total || 0));
      sale.lastPaymentAt = payment.date;
      remaining -= applied;
      appliedTotal += applied;
    }
    payment.appliedAmount = appliedTotal;
    payment.creditAmount = Math.max(0, remaining);
    const customer = byId(data.customers, payment.customerId);
    if (customer) {
      customer.balance = Math.max(0, (customer.balance || 0) - appliedTotal);
      customer.creditBalance = (customer.creditBalance || 0) + payment.creditAmount;
    }
  }
  return addRow(data, 'payments', payment);
}

function addCheque(data, chequeInput) {
  const now = new Date().toISOString();
  return addRow(data, 'cheques', { ...chequeInput, status: chequeInput.status || 'pending', createdAt: now, updatedAt: now });
}

function updateCheque(data, id, updates) {
  return updateRow(data, 'cheques', id, { ...updates, updatedAt: new Date().toISOString() });
}

function updateChequeStatus(data, id, newStatus) {
  const cheque = byId(data.cheques, id);
  if (!cheque) throw new Error('Cheque not found');
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
  Object.assign(cheque, update);

  if (newStatus === 'bounced') {
    if (cheque.customerId) {
      const customer = byId(data.customers, cheque.customerId);
      if (customer) customer.balance = (customer.balance || 0) + (cheque.amount || 0);
    }
    if (cheque.saleId) {
      const sale = byId(data.sales, cheque.saleId);
      if (sale) sale.status = 'bounced';
    }
  }

  return null;
}

function deleteCheque(data, id) {
  const cheque = byId(data.cheques, id);
  if (!cheque) return null;
  if (cheque.status === 'cleared') throw new Error('Cannot delete a cleared cheque');
  removeById(data.cheques, id);
  return null;
}

function addPaymentWithCheque(data, paymentInput, chequeInput) {
  const paymentId = addPayment(data, paymentInput);
  const chequeId = addCheque(data, { ...chequeInput, paymentId });
  return { paymentId, chequeId };
}

function ensureDefaultUserAccounts(data) {
  for (const legacy of [{ username: 'admin', name: 'Administrator' }, { username: 'cashier', name: 'Cashier User' }]) {
    const user = data.users.find(u => u.username === legacy.username);
    if (user?.name === legacy.name) removeById(data.users, user.id);
  }
  for (const account of [
    { username: 'owner', password: 'owner123', role: 'owner', name: 'Owner' },
    { username: 'worker1', password: 'worker123', role: 'worker', name: 'Worker 1' },
    { username: 'worker2', password: 'worker123', role: 'worker', name: 'Worker 2' },
    { username: 'worker3', password: 'worker123', role: 'worker', name: 'Worker 3' }
  ]) {
    if (!data.users.some(u => u.username === account.username)) addRow(data, 'users', prepareUser(account));
  }
  return null;
}

function applyBusinessProfile(data) {
  if (getSettingValue(data, 'businessProfileVersion') === 'print-care-plus-2026-05') return null;
  setSettingValue(data, 'shopName', 'Supiri Karawala');
  setSettingValue(data, 'shopAddress', 'Daulagala Handassa');
  setSettingValue(data, 'shopPhone', '077 944 5144');
  setSettingValue(data, 'businessProfileVersion', 'print-care-plus-2026-05');
  return null;
}

function mutateData(data, method, args) {
  switch (method) {
    case 'addProduct': return addRow(data, 'products', { ...args[0], createdAt: new Date().toISOString() });
    case 'updateProduct': return updateRow(data, 'products', args[0], args[1]);
    case 'deleteProduct': data.variations = data.variations.filter(v => Number(v.productId) !== Number(args[0])); removeById(data.products, args[0]); return null;
    case 'addCategory': return addRow(data, 'categories', args[0]);
    case 'updateCategory': return updateRow(data, 'categories', args[0], args[1]);
    case 'deleteCategory': removeById(data.categories, args[0]); return null;
    case 'addVariation': return addRow(data, 'variations', args[0]);
    case 'updateVariation': return updateRow(data, 'variations', args[0], args[1]);
    case 'deleteVariation': removeById(data.variations, args[0]); return null;
    case 'addCustomer': return addRow(data, 'customers', { ...args[0], createdAt: new Date().toISOString(), balance: args[0].balance || 0, creditBalance: args[0].creditBalance || 0 });
    case 'updateCustomer': return updateRow(data, 'customers', args[0], args[1]);
    case 'deleteCustomer': removeById(data.customers, args[0]); return null;
    case 'addSupplier': return addRow(data, 'suppliers', { ...args[0], createdAt: new Date().toISOString() });
    case 'updateSupplier': return updateRow(data, 'suppliers', args[0], args[1]);
    case 'deleteSupplier': removeById(data.suppliers, args[0]); return null;
    case 'addSale': return addSale(data, args[0]);
    case 'updateSale': return updateSale(data, args[0], args[1]);
    case 'voidSale': return voidSale(data, args[0]);
    case 'addPurchase': return addPurchase(data, args[0]);
    case 'reversePurchase': return reversePurchase(data, args[0]);
    case 'addReturn': return addReturn(data, args[0]);
    case 'addStockAdjustment': return addStockAdjustment(data, args[0]);
    case 'addExpense': return addRow(data, 'expenses', { ...args[0], date: args[0].date || new Date().toISOString() });
    case 'updateExpense': {
      const expense = byId(data.expenses, args[0]);
      if (expense?.stockAdjustmentId) throw new Error('Stock loss expenses are linked to inventory adjustments and cannot be edited');
      return updateRow(data, 'expenses', args[0], args[1]);
    }
    case 'deleteExpense': {
      const expense = byId(data.expenses, args[0]);
      if (expense?.stockAdjustmentId) throw new Error('Stock loss expenses are linked to inventory adjustments and cannot be deleted');
      removeById(data.expenses, args[0]);
      return null;
    }
    case 'addPayment': return addPayment(data, args[0]);
    case 'addCheque': return addCheque(data, args[0]);
    case 'updateCheque': return updateCheque(data, args[0], args[1]);
    case 'updateChequeStatus': return updateChequeStatus(data, args[0], args[1]);
    case 'deleteCheque': return deleteCheque(data, args[0]);
    case 'addPaymentWithCheque': return addPaymentWithCheque(data, args[0], args[1]);
    case 'addUser': return addRow(data, 'users', prepareUser(args[0]));
    case 'updateUser': return updateRow(data, 'users', args[0], prepareUser(args[1]));
    case 'deleteUser': removeById(data.users, args[0]); return null;
    case 'ensureDefaultUserAccounts': return ensureDefaultUserAccounts(data);
    case 'setSetting': setSettingValue(data, args[0], args[1]); return null;
    case 'importData': {
      const imported = normalizeData(args[0]);
      for (const table of TABLES) data[table] = imported[table];
      return null;
    }
    case 'applyBusinessProfile': return applyBusinessProfile(data);
    case 'seedIfEmpty': return null;
    default: throw new Error(`Unsupported cloud mutation: ${method}`);
  }
}

async function mutateCloudState(method, args) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('LOCK TABLE app_state IN ROW EXCLUSIVE MODE');
    let result = await client.query('SELECT data, revision FROM app_state WHERE id = $1 FOR UPDATE', ['primary']);
    if (result.rowCount === 0) {
      await client.query('INSERT INTO app_state (id, data, revision, updated_at) VALUES ($1, $2::jsonb, $3, NOW())', ['primary', JSON.stringify(emptyData()), 0]);
      result = await client.query('SELECT data, revision FROM app_state WHERE id = $1 FOR UPDATE', ['primary']);
    }

    const data = normalizeData(result.rows[0].data);
    const mutationResult = mutateData(data, method, args || []);
    const nextRevision = Number(result.rows[0].revision || 0) + 1;
    await client.query('UPDATE app_state SET data = $2::jsonb, revision = $3, updated_at = NOW() WHERE id = $1', ['primary', JSON.stringify(data), nextRevision]);
    await client.query('COMMIT');
    return { result: mutationResult, revision: nextRevision };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function handleApi(req, res) {
  if (req.url === '/api/health') {
    sendJson(res, 200, { ok: true, database: Boolean(pool) });
    return true;
  }

  if (!req.url.startsWith('/api/db/snapshot') && req.url !== '/api/db/mutate') return false;

  if (!(await ensureCloudDb())) {
    sendJson(res, 503, { error: 'DATABASE_URL is not configured' });
    return true;
  }

  if (req.url === '/api/db/mutate') {
    if (req.method !== 'POST') {
      res.writeHead(405, { Allow: 'POST' });
      res.end('Method Not Allowed');
      return true;
    }

    const body = await readJson(req);
    if (!body?.method) {
      sendJson(res, 400, { error: 'Missing mutation method' });
      return true;
    }

    const mutation = await mutateCloudState(body.method, body.args || []);
    sendJson(res, 200, mutation);
    return true;
  }

  if (!req.url.startsWith('/api/db/snapshot')) return false;

  if (req.method === 'GET') {
    const parsedUrl = new URL(req.url, `http://localhost:${port}`);
    const clientRevision = Number(parsedUrl.searchParams.get('revision') || 0);
    const result = await pool.query('SELECT data, revision FROM app_state WHERE id = $1', ['primary']);
    if (result.rowCount === 0) {
      sendJson(res, 200, { initialized: false, revision: 0, data: null });
      return true;
    }

    const serverRevision = result.rows[0].revision;
    if (serverRevision <= clientRevision) {
      sendJson(res, 200, { initialized: true, revision: serverRevision, hasUpdates: false });
      return true;
    }

    sendJson(res, 200, {
      initialized: true,
      revision: serverRevision,
      hasUpdates: true,
      data: result.rows[0].data
    });
    return true;
  }

  if (req.method === 'PUT') {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || !body.data) {
      sendJson(res, 400, { error: 'Missing snapshot data' });
      return true;
    }

    const expectedRevision = Number(body.revision || 0);
    const existing = await pool.query('SELECT revision FROM app_state WHERE id = $1', ['primary']);
    if (existing.rowCount > 0 && existing.rows[0].revision !== expectedRevision) {
      const latest = await pool.query('SELECT data, revision FROM app_state WHERE id = $1', ['primary']);
      sendJson(res, 409, {
        error: 'Snapshot revision conflict',
        revision: latest.rows[0].revision,
        data: latest.rows[0].data
      });
      return true;
    }

    const nextRevision = existing.rowCount > 0 ? existing.rows[0].revision + 1 : 1;
    await pool.query(`
      INSERT INTO app_state (id, data, revision, updated_at)
      VALUES ($1, $2::jsonb, $3, NOW())
      ON CONFLICT (id)
      DO UPDATE SET data = EXCLUDED.data, revision = EXCLUDED.revision, updated_at = NOW()
    `, ['primary', JSON.stringify(body.data), nextRevision]);

    sendJson(res, 200, { ok: true, revision: nextRevision });
    return true;
  }

  res.writeHead(405, { Allow: 'GET, PUT' });
  res.end('Method Not Allowed');
  return true;
}

const server = http.createServer(async (req, res) => {
  // Handle CORS preflight (OPTIONS) for all routes
  if (req.method === 'OPTIONS') {
    res.writeHead(204, corsHeaders());
    res.end();
    return;
  }

  if (!['GET', 'HEAD', 'POST', 'PUT', 'DELETE'].includes(req.method)) {
    res.writeHead(405, { Allow: 'GET, HEAD, POST, PUT, DELETE, OPTIONS', ...corsHeaders() });
    res.end('Method Not Allowed');
    return;
  }

  try {
    if (await handleApi(req, res)) return;
  } catch (err) {
    console.error(err);
    sendJson(res, 500, { error: err.message || 'Server error' });
    return;
  }

  const filePath = resolveFile(req.url);
  if (!filePath || !fs.existsSync(filePath)) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', ...corsHeaders() });
    res.end('Not Found');
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=31536000, immutable',
    ...corsHeaders()
  });

  if (req.method === 'HEAD') {
    res.end();
    return;
  }

  fs.createReadStream(filePath).pipe(res);
});

server.listen(port, '0.0.0.0', () => {
  console.log(`Supiri Karawala web app listening on port ${port}`);
});
