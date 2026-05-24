/* ===== SETTINGS PAGE ===== */
const SettingsPage = {
  currentSection: 'shop',

  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content'; content.style.padding = ''; content.style.overflow = '';
    const settings = await DB.getAllSettings();
    const users = await DB.getUsers();

    content.innerHTML = `
      <div class="page-header"><h2>Settings</h2></div>
      <div class="settings-grid">
        <div class="content-card" style="height:fit-content">
          <div class="content-card-body">
            <div class="settings-nav">
              <div class="settings-nav-item active" data-section="shop">${Utils.icons.settings} Shop Info</div>
              <div class="settings-nav-item" data-section="receipt">${Utils.icons.print} Receipt</div>
              <div class="settings-nav-item" data-section="printers">${Utils.icons.print} Printers</div>
              <div class="settings-nav-item" data-section="tax">${Utils.icons.expenses} Tax Settings</div>
              <div class="settings-nav-item" data-section="users">${Utils.icons.customers} Users</div>
              <div class="settings-nav-item" data-section="backup">${Utils.icons.download} Backup</div>
            </div>
          </div>
        </div>
        <div class="content-card"><div class="content-card-body" id="settingsContent"></div></div>
      </div>
    `;

    document.querySelectorAll('.settings-nav-item').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.settings-nav-item').forEach(n => n.classList.remove('active'));
        el.classList.add('active');
        this.currentSection = el.dataset.section;
        this.renderSection(settings, users);
      });
    });

    this.renderSection(settings, users);
  },

  async renderSection(settings, users) {
    const sc = document.getElementById('settingsContent');
    switch (this.currentSection) {
      case 'shop':
        sc.innerHTML = `
          <div class="settings-section">
            <h4>Shop Information</h4>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Shop Name</label>
              <input class="form-input" id="setShopName" value="${settings.shopName || ''}"></div>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Address</label>
              <textarea class="form-textarea" id="setShopAddress">${settings.shopAddress || ''}</textarea></div>
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Phone</label>
                <input class="form-input" id="setShopPhone" value="${settings.shopPhone || ''}"></div>
              <div class="form-group"><label class="form-label">Email</label>
                <input class="form-input" id="setShopEmail" value="${settings.shopEmail || ''}"></div>
            </div>
            <button class="btn btn-primary" id="saveShopBtn">${Utils.icons.check} Save</button>
          </div>
        `;
        document.getElementById('saveShopBtn').addEventListener('click', async () => {
          await DB.setSetting('shopName', document.getElementById('setShopName').value);
          await DB.setSetting('shopAddress', document.getElementById('setShopAddress').value);
          await DB.setSetting('shopPhone', document.getElementById('setShopPhone').value);
          await DB.setSetting('shopEmail', document.getElementById('setShopEmail').value);
          Toast.success('Saved', 'Shop info updated');
        });
        break;

      case 'receipt':
        sc.innerHTML = `
          <div class="settings-section">
            <h4>Receipt Settings</h4>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Receipt Width</label>
              <select class="form-select" id="setReceiptWidth">
                <option value="58" ${settings.receiptWidth === '58' ? 'selected' : ''}>58mm</option>
                <option value="80" ${settings.receiptWidth !== '58' ? 'selected' : ''}>80mm</option>
              </select></div>
            <div class="form-group" style="margin-bottom:16px"><label class="form-label">Footer Message</label>
              <input class="form-input" id="setReceiptFooter" value="${settings.receiptFooter || ''}"></div>
            <button class="btn btn-primary" id="saveReceiptBtn">${Utils.icons.check} Save</button>
          </div>
        `;
        document.getElementById('saveReceiptBtn').addEventListener('click', async () => {
          await DB.setSetting('receiptWidth', document.getElementById('setReceiptWidth').value);
          await DB.setSetting('receiptFooter', document.getElementById('setReceiptFooter').value);
          Toast.success('Saved', 'Receipt settings updated');
        });
        break;

      case 'printers': {
        let printers = [];
        if (window.PrintCarePlus?.getPrinters) {
          try {
            printers = await window.PrintCarePlus.getPrinters();
          } catch (e) {
            printers = [];
          }
        }

        const printerOptions = printers.length
          ? printers.map(p => {
              const name = Utils.escapeHtml(p.name || '');
              return `<option value="${name}">${name}${p.isDefault ? ' (Default)' : ''}</option>`;
            }).join('')
          : '';

        sc.innerHTML = `
          <div class="settings-section">
            <h4>Printer Settings</h4>
            ${!window.PrintCarePlus?.getPrinters ? `
              <div class="alert-banner warning">
                ${Utils.icons.warning}
                <span>Printer selection is available in the desktop app only. Browser mode will use the normal print dialog.</span>
              </div>
            ` : ''}
            ${window.PrintCarePlus?.getPrinters && printers.length === 0 ? `
              <div class="alert-banner warning">
                ${Utils.icons.warning}
                <span>No printers were reported by Windows. Check that your printers are installed and online.</span>
              </div>
            ` : ''}
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Label / Sticker Printer</label>
              <select class="form-select" id="setLabelPrinter" ${printers.length ? '' : 'disabled'}>
                <option value="">Auto detect or use Windows default</option>
                ${printerOptions}
              </select>
              <p style="margin-top:8px;color:var(--text-secondary);font-size:var(--font-size-sm)">Barcode labels will print to this printer first.</p>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Receipt Printer</label>
              <select class="form-select" id="setReceiptPrinter" ${printers.length ? '' : 'disabled'}>
                <option value="">Use Windows default</option>
                ${printerOptions}
              </select>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">A4 / Report Printer</label>
              <select class="form-select" id="setA4Printer" ${printers.length ? '' : 'disabled'}>
                <option value="">Use Windows default</option>
                ${printerOptions}
              </select>
            </div>
            <div style="display:flex;gap:12px">
              <button class="btn btn-primary" id="savePrintersBtn">${Utils.icons.check} Save</button>
              <button class="btn btn-outline" id="refreshPrintersBtn">${Utils.icons.refresh} Refresh</button>
              <button class="btn btn-warning" id="testLabelPrinterBtn" ${printers.length ? '' : 'disabled'}>${Utils.icons.print} Test Label</button>
            </div>
          </div>
        `;

        document.getElementById('setLabelPrinter').value = settings.labelPrinter || '';
        document.getElementById('setReceiptPrinter').value = settings.receiptPrinter || '';
        document.getElementById('setA4Printer').value = settings.a4Printer || '';

        document.getElementById('savePrintersBtn').addEventListener('click', async () => {
          await DB.setSetting('labelPrinter', document.getElementById('setLabelPrinter').value);
          await DB.setSetting('receiptPrinter', document.getElementById('setReceiptPrinter').value);
          await DB.setSetting('a4Printer', document.getElementById('setA4Printer').value);
          Toast.success('Saved', 'Printer settings updated');
        });
        document.getElementById('refreshPrintersBtn').addEventListener('click', () => this.render());
        document.getElementById('testLabelPrinterBtn')?.addEventListener('click', async () => {
          await DB.setSetting('labelPrinter', document.getElementById('setLabelPrinter').value);
          if (window.ProductsPage?.printBarcodeLabel) {
            await ProductsPage.printBarcodeLabel({
              name: 'Test Label',
              barcode: '123456789012',
              sellingPrice: 0
            });
          }
        });
        break;
      }

      case 'tax':
        sc.innerHTML = `
          <div class="settings-section">
            <h4>Tax Configuration</h4>
            <div class="form-group" style="margin-bottom:16px">
              <label class="checkbox-label"><input type="checkbox" id="setTaxEnabled" ${settings.taxEnabled === 'true' ? 'checked' : ''}> Enable Tax</label>
            </div>
            <div class="form-row" style="margin-bottom:16px">
              <div class="form-group"><label class="form-label">Tax Name</label>
                <input class="form-input" id="setTaxName" value="${settings.taxName || 'Tax'}"></div>
              <div class="form-group"><label class="form-label">Tax Rate (%)</label>
                <input type="number" class="form-input" id="setTaxRate" value="${settings.taxRate || 0}" min="0" max="100" step="0.1"></div>
            </div>
            <button class="btn btn-primary" id="saveTaxBtn">${Utils.icons.check} Save</button>
          </div>
        `;
        document.getElementById('saveTaxBtn').addEventListener('click', async () => {
          await DB.setSetting('taxEnabled', document.getElementById('setTaxEnabled').checked ? 'true' : 'false');
          await DB.setSetting('taxName', document.getElementById('setTaxName').value);
          await DB.setSetting('taxRate', document.getElementById('setTaxRate').value);
          Toast.success('Saved', 'Tax settings updated');
        });
        break;

      case 'users':
        sc.innerHTML = `
          <div class="settings-section">
            <h4>User Management</h4>
            <button class="btn btn-primary btn-sm" id="addUserBtn" style="margin-bottom:16px">${Utils.icons.plus} Add User</button>
            <table class="data-table"><thead><tr><th>Username</th><th>Name</th><th>Role</th><th>Actions</th></tr></thead>
            <tbody>${users.map(u => `<tr><td><strong>${Utils.escapeHtml(u.username || '')}</strong></td><td>${Utils.escapeHtml(u.name || '')}</td>
              <td><span class="badge ${App.fullAccessRoles.has(u.role) ? 'badge-primary' : 'badge-neutral'}">${App.roleLabel(u.role)}</span></td>
              <td><div class="table-actions">
                <button class="btn btn-sm btn-ghost" onclick="SettingsPage.editUser(${u.id})">${Utils.icons.edit}</button>
                ${u.id !== App.currentUser?.id && u.username !== 'owner' ? `<button class="btn btn-sm btn-ghost" onclick="SettingsPage.deleteUser(${u.id})" style="color:var(--danger)">${Utils.icons.trash}</button>` : ''}
              </div></td></tr>`).join('')}</tbody></table>
          </div>
        `;
        document.getElementById('addUserBtn').addEventListener('click', () => this.showUserForm());
        break;

      case 'backup':
        sc.innerHTML = `
          <div class="settings-section">
            <h4>Data Backup & Restore</h4>
            <p style="margin-bottom:16px;color:var(--text-secondary)">Export all your data as a JSON backup file. You can restore it later if needed.</p>
            <div style="display:flex;gap:12px;margin-bottom:24px">
              <button class="btn btn-success" id="exportDataBtn">${Utils.icons.download} Export Backup</button>
              <button class="btn btn-warning" id="importDataBtn">${Utils.icons.upload} Import Backup</button>
            </div>
            <input type="file" id="importFileInput" accept=".json" style="display:none">
            <div class="alert-banner danger" style="margin-top:16px">
              ${Utils.icons.warning}
              <span>Importing data will <strong>replace all existing data</strong>. Make sure to export a backup first!</span>
            </div>
          </div>
        `;
        document.getElementById('exportDataBtn').addEventListener('click', async () => {
          const data = await DB.exportData();
          const json = JSON.stringify(data, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
          a.download = `print-care-plus-backup-${Utils.today()}.json`; a.click();
          Toast.success('Exported', 'Backup file downloaded');
        });
        document.getElementById('importDataBtn').addEventListener('click', () => {
          document.getElementById('importFileInput').click();
        });
        document.getElementById('importFileInput').addEventListener('change', (e) => {
          const file = e.target.files[0];
          if (!file) return;
          Modal.confirm('Import Data', 'This will replace ALL existing data. Are you sure?', () => {
            const reader = new FileReader();
            reader.onload = async (ev) => {
              try {
                const data = JSON.parse(ev.target.result);
                await DB.importData(data);
                Toast.success('Imported', 'Data restored successfully. Reloading...');
                setTimeout(() => location.reload(), 1500);
              } catch (err) { Toast.error('Error', 'Invalid backup file'); }
            };
            reader.readAsText(file);
          });
        });
        break;
    }
  },

  showUserForm(user = null) {
    const isEdit = !!user;
    Modal.show({
      title: isEdit ? 'Edit User' : 'Add User',
      content: `
        <div class="form-group" style="margin-bottom:16px"><label class="form-label">Username</label>
          <input class="form-input" id="userName" value="${Utils.escapeHtml(user?.username || '')}" ${isEdit ? 'readonly' : ''}></div>
        <div class="form-group" style="margin-bottom:16px"><label class="form-label">Full Name</label>
          <input class="form-input" id="userFullName" value="${Utils.escapeHtml(user?.name || '')}"></div>
        <div class="form-group" style="margin-bottom:16px"><label class="form-label">Password ${isEdit ? '(leave blank to keep)' : ''}</label>
          <input type="password" class="form-input" id="userPassword" value="" placeholder="${isEdit ? '••••••' : 'Enter password'}"></div>
        <div class="form-group"><label class="form-label">Role</label>
          <select class="form-select" id="userRole">
            <option value="worker" ${user?.role === 'worker' || user?.role === 'cashier' ? 'selected' : ''}>Worker</option>
            <option value="owner" ${user?.role === 'owner' || user?.role === 'admin' ? 'selected' : ''}>Owner</option>
          </select></div>
      `,
      footer: `<button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveUserBtn">${isEdit ? 'Update' : 'Add'}</button>`
    });
    document.getElementById('saveUserBtn').addEventListener('click', async () => {
      const data = {
        username: document.getElementById('userName').value.trim(),
        name: document.getElementById('userFullName').value.trim(),
        role: document.getElementById('userRole').value,
      };
      const pw = document.getElementById('userPassword').value;
      if (!data.username || !data.name) { Toast.error('Required', 'Fill in all fields'); return; }
      if (isEdit) {
        if (pw) data.password = pw;
        await DB.updateUser(user.id, data);
        Toast.success('Updated', 'User updated');
      } else {
        const existing = await DB.getUserByUsername(data.username);
        if (existing) { Toast.error('Duplicate', 'Username already exists'); return; }
        if (!pw) { Toast.error('Required', 'Password is required'); return; }
        data.password = pw;
        await DB.addUser(data);
        Toast.success('Added', 'User added');
      }
      Modal.close(); this.render();
    });
  },

  async editUser(id) { const u = await DB.getUser(id); if (u) this.showUserForm(u); },
  async deleteUser(id) {
    Modal.confirm('Delete User', 'Are you sure?', async () => {
      await DB.deleteUser(id); Toast.success('Deleted', 'User deleted'); this.render();
    });
  }
};
