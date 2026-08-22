/* ===== PRODUCTS PAGE ===== */
const ProductsPage = {
  _printingBarcode: false,

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const products = await DB.getProducts();
    const categories = await DB.getCategories();
    const catMap = {};
    categories.forEach(c => catMap[c.id] = c.name);

    content.innerHTML = `
      <div class="page-header">
        <h2>Products (${products.length})</h2>
        <div class="page-header-actions">
          <button class="btn btn-outline" id="exportProductsBtn">${Utils.icons.download} Export</button>
          <button class="btn btn-primary" id="addProductBtn">${Utils.icons.plus} Add Product</button>
        </div>
      </div>
      <div id="productsTableContainer"></div>
    `;

    DataTable.render('productsTableContainer', {
      id: 'products',
      columns: [
        { key: 'emoji', label: '', render: r => `<span style="font-size:20px">${r.emoji || '📦'}</span>` },
        { key: 'name', label: 'Product Name', render: r => `<strong>${Utils.escapeHtml(r.name)}</strong>` },
        { key: 'barcode', label: 'Barcode' },
        { key: 'categoryId', label: 'Category', render: r => catMap[r.categoryId] || 'N/A' },
        { key: 'brand', label: 'Brand' },
        { key: 'costPrice', label: 'Cost Price', render: r => Utils.currency(r.costPrice) },
        { key: 'sellingPrice', label: 'Sell Price', render: r => `<strong>${Utils.currency(r.sellingPrice)}</strong>` },
        { key: 'stock', label: 'Stock', render: r => {
          const gpp = r.packetSizeGrams || 0;
          const stockText = gpp > 0 ? `${((r.stock || 0) / 1000).toFixed(2)} kg` : (r.stock || 0);
          const low = gpp > 0
            ? ((r.stock || 0) / gpp) <= (r.reorderLevel || 5)
            : (r.stock || 0) <= (r.reorderLevel || 5);
          return `<span class="badge ${low ? 'badge-danger' : 'badge-success'}">${stockText}</span>`;
        }},
      ],
      data: products,
      actions: (row) => `
        <button class="btn btn-sm btn-ghost" onclick="ProductsPage.editProduct(${row.id})" title="Edit">${Utils.icons.edit}</button>
        <button class="btn btn-sm btn-ghost" onclick="ProductsPage.previewProductBarcode(${row.id})" title="Barcode Label">${Utils.icons.barcode}</button>
        <button class="btn btn-sm btn-ghost" onclick="ProductsPage.deleteProduct(${row.id})" title="Delete" style="color:var(--danger)">${Utils.icons.trash}</button>
      `
    });

    document.getElementById('addProductBtn').addEventListener('click', () => this.showProductForm());
    document.getElementById('exportProductsBtn').addEventListener('click', () => this.exportProducts(products));
  },

  async showProductForm(product = null) {
    const categories = await DB.getCategories();
    const isEdit = !!product;
    Modal.show({
      title: isEdit ? 'Edit Product' : 'Add New Product',
      size: 'lg',
      content: `
        <form id="productForm">
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group"><label class="form-label">Product Name <span class="required">*</span></label>
              <input class="form-input" id="pName" value="${product?.name || ''}" required></div>
            <div class="form-group"><label class="form-label">Barcode</label>
              <input class="form-input" id="pBarcode" value="${product?.barcode || ''}"></div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group"><label class="form-label">Category</label>
              <select class="form-select" id="pCategory">
                <option value="">Select Category</option>
                ${categories.map(c => `<option value="${c.id}" ${product?.categoryId === c.id ? 'selected' : ''}>${c.name}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Brand</label>
              <input class="form-input" id="pBrand" value="${product?.brand || ''}"></div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group"><label class="form-label">Cost Price (LKR) <span class="required">*</span></label>
              <input type="number" class="form-input" id="pCostPrice" value="${product?.costPrice || ''}" min="0" step="0.01" required></div>
            <div class="form-group"><label class="form-label">Selling Price (LKR) <span class="required">*</span></label>
              <input type="number" class="form-input" id="pSellingPrice" value="${product?.sellingPrice || ''}" min="0" step="0.01" required></div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group">
              <label class="form-label" id="pStockLabel">Stock Quantity</label>
              <input type="number" class="form-input" id="pStock" value="${(product?.packetSizeGrams > 0 && product?.stock) ? (product.stock / 1000) : (product?.stock ?? 0)}" min="0" step="any">
              <span id="pStockNote" style="font-size:11px;color:var(--primary);margin-top:3px;display:block;min-height:16px"></span>
            </div>
            <div class="form-group"><label class="form-label">Reorder Level</label>
              <input type="number" class="form-input" id="pReorder" value="${product?.reorderLevel ?? 5}" min="0" step="any"></div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group">
              <label class="form-label">Packet Size <span style="background:var(--primary);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:10px;vertical-align:middle;letter-spacing:0.5px">GRAMS</span></label>
              <input type="number" class="form-input" id="pPacketSize" value="${product?.packetSizeGrams || ''}" min="0.001" step="any" placeholder="e.g. 100 for 100g packets">
              <span style="font-size:11px;color:var(--text-secondary);margin-top:3px;display:block">Bulk items sold by weight. Leave empty for regular unit items.</span>
            </div>
            <div class="form-group"></div>
          </div>
          <div class="form-row" style="margin-bottom:16px">
            <div class="form-group"><label class="form-label">Manufacture Date</label>
              <input type="date" class="form-input" id="pMfgDate" value="${product?.mfgDate || ''}"></div>
            <div class="form-group"><label class="form-label">Expiry Date</label>
              <input type="date" class="form-input" id="pExpDate" value="${product?.expDate || ''}"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Batch No</label>
              <input class="form-input" id="pBatchNo" placeholder="e.g. B001" value="${product?.batchNo || ''}"></div>
            <div class="form-group"></div>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-warning" id="generateBarcodeBtn">${Utils.icons.barcode} Generate & Print Barcode</button>
        <button class="btn btn-primary" id="saveProductBtn">${isEdit ? 'Update' : 'Add'} Product</button>
      `
    });

    // Dynamic stock label based on packet size
    const _pPacketSize = document.getElementById('pPacketSize');
    const _pStock      = document.getElementById('pStock');
    const _pStockLabel = document.getElementById('pStockLabel');
    const _pStockNote  = document.getElementById('pStockNote');
    const _updateStockLabel = () => {
      const ps = parseFloat(_pPacketSize.value) || 0;
      if (ps > 0) {
        _pStockLabel.textContent = 'Stock Quantity (KG)';
        _pStock.placeholder = 'e.g. 400 for 400kg';
        const kg = parseFloat(_pStock.value) || 0;
        const totalGrams = kg * 1000;
        _pStockNote.textContent = totalGrams > 0 ? `Packets (How many packets): ${Math.floor(totalGrams / ps)}` : '';
      } else {
        _pStockLabel.textContent = 'Stock Quantity';
        _pStock.placeholder = '';
        _pStockNote.textContent = '';
      }
    };
    _pPacketSize.addEventListener('input', _updateStockLabel);
    _pStock.addEventListener('input', _updateStockLabel);
    _updateStockLabel();

    document.getElementById('saveProductBtn').addEventListener('click', async () => {
      const data = await this.getProductFormData(product);
      if (!this.validateProductData(data)) return;
      if (!(await this.validateBarcode(data.barcode, product?.id))) return;

      if (isEdit) {
        await DB.updateProduct(product.id, data);
        Toast.success('Updated', `${data.name} updated successfully`);
      } else {
        await DB.addProduct(data);
        Toast.success('Added', `${data.name} added successfully`);
      }
      Modal.close();
      this.render();
    });

    document.getElementById('generateBarcodeBtn').addEventListener('click', async () => {
      const data = await this.getProductFormData(product);
      if (!this.validateProductData(data)) return;

      if (!data.barcode) {
        data.barcode = await this.generateUniqueBarcode();
        document.getElementById('pBarcode').value = data.barcode;
      }
      if (!(await this.validateBarcode(data.barcode, product?.id))) return;

      let savedProduct = { ...product, ...data };
      if (isEdit) {
        await DB.updateProduct(product.id, data);
        savedProduct.id = product.id;
      } else {
        savedProduct.id = await DB.addProduct(data);
      }

      Toast.success('Saved', `${data.name} barcode ready`);
      this.showBarcodePreview(savedProduct, true);
      this.render();
    });
  },

  async getProductFormData(product = null) {
    const categoryId = parseInt(document.getElementById('pCategory').value) || null;
    const category = categoryId ? await DB.getCategory(categoryId) : null;
    return {
      name: document.getElementById('pName').value.trim(),
      barcode: document.getElementById('pBarcode').value.trim(),
      categoryId,
      brand: document.getElementById('pBrand').value.trim(),
      costPrice: parseFloat(document.getElementById('pCostPrice').value) || 0,
      sellingPrice: parseFloat(document.getElementById('pSellingPrice').value) || 0,
      stock: (parseFloat(document.getElementById('pPacketSize').value) || 0) > 0 
                ? (parseFloat(document.getElementById('pStock').value) || 0) * 1000 
                : (parseFloat(document.getElementById('pStock').value) || 0),
      reorderLevel: parseFloat(document.getElementById('pReorder').value) || 5,
      packetSizeGrams: parseFloat(document.getElementById('pPacketSize').value) || 0,
      mfgDate: document.getElementById('pMfgDate').value || null,
      expDate: document.getElementById('pExpDate').value || null,
      batchNo: document.getElementById('pBatchNo').value.trim() || null,
      emoji: product?.emoji || Utils.categoryEmoji(category?.name)
    };
  },

  validateProductData(data) {
    if (!data.name) { Toast.error('Required', 'Product name is required'); return false; }
    if (!data.sellingPrice) { Toast.error('Required', 'Selling price is required'); return false; }
    return true;
  },

  async validateBarcode(barcode, currentProductId = null) {
    if (!barcode) return true;
    const existing = await DB.getProductByBarcode(barcode);
    if (existing && existing.id !== currentProductId) {
      Toast.error('Duplicate Barcode', 'This barcode is already used by another product');
      return false;
    }
    return true;
  },

  async generateUniqueBarcode() {
    let barcode;
    do {
      const suffix = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
      barcode = `${Date.now()}${suffix}`.slice(-12);
    } while (await DB.getProductByBarcode(barcode));
    return barcode;
  },

  labelHtml(product) {
    const safeName  = Utils.escapeHtml(product.name || 'Product');
    const safePrice = Utils.currency(product.sellingPrice || 0);
    const fmtDate   = (d) => d ? d.split('-').reverse().join('/') : '';
    const mfgDate   = fmtDate(product.mfgDate);
    const expDate   = fmtDate(product.expDate);
    const batchNo   = Utils.escapeHtml(product.batchNo || '');
    const weight    = Utils.escapeHtml(product.weight  || '');
    const safeBarcode = Utils.escapeHtml(product.barcode || '');
    return `
      <div class="barcode-label">
        <div class="bl-top">
          <div class="bl-left">
            <div class="bl-date-row"><span class="bl-key">MFD</span><span class="bl-colon">:</span><span class="bl-dval">${mfgDate || '&mdash;'}</span></div>
            <div class="bl-date-row"><span class="bl-key">EXP</span><span class="bl-colon">:</span><span class="bl-dval">${expDate || '&mdash;'}</span></div>
          </div>
          <div class="bl-right">
            <div class="bl-mrp-key">MRP</div>
            <div class="bl-mrp-val">${safePrice}</div>
            <div class="bl-batch-key">Batch No</div>
            <div class="bl-batch-val">${batchNo || '&mdash;'}</div>
          </div>
        </div>
        <div class="bl-name">${safeName}</div>
        ${weight ? `<div class="bl-weight">${weight}</div>` : ''}
        <svg class="barcode-svg"></svg>
        ${safeBarcode ? `<div class="bl-code">${safeBarcode}</div>` : ''}
      </div>
    `;
  },

  printDocumentHtml(labelBody, labelW = 50, labelH = 30, columns = 1, qty = 1, style = {}) {
    const cols   = Math.max(1, Math.min(4, columns));
    const totalW = labelW * cols;
    const rows   = Math.ceil(qty / cols);

    // Use custom values when > 0, otherwise auto-calculate from label dimensions
    const svgW     = Math.max(20, labelW - 6);
    const svgH     = Math.max(6,  Math.floor(labelH * 0.32));
    const datePx   = (style.fontDate  > 0) ? style.fontDate  : Math.max(5, Math.round(labelH * 0.20));
    const mrpValPx = (style.fontMrp   > 0) ? style.fontMrp   : Math.max(7, Math.round(labelH * 0.30));
    const namePx   = (style.fontName  > 0) ? style.fontName  : Math.max(6, Math.round(labelH * 0.27));
    const smallPx  = (style.fontSmall > 0) ? style.fontSmall : Math.max(4, Math.round(labelH * 0.16));
    const keyPx    = datePx;
    const topPct   = (style.topPct     > 0) ? style.topPct     : 38;
    const dateColPct = (style.dateColPct > 0) ? style.dateColPct : 58;
    const mrpColPct  = 100 - dateColPct;
    const pad      = (style.padding    > 0) ? style.padding    : 1;

    const rowsHtml = Array.from({ length: rows }, (_, rowIdx) => {
      const labelsInRow = Array.from({ length: cols }, (__, colIdx) => {
        const labelNum = rowIdx * cols + colIdx;
        return labelNum < qty ? labelBody : `<div class="barcode-label barcode-label-empty"></div>`;
      }).join('');
      const pageBreak = rowIdx > 0 ? 'style="page-break-before:always"' : '';
      return `<div class="label-row" ${pageBreak}>${labelsInRow}</div>`;
    }).join('');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>Barcode Label</title>
<style>
  @page { size: ${totalW}mm ${labelH}mm; margin: 0; }
  html, body { width: ${totalW}mm; margin: 0; padding: 0; background: #fff; color: #000; font-family: Arial, sans-serif; }
  .label-row { display: flex; flex-direction: row; width: ${totalW}mm; height: ${labelH}mm; page-break-inside: avoid; }
  .barcode-label {
    box-sizing: border-box; flex: 0 0 ${labelW}mm; width: ${labelW}mm; height: ${labelH}mm;
    padding: ${pad}mm ${pad + 0.5}mm; display: flex; flex-direction: column; overflow: hidden;
  }
  .barcode-label-empty { background: #fff; }

  /* ── Top section: dates left | MRP+batch right ── */
  .bl-top {
    display: flex; flex-direction: row; width: 100%;
    height: ${Math.round(labelH * topPct / 100 * 10) / 10}mm;
    border-bottom: 0.4px solid #bbb;
    padding-bottom: 0.3mm; margin-bottom: 0.4mm; flex-shrink: 0; overflow: hidden;
  }
  .bl-left {
    flex: 0 0 ${dateColPct}%; display: flex; flex-direction: column; justify-content: center;
    gap: 0.3mm; border-right: 0.4px solid #bbb; padding-right: 1mm; overflow: hidden;
  }
  .bl-date-row { display: flex; align-items: baseline; gap: 1px; }
  .bl-key  { font-size: ${keyPx}px; font-weight: 700; min-width: 5.5mm; }
  .bl-colon{ font-size: ${keyPx}px; font-weight: 700; margin: 0 0.5px; }
  .bl-dval { font-size: ${datePx}px; font-weight: 700; }
  .bl-right {
    flex: 0 0 ${mrpColPct}%; padding-left: 1mm; display: flex; flex-direction: column; justify-content: center; overflow: hidden;
  }
  .bl-mrp-key  { font-size: ${smallPx}px; font-weight: 700; line-height: 1.1; }
  .bl-mrp-val  { font-size: ${mrpValPx}px; font-weight: 700; line-height: 1.1; }
  .bl-batch-key{ font-size: ${smallPx}px; font-weight: 700; line-height: 1.1; margin-top: 0.3mm; }
  .bl-batch-val{ font-size: ${keyPx}px; font-weight: 700; line-height: 1.1; }

  /* ── Name + weight + barcode ── */
  .bl-name {
    font-size: ${namePx}px; font-weight: 700; text-align: center;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    line-height: 1.2; flex-shrink: 0;
  }
  .bl-weight { font-size: ${smallPx}px; font-weight: 700; text-align: center; line-height: 1.2; flex-shrink: 0; }
  .barcode-svg { width: ${svgW}mm; height: ${svgH}mm; display: block; margin: 0 auto; }
  .bl-code { font-size: ${smallPx}px; font-weight: 700; text-align: center; line-height: 1.1; flex-shrink: 0; letter-spacing: 0.3px; }
</style>
</head>
<body>${rowsHtml}</body>
</html>`;
  },

  renderBarcodeSvg(root, barcode) {
    const svg = root.querySelector('.barcode-svg');
    if (!svg || !barcode) return;
    JsBarcode(svg, barcode, {
      format: 'CODE128',
      width: 1.4,
      height: 42,
      margin: 0,
      displayValue: false
    });
  },

  showBarcodePreview(product, autoPrint = false) {
    const labelBody = this.labelHtml(product);
    Modal.show({
      title: 'Barcode Preview',
      content: `
        <div class="barcode-preview-wrap">
          ${labelBody}
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Close</button>
        <div style="display:flex;align-items:center;gap:8px">
          <label style="font-size:13px;color:var(--text-secondary);white-space:nowrap">Qty:</label>
          <input type="number" id="printQtyInput" value="1" min="1" max="500" class="form-input" style="width:64px;text-align:center;padding:6px 8px">
          <button class="btn btn-primary" id="printBarcodeBtn">${Utils.icons.print} Print</button>
        </div>
      `
    });

    this.renderBarcodeSvg(document, product.barcode);
    document.getElementById('printBarcodeBtn').addEventListener('click', () => {
      const qty = Math.max(1, parseInt(document.getElementById('printQtyInput')?.value) || 1);
      this.printBarcodeLabel(product, qty);
    });
    if (autoPrint) setTimeout(() => this.printBarcodeLabel(product, 1), 300);
  },

  async printBarcodeLabel(product, qty = 1) {
    if (this._printingBarcode) return;
    this._printingBarcode = true;
    const printBtn = document.getElementById('printBarcodeBtn');
    if (printBtn) {
      printBtn.disabled = true;
      printBtn.innerHTML = `${Utils.icons.print} Printing...`;
    }

    const printRoot = document.createElement('div');
    printRoot.innerHTML = this.labelHtml(product);
    this.renderBarcodeSvg(printRoot, product.barcode);
    const labelW       = parseFloat(await DB.getSetting('labelWidth'))      || 50;
    const labelH       = parseFloat(await DB.getSetting('labelHeight'))     || 30;
    const labelColumns = parseInt(await DB.getSetting('labelColumns'))      || 1;
    const labelStyle = {
      fontDate:    parseInt(await DB.getSetting('labelFontDate'))   || 0,
      fontMrp:     parseInt(await DB.getSetting('labelFontMrp'))    || 0,
      fontName:    parseInt(await DB.getSetting('labelFontName'))   || 0,
      fontSmall:   parseInt(await DB.getSetting('labelFontSmall'))  || 0,
      topPct:      parseInt(await DB.getSetting('labelTopPct'))     || 0,
      dateColPct:  parseInt(await DB.getSetting('labelDateColPct')) || 0,
      padding:     parseFloat(await DB.getSetting('labelPadding'))  || 0,
    };
    const html = this.printDocumentHtml(printRoot.innerHTML, labelW, labelH, labelColumns, qty, labelStyle);

    try {
      if (window.SupiriKarawala?.printLabel) {
        const labelPrinter = await DB.getSetting('labelPrinter');
        const result = await Promise.race([
          window.SupiriKarawala.printLabel(html, { deviceName: labelPrinter || undefined, labelW, labelH, labelColumns }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Print timed out')), 15000))
        ]);
        Toast.success('Printed', result?.printer
          ? `${qty} label${qty > 1 ? 's' : ''} sent to ${result.printer}`
          : `${qty} label${qty > 1 ? 's' : ''} sent to printer`);
        return;
      }

      await this.printBarcodeInFrame(html);
    } catch (err) {
      Toast.warning('Printer Check', `${err.message || 'Could not print automatically'}. Use browser print dialog if it opens.`);
      await this.printBarcodeInFrame(html);
    } finally {
      this._printingBarcode = false;
      const currentBtn = document.getElementById('printBarcodeBtn');
      if (currentBtn) {
        currentBtn.disabled = false;
        currentBtn.innerHTML = `${Utils.icons.print} Print`;
      }
    }
  },

  printBarcodeInFrame(html) {
    return new Promise((resolve, reject) => {
      const blob = new Blob([html], { type: 'text/html' });
      const blobUrl = URL.createObjectURL(blob);

      const iframe = document.createElement('iframe');
      iframe.title = 'Barcode Print Frame';
      iframe.style.position = 'fixed';
      iframe.style.right = '0';
      iframe.style.bottom = '0';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = '0';
      iframe.style.opacity = '0';

      let cleaned = false;
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        URL.revokeObjectURL(blobUrl);
        setTimeout(() => iframe.remove(), 500);
        resolve();
      };

      iframe.onload = () => {
        try {
          const win = iframe.contentWindow;
          if (!win) throw new Error('Print frame unavailable');
          win.onafterprint = cleanup;
          win.focus();
          setTimeout(() => {
            win.print();
            setTimeout(cleanup, 1500);
          }, 150);
        } catch (err) {
          URL.revokeObjectURL(blobUrl);
          iframe.remove();
          reject(err);
        }
      };

      iframe.src = blobUrl;
      document.body.appendChild(iframe);
    });
  },

  async editProduct(id) {
    const product = await DB.getProduct(id);
    if (product) this.showProductForm(product);
  },

  async previewProductBarcode(id) {
    const product = await DB.getProduct(id);
    if (!product) {
      Toast.error('Not Found', 'Product not found');
      return;
    }

    if (!product.barcode) {
      product.barcode = await this.generateUniqueBarcode();
      await DB.updateProduct(id, { barcode: product.barcode });
      Toast.success('Barcode Generated', `${product.name} barcode created`);
      this.render();
    }

    this.showBarcodePreview(product, false);
  },

  async deleteProduct(id) {
    const product = await DB.getProduct(id);
    Modal.confirm('Delete Product', `Are you sure you want to delete "${product?.name}"?`, async () => {
      await DB.deleteProduct(id);
      Toast.success('Deleted', 'Product deleted');
      this.render();
    });
  },

  exportProducts(products) {
    const csv = 'Name,Barcode,Category,Brand,Cost Price,Selling Price,Stock,Reorder Level\n' +
      products.map(p => `"${p.name}","${p.barcode || ''}","${p.categoryId || ''}","${p.brand || ''}",${p.costPrice},${p.sellingPrice},${p.stock},${p.reorderLevel}`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'products_export.csv';
    a.click();
    Toast.success('Exported', 'Products exported to CSV');
  }
};
