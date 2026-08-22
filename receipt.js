/* ===== RECEIPT COMPONENT ===== */
const Receipt = {
  paymentLabel(method) {
    const value = method || 'cash';
    return value.charAt(0).toUpperCase() + value.slice(1);
  },

  async getReturnQtyByItem(saleId) {
    if (!saleId) return {};
    const returnedQtyByItem = {};
    const returns = (await DB.getReturns()).filter(r => r.saleId === saleId);
    for (const ret of returns) {
      const returnItems = await DB.getReturnItems(ret.id);
      for (const item of returnItems) {
        const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
        returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (item.quantity || 0);
      }
    }
    return returnedQtyByItem;
  },

  async getReceiptItems(sale, saleItems) {
    const returnedQtyByItem = await this.getReturnQtyByItem(sale?.id);
    return saleItems.map(item => {
      const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
      const returnedQty = returnedQtyByItem[key] || 0;
      const quantity = Math.max(0, (item.quantity || 0) - returnedQty);
      const originalQty = item.quantity || 0;
      const discount = originalQty > 0 ? (item.discount || 0) * (quantity / originalQty) : 0;
      return {
        ...item,
        quantity,
        discount,
        returnedQty,
        total: quantity * (item.price || 0) - discount
      };
    }).filter(item => item.quantity > 0);
  },

  async chooseFormat(action) {
    Modal.show({
      title: 'Select Receipt Size',
      content: `
        <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">
          <button class="btn btn-outline" id="receiptFormatA4" style="height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            <strong>A4</strong>
            <span style="font-size:12px;color:var(--text-secondary)">Open A4 template</span>
          </button>
          <button class="btn btn-outline" id="receiptFormatA5" style="height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            <strong>A5</strong>
            <span style="font-size:12px;color:var(--text-secondary)">Open A5 template</span>
          </button>
          <button class="btn btn-outline" id="receiptFormat80" style="height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            <strong>80mm</strong>
            <span style="font-size:12px;color:var(--text-secondary)">Use current receipt</span>
          </button>
        </div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>`
    });

    document.getElementById('receiptFormatA4').addEventListener('click', () => {
      Modal.close();
      action('a4');
    });
    document.getElementById('receiptFormatA5').addEventListener('click', () => {
      Modal.close();
      action('a5');
    });
    document.getElementById('receiptFormat80').addEventListener('click', () => {
      Modal.close();
      action('80mm');
    });
  },

  async generate(sale, saleItems) {
    const settings = await DB.getAllSettings();
    const shopName = settings.shopName || 'Supiri Karawala';
    const shopAddress = settings.shopAddress || '';
    const shopPhone = settings.shopPhone || '';
    const footer = settings.receiptFooter || 'Thank You, Please Come Again!';
    const width = settings.receiptWidth || '80';
    const formattedAddress = Utils.escapeHtml(shopAddress).replace(/\n/g, '<br>');
    const receiptLogo = new URL('assets/logo-receipt-bw.png', window.location.href).href;
    const createdAt = sale.createdAt ? new Date(sale.createdAt) : new Date();
    const dateText = createdAt.toLocaleDateString('en-GB');
    const timeText = createdAt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });

    let customer = null;
    if (sale.customerId) customer = await DB.getCustomer(sale.customerId);
    const customerName = customer?.name || 'Walk-In Customer';

    const receiptItems = await this.getReceiptItems(sale, saleItems);
    const itemsHtml = receiptItems.map(item => `
      <tr>
        <td colspan="3" class="item-name">${Utils.escapeHtml(item.name || 'Item')}</td>
      </tr>
      <tr>
        <td class="center qty-cell">${item.quantity}</td>
        <td class="right">${Utils.currencyPlain(item.price)}</td>
        <td class="right">${Utils.currencyPlain(item.quantity * item.price - (item.discount || 0))}</td>
      </tr>
    `).join('') || '<tr><td colspan="3" class="center empty-row">Returned</td></tr>';

    return `
      <style>
        .thermal-receipt {
          box-sizing: border-box;
          width: ${width === '58' ? '50mm' : '74mm'};
          padding: ${width === '58' ? '3mm' : '4mm'};
          color: #000;
          font-family: Arial, Helvetica, sans-serif;
          font-size: ${width === '58' ? '10.5px' : '12px'};
          line-height: 1.28;
        }
        .thermal-receipt * { box-sizing: border-box; }
        .thermal-receipt .brand { text-align: center; margin-bottom: 5px; }
        .thermal-receipt .brand img {
          display: block;
          width: ${width === '58' ? '18mm' : '22mm'};
          height: auto;
          margin: 0 auto 2px;
          filter: grayscale(1) contrast(1.2);
        }
        .thermal-receipt .shop-title {
          font-family: Georgia, 'Times New Roman', serif;
          font-size: ${width === '58' ? '21px' : '27px'};
          font-weight: 700;
          line-height: 1;
          margin-top: 1px;
        }
        .thermal-receipt .shop-subtitle {
          font-weight: 700;
          font-size: ${width === '58' ? '10px' : '12px'};
          margin-top: 1px;
        }
        .thermal-receipt .shop-meta {
          font-size: ${width === '58' ? '9px' : '10.5px'};
          margin-top: 3px;
        }
        .thermal-receipt .line {
          border-top: 1px dashed #000;
          margin: 5px 0;
          height: 0;
        }
        .thermal-receipt .meta-row,
        .thermal-receipt .total-row {
          display: flex;
          justify-content: space-between;
          gap: 8px;
        }
        .thermal-receipt table {
          width: 100%;
          border-collapse: collapse;
          font: inherit;
        }
        .thermal-receipt th {
          background: #3f3f3f;
          color: #fff;
          padding: 2px 3px;
          font-weight: 700;
        }
        .thermal-receipt td {
          padding: 1px 3px;
          vertical-align: top;
        }
        .thermal-receipt .item-name {
          padding-top: 4px;
          text-transform: uppercase;
          word-break: break-word;
        }
        .thermal-receipt .qty-cell { width: 22%; }
        .thermal-receipt .right { text-align: right; }
        .thermal-receipt .center { text-align: center; }
        .thermal-receipt .empty-row { padding: 6px 0; }
        .thermal-receipt .summary { padding: 0 2px; }
        .thermal-receipt .summary .label { font-weight: 700; }
        .thermal-receipt .grand { font-weight: 800; font-size: ${width === '58' ? '12px' : '14px'}; }
        .thermal-receipt .footer {
          text-align: center;
          margin-top: 6px;
          font-weight: 700;
          font-size: ${width === '58' ? '10px' : '12px'};
        }
        .thermal-receipt .powered {
          text-align: center;
          margin-top: 4px;
          font-size: ${width === '58' ? '8.5px' : '10px'};
          font-weight: 700;
        }
        .thermal-receipt #receiptBarcode svg {
          display: block;
          max-width: 100%;
          height: auto;
          margin: 0 auto;
        }
      </style>
      <div class="thermal-receipt">
        <div class="brand">
          <img src="${receiptLogo}" alt="Supiri Karawala logo">
          <div class="shop-title">${Utils.escapeHtml(shopName)}</div>
          <div class="shop-subtitle">Premium Dried Fish & Food Products</div>
          ${shopAddress ? `<div class="shop-meta">${formattedAddress}</div>` : ''}
          ${shopPhone ? `<div class="shop-meta">Tel: ${Utils.escapeHtml(shopPhone)}</div>` : ''}
        </div>
        <div class="line"></div>
        <div>
          <div class="meta-row"><span>Date: ${dateText}</span><span>Time: ${timeText}</span></div>
          <div>Invoice No: ${Utils.escapeHtml(sale.invoiceNo || 'N/A')}</div>
          <div>Cashier: ${Utils.escapeHtml(sale.cashierName || 'Admin')}</div>
          <div>Customer: ${Utils.escapeHtml(customerName)}</div>
        </div>
        <div class="line"></div>
        <table>
          <thead>
            <tr>
              <th class="center">Qty</th>
              <th class="right">Price</th>
              <th class="right">Amount</th>
            </tr>
          </thead>
          <tbody>
          ${itemsHtml}
          </tbody>
        </table>
        <div class="line"></div>
        <div class="summary">
          <div class="total-row"><span>Subtotal:</span><span>LKR ${Utils.currencyPlain(sale.subtotal)}</span></div>
          ${sale.discount > 0 ? `<div class="total-row"><span>Discount:</span><span>- LKR ${Utils.currencyPlain(sale.discount)}</span></div>` : ''}
          ${sale.tax > 0 ? `<div class="total-row"><span>Tax:</span><span>LKR ${Utils.currencyPlain(sale.tax)}</span></div>` : ''}
          <div class="total-row grand"><span>Total:</span><span>LKR ${Utils.currencyPlain(sale.total)}</span></div>
          <div class="total-row"><span class="label">Payment:</span><span>${this.paymentLabel(sale.paymentMethod)}</span></div>
          <div class="total-row grand"><span>Paid:</span><span>LKR ${Utils.currencyPlain(sale.amountPaid || 0)}</span></div>
          ${(sale.change || 0) > 0 ? `<div class="total-row grand"><span>Balance:</span><span>LKR ${Utils.currencyPlain(sale.change)}</span></div>` : ''}
          <div class="total-row grand"><span>Due:</span><span>LKR ${Utils.currencyPlain(sale.dueAmount || 0)}</span></div>
          <div class="total-row" style="margin-top: 4px;"><span>Total Items:</span><span>${receiptItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</span></div>
        </div>
        <div class="line"></div>
        <div class="footer">${Utils.escapeHtml(footer)}</div>
        <div class="powered">Powered by J&amp;co.</div>
        <div id="receiptBarcode" style="text-align:center;margin-top:6px;"></div>
      </div>
    `;
  },

  async generateA4(sale, saleItems) {
    const settings = await DB.getAllSettings();
    let shopName = settings.shopName || 'SLS';
    let shopDesc = (settings.shopAddress || '').replace(/\n/g, ' ');
    if (shopName === 'Supiri Karawala') {
      shopName = 'SLS';
    }
    if (!shopDesc || shopDesc === 'Daulagala Handassa') {
      shopDesc = 'General merchants & wholesale and retail dealers in rice, oil, dried fish, prawns, bomba duck, golden anchovy and all kinds of fish products.';
    }

    const customer = sale.customerId ? await DB.getCustomer(sale.customerId) : null;
    const customerName = customer?.name || 'Walk-In Customer';
    const dateText = sale.createdAt
      ? new Date(sale.createdAt).toLocaleDateString('en-GB')
      : new Date().toLocaleDateString('en-GB');

    const receiptItems = await this.getReceiptItems(sale, saleItems);

    const MIN_ROWS = 20;
    const itemRowsHtml = receiptItems.map((item, idx) => {
      const qty = item.quantity || 0;
      const price = item.price || 0;
      const total = item.total ?? (qty * price - (item.discount || 0));
      const rs = Math.floor(total);
      const cts = Math.round((total - rs) * 100);
      const gpp = item.gramsPerPacket || 0;
      const qtyLabel = gpp > 0 ? `${qty}p` : qty;
      const nameLabel = gpp > 0 ? `${Utils.escapeHtml(item.name || 'Item')} (${gpp}g)` : Utils.escapeHtml(item.name || 'Item');
      return `<tr>
        <td class="c-no">${idx + 1}</td>
        <td class="c-desc">${nameLabel}</td>
        <td class="c-qty">${qtyLabel}</td>
        <td class="c-rate">${Utils.currencyPlain(price)}</td>
        <td class="c-rs">${rs.toLocaleString('en-US')}</td>
        <td class="c-cts">${cts.toString().padStart(2, '0')}</td>
      </tr>`;
    }).join('');

    const emptyCount = Math.max(0, MIN_ROWS - receiptItems.length);
    const emptyRowsHtml = Array.from({ length: emptyCount }, () =>
      `<tr><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-qty"></td><td class="c-rate"></td><td class="c-rs"></td><td class="c-cts"></td></tr>`
    ).join('');

    const discount = sale.discount || 0;
    const total = sale.total || 0;
    const payMethod = this.paymentLabel(sale.paymentMethod);

    const extraInfoHtml = [
      discount > 0 ? `Discount: -${Utils.currencyPlain(discount)}` : '',
      (sale.tax || 0) > 0 ? `Tax: ${Utils.currencyPlain(sale.tax)}` : '',
      `Payment: ${payMethod}`
    ].filter(Boolean).join(' | ');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${Utils.escapeHtml(shopName)} - Invoice</title>
<style>
  @page { size: portrait; margin: 15mm 18mm 15mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000; background: #fff; line-height: 1.3; padding: 0; }

  .bill-container { width: 100%; max-width: 100%; display: flex; flex-direction: column; }

  .hdr { text-align: center; margin-bottom: 20px; }
  .hdr-name { font-size: 48px; font-weight: 900; font-family: 'Arial Black', Arial, sans-serif; color: #1b52c0; letter-spacing: 0.12em; line-height: 1.1; text-transform: uppercase; margin-bottom: 4px; }
  .hdr-desc { font-size: 12px; color: #1b52c0; font-weight: normal; max-width: 90%; margin: 0 auto; line-height: 1.4; text-align: center; }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 15px;
    font-size: 14px;
    color: #1b52c0;
    font-weight: bold;
  }
  .meta-customer { display: flex; flex: 1; align-items: flex-end; }
  .meta-date { display: flex; width: 220px; align-items: flex-end; margin-left: 20px; }
  .dotted-line {
    border-bottom: 2px dotted #1b52c0;
    flex: 1;
    margin-left: 8px;
    padding-bottom: 2px;
    color: #000;
    font-weight: normal;
    font-size: 14px;
    min-height: 20px;
    text-align: left;
  }

  table.inv-table { width: 100%; border-collapse: collapse; margin-top: 5px; }
  table.inv-table th, table.inv-table td {
    border: 1px solid #1b52c0;
    padding: 6px 8px;
    font-size: 13px;
  }
  table.inv-table th {
    background-color: #1b52c0;
    color: #fff;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
  }
  table.inv-table td {
    height: 32px;
    vertical-align: middle;
    color: #000;
  }
  table.inv-table .c-no   { width: 6%; text-align: center; }
  table.inv-table .c-desc { width: 54%; text-align: left; }
  table.inv-table .c-qty  { width: 10%; text-align: center; }
  table.inv-table .c-rate { width: 12%; text-align: right; }
  table.inv-table .c-rs   { width: 13%; text-align: right; border-right: none; }
  table.inv-table .c-cts  { width: 5%; text-align: center; border-left: none; position: relative; }
  table.inv-table .c-cts::before {
    content: "";
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    border-left: 1px solid #1b52c0;
  }

  table.inv-table tr.tfoot-row td {
    border: none;
    height: 36px;
    vertical-align: middle;
    padding-top: 6px;
  }
  table.inv-table tr.tfoot-row td.invoice-no-val {
    color: #cc0000;
    font-family: 'Courier New', Courier, monospace;
    font-weight: bold;
    font-size: 20px;
    text-align: left;
    padding-left: 10px;
    letter-spacing: 1px;
  }
  table.inv-table tr.tfoot-row td.extra-info-cell {
    text-align: right;
    font-size: 11px;
    color: #555;
    padding-right: 15px;
    font-weight: normal;
  }
  table.inv-table tr.tfoot-row td.total-label {
    text-align: right;
    font-weight: bold;
    font-size: 16px;
    color: #1b52c0;
    padding-right: 15px;
  }
  table.inv-table tr.tfoot-row td.total-box-cell {
    border: 2px solid #1b52c0;
    background-color: #fff;
    text-align: right;
    padding-right: 10px;
    font-weight: bold;
    font-size: 16px;
    color: #000;
  }

  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
  }
</style>
</head>
<body>
<div class="bill-container">
  <div class="hdr">
    <div class="hdr-name">${Utils.escapeHtml(shopName)}</div>
    <div class="hdr-desc">${Utils.escapeHtml(shopDesc)}</div>
  </div>

  <div class="meta-row">
    <div class="meta-customer">
      Customer <span class="dotted-line">${Utils.escapeHtml(customerName)}</span>
    </div>
    <div class="meta-date">
      Date <span class="dotted-line">${dateText}</span>
    </div>
  </div>

  <table class="inv-table">
    <thead>
      <tr>
        <th class="c-no">No</th>
        <th class="c-desc">Description</th>
        <th class="c-qty">Qty</th>
        <th class="c-rate">Rate</th>
        <th class="c-rs">Rs</th>
        <th class="c-cts">Cts</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
      ${emptyRowsHtml}
      <tr class="tfoot-row">
        <td colspan="2" rowspan="3" class="invoice-no-val" style="vertical-align:top; padding-top:15px;">${Utils.escapeHtml(sale.invoiceNo || 'N/A')}</td>
        <td rowspan="3" class="extra-info-cell" style="vertical-align:top; padding-top:15px;">${Utils.escapeHtml(extraInfoHtml)}</td>
        <td class="total-label">Total</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(total)}</td>
      </tr>
      <tr class="tfoot-row">
        <td class="total-label">Paid</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(sale.amountPaid || 0)}</td>
      </tr>
      <tr class="tfoot-row">
        <td class="total-label">Due</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(sale.dueAmount || 0)}</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;
  },

  async generateA5(sale, saleItems) {
    const settings = await DB.getAllSettings();
    let shopName = settings.shopName || 'SLS';
    let shopDesc = (settings.shopAddress || '').replace(/\n/g, ' ');
    if (shopName === 'Supiri Karawala') {
      shopName = 'SLS';
    }
    if (!shopDesc || shopDesc === 'Daulagala Handassa') {
      shopDesc = 'General merchants & wholesale and retail dealers in rice, oil, dried fish, prawns, bomba duck, golden anchovy and all kinds of fish products.';
    }

    const customer = sale.customerId ? await DB.getCustomer(sale.customerId) : null;
    const customerName = customer?.name || 'Walk-In Customer';
    const dateText = sale.createdAt
      ? new Date(sale.createdAt).toLocaleDateString('en-GB')
      : new Date().toLocaleDateString('en-GB');

    const receiptItems = await this.getReceiptItems(sale, saleItems);

    const MIN_ROWS = 12;
    const itemRowsHtml = receiptItems.map((item, idx) => {
      const qty = item.quantity || 0;
      const price = item.price || 0;
      const total = item.total ?? (qty * price - (item.discount || 0));
      const rs = Math.floor(total);
      const cts = Math.round((total - rs) * 100);
      const gpp = item.gramsPerPacket || 0;
      const qtyLabel = gpp > 0 ? `${qty}p` : qty;
      const nameLabel = gpp > 0 ? `${Utils.escapeHtml(item.name || 'Item')} (${gpp}g)` : Utils.escapeHtml(item.name || 'Item');
      return `<tr>
        <td class="c-no">${idx + 1}</td>
        <td class="c-desc">${nameLabel}</td>
        <td class="c-qty">${qtyLabel}</td>
        <td class="c-rate">${Utils.currencyPlain(price)}</td>
        <td class="c-rs">${rs.toLocaleString('en-US')}</td>
        <td class="c-cts">${cts.toString().padStart(2, '0')}</td>
      </tr>`;
    }).join('');

    const emptyCount = Math.max(0, MIN_ROWS - receiptItems.length);
    const emptyRowsHtml = Array.from({ length: emptyCount }, () =>
      `<tr><td class="c-no">&nbsp;</td><td class="c-desc"></td><td class="c-qty"></td><td class="c-rate"></td><td class="c-rs"></td><td class="c-cts"></td></tr>`
    ).join('');

    const discount = sale.discount || 0;
    const total = sale.total || 0;
    const payMethod = this.paymentLabel(sale.paymentMethod);

    const extraInfoHtml = [
      discount > 0 ? `Discount: -${Utils.currencyPlain(discount)}` : '',
      (sale.tax || 0) > 0 ? `Tax: ${Utils.currencyPlain(sale.tax)}` : '',
      `Payment: ${payMethod}`
    ].filter(Boolean).join(' | ');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title>${Utils.escapeHtml(shopName)} - Invoice</title>
<style>
  @page { size: portrait; margin: 10mm 12mm 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #000; background: #fff; line-height: 1.25; padding: 0; }

  .bill-container { width: 100%; max-width: 100%; display: flex; flex-direction: column; }

  .hdr { text-align: center; margin-bottom: 12px; }
  .hdr-name { font-size: 34px; font-weight: 900; font-family: 'Arial Black', Arial, sans-serif; color: #1b52c0; letter-spacing: 0.1em; line-height: 1.1; text-transform: uppercase; margin-bottom: 2px; }
  .hdr-desc { font-size: 9px; color: #1b52c0; font-weight: normal; max-width: 95%; margin: 0 auto; line-height: 1.35; text-align: center; }

  .meta-row {
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
    margin-bottom: 10px;
    font-size: 12px;
    color: #1b52c0;
    font-weight: bold;
  }
  .meta-customer { display: flex; flex: 1; align-items: flex-end; }
  .meta-date { display: flex; width: 160px; align-items: flex-end; margin-left: 15px; }
  .dotted-line {
    border-bottom: 1.5px dotted #1b52c0;
    flex: 1;
    margin-left: 6px;
    padding-bottom: 1px;
    color: #000;
    font-weight: normal;
    font-size: 12px;
    min-height: 16px;
    text-align: left;
  }

  table.inv-table { width: 100%; border-collapse: collapse; margin-top: 3px; }
  table.inv-table th, table.inv-table td {
    border: 1px solid #1b52c0;
    padding: 4px 6px;
    font-size: 11px;
  }
  table.inv-table th {
    background-color: #1b52c0;
    color: #fff;
    font-weight: bold;
    text-transform: uppercase;
    text-align: center;
  }
  table.inv-table td {
    height: 26px;
    vertical-align: middle;
    color: #000;
  }
  table.inv-table .c-no   { width: 6%; text-align: center; }
  table.inv-table .c-desc { width: 54%; text-align: left; }
  table.inv-table .c-qty  { width: 10%; text-align: center; }
  table.inv-table .c-rate { width: 12%; text-align: right; }
  table.inv-table .c-rs   { width: 13%; text-align: right; }
  table.inv-table .c-cts  { width: 5%; text-align: center; }

  table.inv-table tr.tfoot-row td {
    border: none;
    height: 30px;
    vertical-align: middle;
    padding-top: 4px;
  }
  table.inv-table tr.tfoot-row td.invoice-no-val {
    color: #cc0000;
    font-family: 'Courier New', Courier, monospace;
    font-weight: bold;
    font-size: 16px;
    text-align: left;
    padding-left: 5px;
    letter-spacing: 0.5px;
  }
  table.inv-table tr.tfoot-row td.extra-info-cell {
    text-align: right;
    font-size: 9.5px;
    color: #555;
    padding-right: 10px;
    font-weight: normal;
  }
  table.inv-table tr.tfoot-row td.total-label {
    text-align: right;
    font-weight: bold;
    font-size: 13px;
    color: #1b52c0;
    padding-right: 10px;
  }
  table.inv-table tr.tfoot-row td.total-box-cell {
    border: 1.5px solid #1b52c0;
    background-color: #fff;
    text-align: right;
    padding-right: 8px;
    font-weight: bold;
    font-size: 13px;
    color: #000;
  }

  @media print {
    body { background: #fff; -webkit-print-color-adjust: exact; print-color-adjust: exact; padding: 0; }
  }
</style>
</head>
<body>
<div class="bill-container">
  <div class="hdr">
    <div class="hdr-name">${Utils.escapeHtml(shopName)}</div>
    <div class="hdr-desc">${Utils.escapeHtml(shopDesc)}</div>
  </div>

  <div class="meta-row">
    <div class="meta-customer">
      Customer <span class="dotted-line">${Utils.escapeHtml(customerName)}</span>
    </div>
    <div class="meta-date">
      Date <span class="dotted-line">${dateText}</span>
    </div>
  </div>

  <table class="inv-table">
    <thead>
      <tr>
        <th class="c-no">No</th>
        <th class="c-desc">Description</th>
        <th class="c-qty">Qty</th>
        <th class="c-rate">Rate</th>
        <th class="c-rs">Rs</th>
        <th class="c-cts">Cts</th>
      </tr>
    </thead>
    <tbody>
      ${itemRowsHtml}
      ${emptyRowsHtml}
      <tr class="tfoot-row">
        <td colspan="2" rowspan="3" class="invoice-no-val" style="vertical-align:top; padding-top:10px;">${Utils.escapeHtml(sale.invoiceNo || 'N/A')}</td>
        <td rowspan="3" class="extra-info-cell" style="vertical-align:top; padding-top:10px;">${Utils.escapeHtml(extraInfoHtml)}</td>
        <td class="total-label">Total</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(total)}</td>
      </tr>
      <tr class="tfoot-row">
        <td class="total-label">Paid</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(sale.amountPaid || 0)}</td>
      </tr>
      <tr class="tfoot-row">
        <td class="total-label">Due</td>
        <td colspan="2" class="total-box-cell">${Utils.currencyPlain(sale.dueAmount || 0)}</td>
      </tr>
    </tbody>
  </table>
</div>
</body>
</html>`;
  },

  async print(sale, saleItems) {
    const receiptHtml = await this.generate(sale, saleItems);
    const printArea = document.getElementById('receiptPrintArea');
    printArea.innerHTML = receiptHtml;
    printArea.style.display = 'block';

    // Generate barcode for invoice
    try {
      const barcodeEl = printArea.querySelector('#receiptBarcode');
      if (barcodeEl && sale.invoiceNo) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        barcodeEl.appendChild(svg);
        const receiptWidth = await DB.getSetting('receiptWidth');
        JsBarcode(svg, sale.invoiceNo, {
          format: 'CODE128',
          width: receiptWidth === '58' ? 0.42 : 0.58,
          height: receiptWidth === '58' ? 20 : 24,
          fontSize: receiptWidth === '58' ? 6 : 7,
          margin: 0,
          displayValue: true
        });
      }
    } catch(e) {}

    const printWindow = window.open('', '_blank', 'width=400,height=600');
    printWindow.document.write(`
      <html><head><title>Receipt</title>
      <style>
        body { margin: 0; padding: 0; }
        @page { margin: 0; size: ${(await DB.getSetting('receiptWidth')) === '58' ? '58mm' : '80mm'} auto; }
      </style></head><body>${printArea.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
      printArea.style.display = 'none';
    }, 250);
  },

  async printA4(sale, saleItems) {
    const receiptHtml = await this.generateA4(sale, saleItems);
    const printWindow = window.open('', '_blank', 'width=900,height=1000');
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 350);
  },

  async printA5(sale, saleItems) {
    const receiptHtml = await this.generateA5(sale, saleItems);
    const printWindow = window.open('', '_blank', 'width=700,height=800');
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.focus();
      printWindow.print();
    }, 350);
  },

  async printWithFormatChooser(sale, saleItems) {
    await this.chooseFormat((format) => {
      if (format === 'a4') this.printA4(sale, saleItems);
      else if (format === 'a5') this.printA5(sale, saleItems);
      else this.print(sale, saleItems);
    });
  },

  async previewWithFormatChooser(sale, saleItems) {
    await this.chooseFormat((format) => {
      if (format === 'a4') this.printA4(sale, saleItems);
      else if (format === 'a5') this.printA5(sale, saleItems);
      else this.preview(sale, saleItems);
    });
  },

  async preview(sale, saleItems) {
    const receiptHtml = await this.generate(sale, saleItems);
    Modal.show({
      title: 'Receipt Preview',
      content: `<div class="receipt-preview">${receiptHtml}</div>`,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Close</button>
               <button class="btn btn-primary" id="printReceiptBtn">${Utils.icons.print} Print</button>`
    });
    document.getElementById('printReceiptBtn').addEventListener('click', () => {
      Modal.close();
      this.print(sale, saleItems);
    });
  }
};
