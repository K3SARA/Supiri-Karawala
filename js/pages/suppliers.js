/* ===== SUPPLIERS PAGE ===== */
const SuppliersPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';
    const suppliers = await DB.getSuppliers();
    content.innerHTML = `
      <div class="page-header">
        <h2>Suppliers (${suppliers.length})</h2>
        <button class="btn btn-primary" id="addSupplierBtn">${Utils.icons.plus} Add Supplier</button>
      </div>
      <div id="suppliersTableContainer"></div>
    `;
    DataTable.render('suppliersTableContainer', {
      id: 'suppliers',
      columns: [
        { key: 'name', label: 'Supplier Name', render: r => `<strong>${Utils.escapeHtml(r.name)}</strong>` },
        { key: 'phone', label: 'Phone', render: r => Utils.escapeHtml(r.phone || '-') },
        { key: 'email', label: 'Email', render: r => Utils.escapeHtml(r.email || '-') },
        { key: 'address', label: 'Address', render: r => Utils.escapeHtml(r.address || '-') },
        { key: 'createdAt', label: 'Added', render: r => Utils.formatDate(r.createdAt) },
      ],
      data: suppliers,
      actions: (row) => `
        <button class="btn btn-sm btn-ghost" onclick="SuppliersPage.editSupplier(${row.id})">${Utils.icons.edit}</button>
        <button class="btn btn-sm btn-ghost" onclick="SuppliersPage.deleteSupplier(${row.id})" style="color:var(--danger)">${Utils.icons.trash}</button>
      `
    });
    document.getElementById('addSupplierBtn').addEventListener('click', () => this.showForm());
  },

  showForm(supplier = null) {
    const isEdit = !!supplier;
    Modal.show({
      title: isEdit ? 'Edit Supplier' : 'Add Supplier',
      content: `
        <div class="form-group" style="margin-bottom:16px"><label class="form-label">Name <span class="required">*</span></label>
          <input class="form-input" id="supName" value="${supplier?.name || ''}"></div>
        <div class="form-row" style="margin-bottom:16px">
          <div class="form-group"><label class="form-label">Phone</label><input class="form-input" id="supPhone" value="${supplier?.phone || ''}"></div>
          <div class="form-group"><label class="form-label">Email</label><input class="form-input" id="supEmail" value="${supplier?.email || ''}"></div>
        </div>
        <div class="form-group"><label class="form-label">Address</label><textarea class="form-textarea" id="supAddress">${supplier?.address || ''}</textarea></div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveSupBtn">${isEdit ? 'Update' : 'Add'}</button>`
    });

    document.getElementById('saveSupBtn').addEventListener('click', async () => {
      const data = {
        name: document.getElementById('supName').value.trim(),
        phone: document.getElementById('supPhone').value.trim(),
        email: document.getElementById('supEmail').value.trim(),
        address: document.getElementById('supAddress').value.trim()
      };
      if (!data.name) { Toast.error('Required', 'Supplier name is required'); return; }
      if (isEdit) { await DB.updateSupplier(supplier.id, data); Toast.success('Updated', 'Supplier updated'); }
      else { await DB.addSupplier(data); Toast.success('Added', 'Supplier added'); }
      Modal.close(); this.render();
    });
  },

  async editSupplier(id) { const s = await DB.getSupplier(id); if (s) this.showForm(s); },
  async deleteSupplier(id) { Modal.confirm('Delete Supplier', 'Are you sure?', async () => { await DB.deleteSupplier(id); Toast.success('Deleted', 'Supplier deleted'); this.render(); }); }
};
