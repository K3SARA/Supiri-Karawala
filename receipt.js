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
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
          <button class="btn btn-outline" id="receiptFormatA4" style="height:86px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px">
            <strong>A4</strong>
            <span style="font-size:12px;color:var(--text-secondary)">Open A4 template</span>
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
          <div class="total-row"><span>Cash Paid:</span><span>LKR ${Utils.currencyPlain(sale.amountPaid)}</span></div>
          <div class="total-row"><span class="label">Balance:</span><span>LKR ${Utils.currencyPlain(sale.change || 0)}</span></div>
          ${sale.dueAmount > 0 ? `<div class="total-row grand"><span>Due:</span><span>LKR ${Utils.currencyPlain(sale.dueAmount)}</span></div>` : ''}
          <div class="total-row"><span>Total Items:</span><span>${receiptItems.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)}</span></div>
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
    const shopName = settings.shopName || 'Supiri Karawala';
    const shopAddress = settings.shopAddress || '';
    const shopPhone = settings.shopPhone || '';
    const shopEmail = settings.shopEmail || '';
    const footer = settings.receiptFooter || 'Thank You, Please Come Again!';
    const logo = new URL('assets/logo.png', window.location.href).href;
    const customer = sale.customerId ? await DB.getCustomer(sale.customerId) : null;
    const status = sale.status === 'voided' ? 'Voided' : ((sale.dueAmount || 0) > 0 ? 'Credit' : 'Paid');

    const addressHtml = Utils.escapeHtml(shopAddress).replace(/\n/g, '<br>');
    const receiptItems = await this.getReceiptItems(sale, saleItems);
    const itemRows = receiptItems.map((item, idx) => {
      const qty = item.quantity || 0;
      const price = item.price || 0;
      const discount = item.discount || 0;
      const total = item.total ?? (qty * price - discount);
      return `
        <tr>
          <td class="center">${String(idx + 1).padStart(2, '0')}</td>
          <td>${Utils.escapeHtml(item.name || 'Item')}</td>
          <td class="center">${qty}</td>
          <td class="right">${Utils.currencyPlain(price)}</td>
          <td class="right">${Utils.currencyPlain(discount)}</td>
          <td class="right">${Utils.currencyPlain(total)}</td>
        </tr>
      `;
    }).join('');

    return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>${Utils.escapeHtml(shopName)} - A4 Receipt</title>
