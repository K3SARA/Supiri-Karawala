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
          const low = (r.stock || 0) <= (r.reorderLevel || 5);
          return `<span class="badge ${low ? 'badge-danger' : 'badge-success'}">${r.stock || 0}</span>`;
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
          <div class="form-row">
            <div class="form-group"><label class="form-label">Stock Quantity</label>
              <input type="number" class="form-input" id="pStock" value="${product?.stock ?? 0}" min="0"></div>
            <div class="form-group"><label class="form-label">Reorder Level</label>
              <input type="number" class="form-input" id="pReorder" value="${product?.reorderLevel ?? 5}" min="0"></div>
          </div>
        </form>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-warning" id="generateBarcodeBtn">${Utils.icons.barcode} Generate & Print Barcode</button>
        <button class="btn btn-primary" id="saveProductBtn">${isEdit ? 'Update' : 'Add'} Product</button>
      `
    });

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
      stock: parseInt(document.getElementById('pStock').value) || 0,
      reorderLevel: parseInt(document.getElementById('pReorder').value) || 5,
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
    const safeName = Utils.escapeHtml(product.name || 'Product');
    const safeBarcode = Utils.escapeHtml(product.barcode || '');
    const safePrice = Utils.currency(product.sellingPrice || 0);
    return `
      <div class="barcode-label">
        <div class="barcode-label-name">${safeName}</div>
        <svg id="productBarcodeSvg"></svg>
        <div class="barcode-label-code">${safeBarcode}</div>
        <div class="barcode-label-price">${safePrice}</div>
      </div>
    `;
  },

  printDocumentHtml(labelBody) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Barcode Label</title>
        <style>
          @page { size: 50mm 30mm; margin: 0; }
          html, body {
            width: 50mm;
            height: 30mm;
            margin: 0;
            padding: 0;
            background: #fff;
            color: #000;
            font-family: Arial, sans-serif;
          }
          .barcode-label {
            box-sizing: border-box;
            width: 50mm;
            height: 30mm;
            padding: 2mm 3mm;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          .barcode-label-name {
            width: 100%;
            font-size: 9px;
            font-weight: 700;
            text-align: center;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          #productBarcodeSvg {
            width: 42mm;
            height: 12mm;
            margin-top: 1mm;
          }
          .barcode-label-code {
            font-size: 8px;
            letter-spacing: 1px;
            margin-top: 1mm;
          }
          .barcode-label-price {
            font-size: 10px;
            font-weight: 700;
            margin-top: 1mm;
          }
        </style>
      </head>
      <body>${labelBody}</body>
      </html>
    `;
  },

  renderBarcodeSvg(root, barcode) {
    const svg = root.querySelector('#productBarcodeSvg');
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
        <button class="btn btn-primary" id="printBarcodeBtn">${Utils.icons.print} Print</button>
      `
    });

    this.renderBarcodeSvg(document, product.barcode);
    document.getElementById('printBarcodeBtn').addEventListener('click', () => this.printBarcodeLabel(product));
    if (autoPrint) setTimeout(() => this.printBarcodeLabel(product), 300);
  },

  async printBarcodeLabel(product) {
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
    const html = this.printDocumentHtml(printRoot.innerHTML);

    try {
      if (window.SupiriKarawala?.printLabel) {
        const labelPrinter = await DB.getSetting('labelPrinter');
        const result = await Promise.race([
          window.SupiriKarawala.printLabel(html, { deviceName: labelPrinter || undefined }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Print timed out')), 10000))
        ]);
        Toast.success('Printed', result?.printer ? `Barcode sent to ${result.printer}` : 'Barcode sent to printer');
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
          iframe.remove();
          reject(err);
        }
      };

      document.body.appendChild(iframe);
      const doc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!doc) {
        iframe.remove();
        reject(new Error('Could not create print frame'));
        return;
      }
      doc.open();
      doc.write(html);
      doc.close();
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
