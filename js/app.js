/* ===== MAIN APP INITIALIZATION ===== */
const App = {
  currentUser: null,
  currentPage: 'dashboard',
  fullAccessRoles: new Set(['owner', 'admin']),
  workerAllowedPages: new Set(['billing', 'inventory']),
  roleLabels: {
    owner: 'Owner',
    admin: 'Owner',
    worker: 'Worker',
    cashier: 'Worker'
  },

  async init() {
    // Initialize database
    await DB.init();
    await DB.seedIfEmpty();
    await DB.ensureDefaultUserAccounts();
    await DB.applyBusinessProfile();
    await DB.removeDemoInventoryItems();
    await DB.clearInitialInventoryItems();
    await DB.resetToKarawalaProducts();
    await DB.finalizeCloudSync();

    // Check dark mode
    if (localStorage.getItem('darkMode') === 'true') {
      document.documentElement.setAttribute('data-theme', 'dark');
    }

    // Check saved session
    const savedUserId = localStorage.getItem('currentUserId');
    if (savedUserId) {
      try {
        const dbUser = await DB.getUser(parseInt(savedUserId, 10));
        if (dbUser) {
          this.currentUser = {
            id: dbUser.id,
            username: dbUser.username,
            role: dbUser.role,
            name: dbUser.name
          };
          this.showApp();
          return;
        }
      } catch(e) {}
    }

    // Show login
    this.showLogin();
  },

  showLogin() {
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');

    // The button starts disabled (see index.html) so a click can't slip through
    // as a raw form submit while DB init above is still running.
    const submitBtn = document.getElementById('loginSubmitBtn');
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Sign In';
    }

    const form = document.getElementById('loginForm');
    form.onsubmit = async (e) => {
      e.preventDefault();
      const username = document.getElementById('loginUsername').value.trim();
      const password = document.getElementById('loginPassword').value;
      const errorEl = document.getElementById('loginError');

      if (!username || !password) {
        errorEl.textContent = 'Please fill in all fields';
        return;
      }

      const user = await DB.getUserByUsername(username);
      let valid = false;
      if (user?.passwordHash && user?.passwordSalt) {
        valid = await Utils.verifyPassword(password, user.passwordSalt, user.passwordHash);
      } else if (user && typeof user.password === 'string') {
        valid = user.password === password;
        // Transparent migration for legacy plaintext users.
        if (valid) {
          const creds = await Utils.createPasswordHash(password);
          await DB.updateUser(user.id, {
            passwordHash: creds.passwordHash,
            passwordSalt: creds.passwordSalt,
            password: null
          });
        }
      }

      if (!user || !valid) {
        errorEl.textContent = 'Invalid username or password';
        document.getElementById('loginPassword').value = '';
        return;
      }

      this.currentUser = {
        id: user.id,
        username: user.username,
        role: user.role,
        name: user.name
      };
      localStorage.setItem('currentUserId', String(user.id));
      this.showApp();
    };
  },

  showApp() {
    document.getElementById('loginScreen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');

    Sidebar.render();
    Header.render();
    this.navigate(this.getDefaultPage());
  },

  logout() {
    this.currentUser = null;
    localStorage.removeItem('currentUserId');
    document.getElementById('loginScreen').classList.remove('hidden');
    document.getElementById('app').classList.add('hidden');
    document.getElementById('loginUsername').value = '';
    document.getElementById('loginPassword').value = '';
    document.getElementById('loginError').textContent = '';
  },

  navigate(page) {
    if (!this.canAccessPage(page)) {
      Toast.warning('Access Denied', 'Owner access required');
      page = this.getDefaultPage();
    }

    this.currentPage = page;
    Sidebar.setActive(page);

    const pageMap = {
      dashboard: DashboardPage,
      billing: BillingPage,
      bills: BillsPage,
      products: ProductsPage,
      categories: CategoriesPage,
      inventory: InventoryPage,
      customers: CustomersPage,
      suppliers: SuppliersPage,
      purchases: PurchasesPage,
      reports: ReportsPage,
      cheques: ChequesPage,
      returns: ReturnsPage,
      expenses: ExpensesPage,
      profit: ProfitPage,
      settings: SettingsPage,
    };

    const pageHandler = pageMap[page];
    if (pageHandler) {
      // Destroy existing charts
      try {
        Chart.helpers?.each(Chart.instances, (instance) => instance.destroy());
      } catch(e) {}

      // Show loading spinner
      const content = document.getElementById('pageContent');
      content.innerHTML = '<div class="spinner"></div>';

      // Await render and catch errors
      pageHandler.render().catch(err => {
        console.error(`Page render error [${page}]:`, err);
        content.innerHTML = `
          <div class="empty-state">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <h4>Failed to load page</h4>
            <p>${err?.message || 'An unexpected error occurred.'}</p>
            <button class="btn btn-primary" style="margin-top:16px" onclick="App.navigate('${page}')">Retry</button>
          </div>`;
      });
    }
  },

  hasFullAccess() {
    return this.fullAccessRoles.has(this.currentUser?.role);
  },

  canStockIn() {
    return this.hasFullAccess() || this.currentUser?.role === 'worker' || this.currentUser?.role === 'cashier';
  },

  canAccessPage(page) {
    if (this.hasFullAccess()) return true;
    return this.workerAllowedPages.has(page);
  },

  getDefaultPage() {
    return this.hasFullAccess() ? 'dashboard' : 'billing';
  },

  roleLabel(role = this.currentUser?.role) {
    return this.roleLabels[role] || role || 'Worker';
  }
};

// Bootstrap on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  App.init().catch(err => {
    console.error('App init failed:', err);
    const errText = err?.message || err?.inner?.message || err?.name || String(err);
    document.body.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;font-family:sans-serif">
        <div>
          <h2 style="color:#E31A1A;margin-bottom:16px">Failed to start</h2>
          <p style="color:#666">${Utils.escapeHtml(errText)}</p>
          <p style="color:#999;margin-top:8px">Make sure you are using a modern browser with IndexedDB support.</p>
        </div>
      </div>
    `;
  });
});
