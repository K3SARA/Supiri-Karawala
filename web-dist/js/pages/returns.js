/* ===== RETURNS PAGE ===== */
const ReturnsPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';
    const returns = await DB.getReturns();
    content.innerHTML = `
      <div class="page-header">
        <h2>Returns (${returns.length})</h2>
        <button class="btn btn-primary" id="newReturnBtn">${Utils.icons.returns} Process Return</button>
      </div>
      <div id="returnsTableContainer"></div>
    `;
    DataTable.render('returnsTableContainer', {
      id: 'returns',
      columns: [
        { key: 'id', label: 'Return ID', render: r => `<strong>#RET-${r.id}</strong>` },
        { key: 'invoiceNo', label: 'Original Invoice', render: r => r.invoiceNo || 'N/A' },
        { key: 'date', label: 'Date', render: r => Utils.formatDate(r.date) },
        { key: 'reason', label: 'Reason', render: r => r.reason || '-' },
        { key: 'totalRefund', label: 'Refund Amount', render: r => Utils.currency(r.totalRefund || 0) },
      ],
      data: returns
    });
    document.getElementById('newReturnBtn').addEventListener('click', () => this.showReturnForm());
  },

  async showReturnForm() {
    const allReturns = await DB.getReturns();

    Modal.show({
      title: 'Process Return',
      size: 'lg',
      content: `
        <div class="form-group" style="margin-bottom:16px">
          <label class="form-label">Invoice Number</label>
          <div class="input-group">
            <input class="form-input" id="returnInvoice" placeholder="Enter invoice number...">
            <button class="btn btn-primary" id="lookupInvoiceBtn">${Utils.icons.search} Lookup</button>
          </div>
        </div>
        <div id="returnInvoiceDetails"></div>
      `,
      footer: `<div id="returnModalFooter"></div>`
    });

    document.getElementById('lookupInvoiceBtn').addEventListener('click', async () => {
      const invoiceNo = document.getElementById('returnInvoice').value.trim();
      if (!invoiceNo) { Toast.error('Required', 'Enter an invoice number'); return; }

      const sales = await DB.getSales();
      const sale = sales.find(s => s.invoiceNo === invoiceNo);
      if (!sale) { Toast.error('Not Found', 'No sale found with that invoice'); return; }

      const saleItems = await DB.getSaleItems(sale.id);
      const existingReturns = allReturns.filter(r => r.saleId === sale.id);
      const returnedQtyByItem = {};

      for (const r of existingReturns) {
        const retItems = await DB.getReturnItems(r.id);
        for (const ri of retItems) {
          const key = ri.variationId ? `v:${ri.variationId}` : `p:${ri.productId}`;
          returnedQtyByItem[key] = (returnedQtyByItem[key] || 0) + (ri.quantity || 0);
        }
      }

      const itemRows = saleItems.map((item, i) => {
        const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
        const returnedQty = returnedQtyByItem[key] || 0;
        const maxQty = Math.max(0, (item.quantity || 0) - returnedQty);
        const disabled = maxQty <= 0;

        return `
          <div style="display:flex;align-items:center;gap:12px;padding:8px;border:1px solid var(--border);border-radius:var(--radius-md);margin-bottom:8px">
            <input type="checkbox" id="retItem${i}" class="return-check" data-idx="${i}" ${disabled ? 'disabled' : ''} style="width:18px;height:18px">
            <div style="flex:1"><strong>${item.name}</strong><br><small>Sold: ${item.quantity} x ${Utils.currency(item.price)} | Returned: ${returnedQty} | Available: ${maxQty}</small></div>
            <div><label style="font-size:12px">Return Qty:</label><input type="number" class="form-input ret-qty" data-idx="${i}" value="${maxQty > 0 ? maxQty : 0}" min="0.001" step="any" max="${maxQty}" ${disabled ? 'disabled' : ''} style="width:70px;padding:4px 8px"></div>
          </div>
        `;
      }).join('');

      const detailsDiv = document.getElementById('returnInvoiceDetails');
      detailsDiv.innerHTML = `
        <div style="margin-bottom:16px"><p>Date: <strong>${Utils.formatDateTime(sale.createdAt)}</strong> | Total: <strong>${Utils.currency(sale.total)}</strong></p></div>
        <h4 style="margin-bottom:8px">Select items to return:</h4>
        ${itemRows}
        <div class="form-row" style="margin-top:16px">
          <div class="form-group"><label class="form-label">Reason</label>
            <select class="form-select" id="returnReason"><option>Damaged</option><option>Wrong Item</option><option>Customer Changed Mind</option><option>Other</option></select></div>
          <div class="form-group"><label class="form-label">Restock Items?</label>
            <select class="form-select" id="returnRestock"><option value="true">Yes - Add back to stock</option><option value="false">No - Do not restock</option></select></div>
        </div>
      `;

      const footer = document.getElementById('returnModalFooter');
      if (footer) {
        footer.innerHTML = `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
          <button class="btn btn-danger" id="processReturnBtn">${Utils.icons.returns} Process Return</button>`;
      }

      const processBtn = document.getElementById('processReturnBtn');
      if (!processBtn) return;

      processBtn.addEventListener('click', async () => {
        const checks = document.querySelectorAll('.return-check:checked');
        if (checks.length === 0) { Toast.error('Required', 'Select at least one item'); return; }

        const returnItems = [];
        let totalRefund = 0;
        const saleSubtotal = sale.subtotal || saleItems.reduce((sum, item) => sum + (item.quantity || 0) * (item.price || 0), 0);
        const saleDiscount = sale.discount || 0;
        const saleTax = sale.tax || 0;

        checks.forEach(chk => {
          const idx = parseInt(chk.dataset.idx, 10);
          const qty = parseFloat(document.querySelector(`.ret-qty[data-idx="${idx}"]`).value) || 0;
          const item = saleItems[idx];
          const key = item.variationId ? `v:${item.variationId}` : `p:${item.productId}`;
          const returnedQty = returnedQtyByItem[key] || 0;
          const maxQty = Math.max(0, (item.quantity || 0) - returnedQty);

          if (qty <= 0 || qty > maxQty) return;

          const subtotalRefund = qty * (item.price || 0);
          const refundShare = saleSubtotal > 0 ? subtotalRefund / saleSubtotal : 0;
          const discountRefund = saleDiscount * refundShare;
          const taxRefund = saleTax * refundShare;
          const itemRefund = Math.max(0, subtotalRefund - discountRefund + taxRefund);
          const costRefund = qty * (item.costPrice || 0);

          totalRefund += itemRefund;
          returnItems.push({
            productId: item.productId,
            variationId: item.variationId || null,
            name: item.name,
            quantity: qty,
            price: item.price,
            costPrice: item.costPrice || 0,
            subtotalRefund,
            discountRefund,
            taxRefund,
            totalRefund: itemRefund,
            costRefund,
            restock: document.getElementById('returnRestock').value === 'true'
          });
        });

        if (returnItems.length === 0) { Toast.error('Invalid', 'Selected return quantities are not valid'); return; }

        await DB.addReturn({
          saleId: sale.id,
          invoiceNo,
          reason: document.getElementById('returnReason').value,
          totalRefund,
          items: returnItems
        });

        Toast.success('Return Processed', `Refund: ${Utils.currency(totalRefund)}`);
        Modal.close();
        this.render();
        Sidebar.updateLowStockBadge();
      });
    });
  }
};
