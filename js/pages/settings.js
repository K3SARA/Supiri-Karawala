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
              <div class="settings-nav-item" data-section="cloud">${Utils.icons.refresh} Cloud Sync</div>
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
        if (window.SupiriKarawala?.getPrinters) {
          try {
            printers = await window.SupiriKarawala.getPrinters();
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
            ${!window.SupiriKarawala?.getPrinters ? `
              <div class="alert-banner warning">
                ${Utils.icons.warning}
                <span>Printer selection is available in the desktop app only. Browser mode will use the normal print dialog.</span>
              </div>
            ` : ''}
            ${window.SupiriKarawala?.getPrinters && printers.length === 0 ? `
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
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Label Size</label>
              <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                <button class="btn btn-sm btn-outline label-size-preset" data-w="50" data-h="30">50×30mm</button>
                <button class="btn btn-sm btn-outline label-size-preset" data-w="57" data-h="32">57×32mm</button>
                <button class="btn btn-sm btn-outline label-size-preset" data-w="38" data-h="25">38×25mm</button>
                <button class="btn btn-sm btn-outline label-size-preset" data-w="100" data-h="50">100×50mm</button>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input type="number" class="form-input" id="setLabelWidth" min="20" max="200" step="1" value="${settings.labelWidth || '50'}" style="width:70px"> mm wide &times;
                <input type="number" class="form-input" id="setLabelHeight" min="15" max="200" step="1" value="${settings.labelHeight || '30'}" style="width:70px"> mm tall
              </div>
              <p style="margin-top:6px;color:var(--text-secondary);font-size:var(--font-size-sm)">Match the label roll loaded in your thermal printer. Zebra ZD230 standard stock = 57×32mm.</p>
            </div>
            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Label Columns</label>
              <div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:4px">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="labelColumns" value="1" ${settings.labelColumns !== '2' ? 'checked' : ''}> Single — one label per strip
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
                  <input type="radio" name="labelColumns" value="2" ${settings.labelColumns === '2' ? 'checked' : ''}> Double — two labels side by side
                </label>
              </div>
              <p style="margin-top:6px;color:var(--text-secondary);font-size:var(--font-size-sm)">Use "Double" when the roll has two side-by-side columns (e.g. 100mm paper split into two 50mm labels). Set the label width above to the width of one column.</p>
            </div>
            <div style="display:flex;gap:12px">
              <button class="btn btn-primary" id="savePrintersBtn">${Utils.icons.check} Save</button>
              <button class="btn btn-outline" id="refreshPrintersBtn">${Utils.icons.refresh} Refresh</button>
              <button class="btn btn-warning" id="testLabelPrinterBtn" ${printers.length ? '' : 'disabled'}>${Utils.icons.print} Test Label</button>
              <button class="btn btn-warning" id="testCashDrawerBtn" ${printers.length && window.SupiriKarawala?.openCashDrawer ? '' : 'disabled'}>${Utils.icons.cash} Test Drawer</button>
            </div>
          </div>
        `;

        document.getElementById('setLabelPrinter').value = settings.labelPrinter || '';
        document.getElementById('setReceiptPrinter').value = settings.receiptPrinter || '';
        document.getElementById('setA4Printer').value = settings.a4Printer || '';

        document.querySelectorAll('.label-size-preset').forEach(btn => {
          btn.addEventListener('click', () => {
            document.getElementById('setLabelWidth').value = btn.dataset.w;
            document.getElementById('setLabelHeight').value = btn.dataset.h;
          });
        });

        document.getElementById('savePrintersBtn').addEventListener('click', async () => {
          await DB.setSetting('labelPrinter', document.getElementById('setLabelPrinter').value);
          await DB.setSetting('receiptPrinter', document.getElementById('setReceiptPrinter').value);
          await DB.setSetting('a4Printer', document.getElementById('setA4Printer').value);
          await DB.setSetting('labelWidth', document.getElementById('setLabelWidth').value);
          await DB.setSetting('labelHeight', document.getElementById('setLabelHeight').value);
          const colsEl = document.querySelector('input[name="labelColumns"]:checked');
          await DB.setSetting('labelColumns', colsEl ? colsEl.value : '1');
          Toast.success('Saved', 'Printer settings updated');
        });
        document.getElementById('refreshPrintersBtn').addEventListener('click', () => this.render());
        document.getElementById('testLabelPrinterBtn')?.addEventListener('click', async () => {
          await DB.setSetting('labelPrinter', document.getElementById('setLabelPrinter').value);
          if (typeof ProductsPage !== 'undefined' && ProductsPage.printBarcodeLabel) {
            const today = new Date().toISOString().split('T')[0];
            const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
            await ProductsPage.printBarcodeLabel({
              name: 'Test Label',
              barcode: '123456789012',
              sellingPrice: 250,
              mfgDate: today,
              expDate: nextYear
            });
          }
        });
        document.getElementById('testCashDrawerBtn')?.addEventListener('click', async () => {
          await DB.setSetting('receiptPrinter', document.getElementById('setReceiptPrinter').value);
          try {
            const result = await window.SupiriKarawala.openCashDrawer({
              deviceName: document.getElementById('setReceiptPrinter').value || undefined
            });
            Toast.success('Cash Drawer', result?.printer ? `Open command sent to ${result.printer}` : 'Open command sent');
          } catch (err) {
            Toast.error('Cash Drawer', err.message || 'Could not open the cash drawer');
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
          a.download = `supiri-karawala-backup-${Utils.today()}.json`; a.click();
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

      case 'cloud': {
        const cloudActiveNow = DB.cloudEnabled && DB.cloudInitialized;
        const cloudEnabledSetting = settings.cloudEnabled === 'true';

        sc.innerHTML = `
          <div class="settings-section">
            <h4>Remote Cloud Sync</h4>

            <div class="alert-banner ${cloudActiveNow ? 'success' : (cloudEnabledSetting ? 'warning' : 'neutral')}" style="margin-bottom:20px">
              ${cloudActiveNow
                ? `${Utils.icons.check} <span><strong>Cloud Sync Active</strong> — This device is connected and syncing with the Railway database in real time.</span>`
                : cloudEnabledSetting
                  ? `${Utils.icons.warning} <span><strong>Cloud Sync Configured but Offline</strong> — The app could not reach the cloud server on startup. Running on local data. Check your URL or network.</span>`
                  : `${Utils.icons.refresh} <span><strong>Local Mode</strong> — All data is stored locally on this device only. Enable cloud sync to share data across multiple devices.</span>`
              }
            </div>

            <p style="margin-bottom:16px;color:var(--text-secondary);font-size:var(--font-size-sm)">
              Cloud sync uses a Railway-hosted Node.js backend with PostgreSQL to keep all your devices in sync.
              Every read and write goes through the remote API when cloud sync is active.
            </p>

            <div class="form-group" style="margin-bottom:16px">
              <label class="checkbox-label">
                <input type="checkbox" id="setCloudEnabled" ${cloudEnabledSetting ? 'checked' : ''}> Enable Cloud Sync
              </label>
            </div>

            <div class="form-group" style="margin-bottom:16px">
              <label class="form-label">Railway Server URL</label>
              <input class="form-input" id="setCloudUrl" placeholder="https://your-app.up.railway.app" value="${settings.cloudUrl || ''}">
              <p style="margin-top:6px;color:var(--text-secondary);font-size:var(--font-size-sm)">
                Your Railway public domain — no trailing slash. Example: <code>https://supiri-karawala.up.railway.app</code>
              </p>
            </div>

            <div class="form-group" style="margin-bottom:20px" id="connectionStatusContainer">
              <!-- Connection test result appears here -->
            </div>

            <div style="display:flex;gap:12px;flex-wrap:wrap">
              <button class="btn btn-primary" id="saveCloudBtn">${Utils.icons.check} Save &amp; Restart</button>
              <button class="btn btn-outline" id="testCloudConnectionBtn">${Utils.icons.refresh} Test Connection</button>
              ${cloudActiveNow ? `<button class="btn btn-success" id="syncNowBtn">${Utils.icons.refresh} Sync Now</button>` : ''}
            </div>

            <div class="alert-banner danger" style="margin-top:20px">
              ${Utils.icons.warning}
              <span>After changing settings, the app will <strong>reload automatically</strong>. Make sure to save any open transactions first.</span>
            </div>
          </div>
        `;

        const testConnection = async () => {
          const statusContainer = document.getElementById('connectionStatusContainer');
          const rawUrl = document.getElementById('setCloudUrl').value.trim();
          if (!rawUrl) {
            statusContainer.innerHTML = `<div class="alert-banner warning">${Utils.icons.warning} <span>Please enter a Server URL first.</span></div>`;
            return;
          }
          const cleanUrl = rawUrl.replace(/\/$/, '');
          statusContainer.innerHTML = `<div class="alert-banner neutral">${Utils.icons.refresh} <span>Testing connection to <code>${cleanUrl}</code>…</span></div>`;

          try {
            const res = await fetch(`${cleanUrl}/api/health`, { cache: 'no-store' });
            if (res.ok) {
              const data = await res.json();
              if (data.database) {
                statusContainer.innerHTML = `<div class="alert-banner success">${Utils.icons.check} <span><strong>Connection OK</strong> — Railway server is reachable and PostgreSQL is connected.</span></div>`;
              } else {
                statusContainer.innerHTML = `<div class="alert-banner warning">${Utils.icons.warning} <span>Server reachable but <strong>database is offline</strong>. Set <code>DATABASE_URL</code> in your Railway service variables.</span></div>`;
              }
            } else {
              statusContainer.innerHTML = `<div class="alert-banner danger">${Utils.icons.warning} <span>Server returned HTTP <strong>${res.status}</strong>. Check your Railway deployment logs.</span></div>`;
            }
          } catch (err) {
            statusContainer.innerHTML = `<div class="alert-banner danger">${Utils.icons.warning} <span>Could not reach server: <em>${Utils.escapeHtml(err.message)}</em>. Verify the URL and your network connection.</span></div>`;
          }
        };

        document.getElementById('testCloudConnectionBtn').addEventListener('click', testConnection);

        document.getElementById('saveCloudBtn').addEventListener('click', async () => {
          const enabled = document.getElementById('setCloudEnabled').checked ? 'true' : 'false';
          const rawUrl = document.getElementById('setCloudUrl').value.trim();
          const cleanUrl = rawUrl.replace(/\/$/, '');
          await DB.setSetting('cloudEnabled', enabled);
          await DB.setSetting('cloudUrl', cleanUrl);
          Toast.success('Saved', 'Cloud Sync settings updated. Reloading…');
          setTimeout(() => window.location.reload(), 1500);
        });

        document.getElementById('syncNowBtn')?.addEventListener('click', async () => {
          const btn = document.getElementById('syncNowBtn');
          btn.disabled = true;
          btn.textContent = 'Syncing…';
          try {
            await DB.syncToCloud();
            Toast.success('Synced', 'Database pushed to cloud successfully.');
          } catch (err) {
            Toast.error('Sync Failed', err.message || 'Could not sync to cloud.');
          } finally {
            btn.disabled = false;
            btn.innerHTML = `${Utils.icons.refresh} Sync Now`;
          }
        });
        break;
      }
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
