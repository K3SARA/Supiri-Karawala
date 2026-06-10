/* ===== SIDEBAR COMPONENT ===== */
const Sidebar = {
  currentPage: 'dashboard',

  render() {
    const sidebar = document.getElementById('sidebar');
    const user = App.currentUser || {};

    const menuItems = [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
      { id: 'billing', label: 'Billing', icon: 'billing' },
      { id: 'bills', label: 'Bills', icon: 'billing' },
      { id: 'products', label: 'Products', icon: 'products' },
      { id: 'categories', label: 'Categories', icon: 'categories' },
      { id: 'inventory', label: 'Inventory', icon: 'inventory' },
      { id: 'customers', label: 'Customers', icon: 'customers' },
      { id: 'suppliers', label: 'Suppliers', icon: 'suppliers', adminOnly: true },
      { id: 'purchases', label: 'Purchases', icon: 'purchases', adminOnly: true },
      { id: 'returns', label: 'Returns', icon: 'returns' },
      { id: 'expenses', label: 'Expenses', icon: 'expenses', adminOnly: true },
      { id: 'reports', label: 'Reports', icon: 'reports', adminOnly: true },
      { id: 'profit', label: 'Profit', icon: 'profit', adminOnly: true },
      { id: 'settings', label: 'Settings', icon: 'settings', adminOnly: true },
    ];

    sidebar.innerHTML = `
      <div class="sidebar-brand">
        <div class="sidebar-brand-icon">
          <img src="assets/logo.png" alt="Supiri Karawala logo" class="sidebar-brand-logo" onerror="this.style.display='none';this.nextElementSibling.classList.remove('hidden')">
          <span class="sidebar-logo-fallback hidden">SK</span>
        </div>
        <div class="sidebar-brand-text">
          <h2>Supiri Karawala</h2>
          <span>Premium Dried Fish</span>
        </div>
      </div>

      <div class="sidebar-menu-label">MENU</div>
      <nav class="sidebar-menu">
        ${menuItems
          .map(item => `
            <div class="sidebar-menu-item ${this.currentPage === item.id ? 'active' : ''} ${App.canAccessPage(item.id) ? '' : 'locked'}"
                 data-page="${item.id}" id="nav-${item.id}" title="${App.canAccessPage(item.id) ? item.label : 'Owner access required'}">
              ${Utils.icons[item.icon]}
              <span>${item.label}</span>
              ${item.id === 'inventory' ? '<span class="badge low-stock-badge hidden" id="lowStockBadge">0</span>' : ''}
              ${App.canAccessPage(item.id) ? '' : `<span class="sidebar-lock">${Utils.icons.lock}</span>`}
            </div>
          `).join('')}
      </nav>

      <div class="sidebar-footer">
        <div class="sidebar-footer-item" id="darkModeToggle">
          <div class="dark-mode-toggle">
            <span>${Utils.icons.moon} Dark Mode</span>
            <div class="toggle-switch ${document.documentElement.getAttribute('data-theme') === 'dark' ? 'active' : ''}" id="darkModeSwitch"></div>
          </div>
        </div>
        <div class="sidebar-footer-item" id="logoutBtn">
          ${Utils.icons.logout}
          <span>Logout</span>
        </div>
      </div>
    `;

    // Navigation events
    sidebar.querySelectorAll('.sidebar-menu-item').forEach(el => {
      el.addEventListener('click', () => {
        const page = el.dataset.page;
        if (!App.canAccessPage(page)) {
          Toast.warning('Locked', 'Owner access required');
          return;
        }
        App.navigate(page);
        this.closeMobile(); // auto-close sidebar on mobile after nav
      });
    });

    // Dark mode toggle
    document.getElementById('darkModeToggle').addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      document.documentElement.setAttribute('data-theme', isDark ? '' : 'dark');
      document.getElementById('darkModeSwitch').classList.toggle('active', !isDark);
      localStorage.setItem('darkMode', !isDark ? 'true' : 'false');
    });

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', () => {
      Modal.confirm('Logout', 'Are you sure you want to logout?', () => {
        App.logout();
      });
    });

    // Update low stock badge
    this.updateLowStockBadge();
  },

  setActive(page) {
    this.currentPage = page;
    document.querySelectorAll('.sidebar-menu-item').forEach(el => {
      el.classList.toggle('active', el.dataset.page === page);
    });
  },

  toggleMobile() {
    const sidebar = document.getElementById('sidebar');
    const isOpen = sidebar.classList.contains('mobile-open');
    if (isOpen) {
      this.closeMobile();
    } else {
      sidebar.classList.add('mobile-open');
      // Create overlay
      let overlay = document.getElementById('sidebarOverlay');
      if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'sidebarOverlay';
        overlay.className = 'sidebar-overlay';
        overlay.addEventListener('click', () => this.closeMobile());
        document.body.appendChild(overlay);
      }
      overlay.classList.add('visible');
    }
  },

  closeMobile() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.remove('mobile-open');
    const overlay = document.getElementById('sidebarOverlay');
    if (overlay) overlay.classList.remove('visible');
  },

  async updateLowStockBadge() {
    try {
      const lowStock = await DB.getLowStockProducts();
      const badge = document.getElementById('lowStockBadge');
      if (badge) {
        if (lowStock.length > 0) {
          badge.textContent = lowStock.length;
          badge.classList.remove('hidden');
        } else {
          badge.classList.add('hidden');
        }
      }
    } catch (e) {}
  }
};