<style>
  @page { size: A4; margin: 16mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: Arial, Helvetica, sans-serif; background:#f6f8fa; color:#1f2933; }
  .page { width: 210mm; min-height: 297mm; margin: 0 auto; padding:16mm; background:#f6f8fa; }
  .sheet { background:#fff; min-height:265mm; border-radius:14px; overflow:hidden; box-shadow:0 8px 30px rgba(16,24,40,.08); }
  .strip { display:grid; grid-template-columns:repeat(4,1fr); height:5mm; }
  .c1{background:#00a6c8} .c2{background:#d9267d} .c3{background:#f4b400} .c4{background:#111827}
  .inner { padding:12mm; }
  .header { display:flex; justify-content:space-between; align-items:flex-start; gap:10mm; }
  .brand { display:flex; gap:8mm; align-items:flex-start; }
  .brand img { width:28mm; height:auto; }
  h1 { margin:0; font-size:25px; letter-spacing:.3px; }
  .muted { color:#667085; font-size:12px; line-height:1.6; }
  .receipt-card { background:#111827; color:#fff; padding:8mm 13mm; border-radius:12px; text-align:center; min-width:56mm; }
  .receipt-card h2 { margin:0 0 3mm; font-size:24px; }
  .dots span { display:inline-block; width:5mm; height:5mm; border-radius:50%; margin:0 1.5mm; }
  .info-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:6mm; margin-top:12mm; }
  .box { border:1px solid #d9dee7; border-radius:10px; overflow:hidden; }
  .box .top { height:4mm; }
  .box-content { padding:5mm; }
  .box h3 { margin:0 0 4mm; font-size:12px; }
  table { width:100%; border-collapse:collapse; margin-top:10mm; font-size:12px; }
  th { background:#111827; color:white; padding:10px 8px; text-align:center; }
  td { border:1px solid #d9dee7; padding:10px 8px; }
  tbody tr:nth-child(even){ background:#fafbfc; }
  .right { text-align:right; } .center { text-align:center; }
  .bottom { display:grid; grid-template-columns:1.4fr 1fr; gap:10mm; margin-top:10mm; }
  .note, .totals { border:1px solid #d9dee7; border-radius:10px; padding:6mm; }
  .note { background:#f8fafc; }
  .total-row { display:flex; justify-content:space-between; margin-bottom:5mm; color:#667085; }
  .grand { background:#111827; color:white; border-radius:8px; padding:4mm; display:flex; justify-content:space-between; font-weight:bold; }
  .signatures { display:flex; justify-content:space-between; margin-top:18mm; text-align:center; color:#667085; font-size:11px; }
  .sig-line { border-top:1px solid #d9dee7; width:60mm; padding-top:3mm; }
  .footer { margin-top:12mm; padding:4mm; background:#f2f4f7; border-radius:8px; text-align:center; color:#667085; font-size:11px; line-height:1.6; }
  @media print { body,.page{background:white} .page{padding:0} .sheet{box-shadow:none;border-radius:0} }
</style>
</head>
<body>
  <main class="page">
    <section class="sheet">
      <div class="strip"><div class="c1"></div><div class="c2"></div><div class="c3"></div><div class="c4"></div></div>
      <div class="inner">
        <div class="header">
          <div class="brand">
            <img src="${logo}" alt="${Utils.escapeHtml(shopName)} logo">
            <div>
              <h1>${Utils.escapeHtml(shopName)}</h1>
              <div class="muted">Premium Dried Fish & Food Products<br>${addressHtml}${shopPhone ? `<br>Tel: ${Utils.escapeHtml(shopPhone)}` : ''}${shopEmail ? ` | Email: ${Utils.escapeHtml(shopEmail)}` : ''}</div>
            </div>
          </div>
          <div class="receipt-card">
            <h2>RECEIPT</h2>
            <div style="font-size:11px">TAX / CASH BILL</div>
            <div class="dots" style="margin-top:5mm"><span class="c1"></span><span class="c2"></span><span class="c3"></span></div>
          </div>
        </div>
        <div class="info-grid">
          <div class="box"><div class="top c1"></div><div class="box-content"><h3>BILL TO</h3><div class="muted">Customer Name: ${Utils.escapeHtml(customer?.name || 'Walk-in Customer')}<br>Phone: ${Utils.escapeHtml(customer?.phone || '-')}<br>Address: ${Utils.escapeHtml(customer?.address || '-')}</div></div></div>
          <div class="box"><div class="top c2"></div><div class="box-content"><h3>RECEIPT DETAILS</h3><div class="muted">Invoice: ${Utils.escapeHtml(sale.invoiceNo || 'N/A')}<br>Date: ${Utils.formatDateTime(sale.createdAt)}<br>Cashier: ${Utils.escapeHtml(sale.cashierName || 'Admin')}</div></div></div>
          <div class="box"><div class="top c3"></div><div class="box-content"><h3>PAYMENT</h3><div class="muted">Method: ${this.paymentLabel(sale.paymentMethod)}<br>Status: ${status}<br>Currency: LKR</div></div></div>
        </div>
        <table>
          <thead><tr><th>#</th><th>Item Description</th><th>Qty</th><th>Unit Price</th><th>Discount</th><th>Total</th></tr></thead>
          <tbody>${itemRows || '<tr><td colspan="6" class="center">No items</td></tr>'}</tbody>
        </table>
        <div class="bottom">
          <div class="note"><b>Notes / Terms</b><div class="muted" style="margin-top:4mm">${Utils.escapeHtml(footer)}<br>Goods once sold are not returnable unless stated.<br>Please keep this receipt for future reference.<br>Powered by J&amp;co.</div></div>
          <div class="totals">
            <div class="total-row"><span>Sub Total</span><span>${Utils.currencyPlain(sale.subtotal || 0)}</span></div>
            <div class="total-row"><span>Discount</span><span>${Utils.currencyPlain(sale.discount || 0)}</span></div>
            <div class="total-row"><span>Tax</span><span>${Utils.currencyPlain(sale.tax || 0)}</span></div>
            <div class="grand"><span>Grand Total</span><span>LKR ${Utils.currencyPlain(sale.total || 0)}</span></div>
          </div>
        </div>
        <div class="signatures"><div class="sig-line">Customer Signature</div><div class="sig-line">Authorized Signature</div></div>
        <div class="footer">This is a computer generated receipt.<br>${Utils.escapeHtml(shopName)}${shopAddress ? ` | ${Utils.escapeHtml(shopAddress).replace(/\n/g, ', ')}` : ''}${shopPhone ? ` | Tel: ${Utils.escapeHtml(shopPhone)}` : ''}</div>
      </div>
    </section>
  </main>
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

  async printWithFormatChooser(sale, saleItems) {
    await this.chooseFormat((format) => {
      if (format === 'a4') this.printA4(sale, saleItems);
      else this.print(sale, saleItems);
    });
  },

  async previewWithFormatChooser(sale, saleItems) {
    await this.chooseFormat((format) => {
      if (format === 'a4') this.printA4(sale, saleItems);
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
