/* ===== HEADER COMPONENT ===== */
const Header = {
  render() {
    const header = document.getElementById('header');
    const user = App.currentUser || {};
    const initials = (user.name || 'U').split(' ').map(w => w[0]).join('').toUpperCase().slice(0,2);

    header.innerHTML = `
      <div class="header-left">
        <button class="hamburger-btn" id="hamburgerBtn" aria-label="Toggle menu">
          <span></span><span></span><span></span>
        </button>
        <div class="header-greeting">
          <span class="header-date">${Utils.fullDate()}</span>
          <span class="header-welcome">${Utils.greeting()}, ${user.name || 'User'}!</span>
        </div>
        <div id="syncStatusIndicator" style="display:none; align-items:center; margin-left: 16px; font-size: 12px; font-weight: 600; padding: 4px 10px; border-radius: 12px; background: var(--bg-secondary); color: var(--text-secondary);">
          <span id="syncStatusIcon" style="margin-right: 6px">☁️</span>
          <span id="syncStatusText">Synced</span>
        </div>
      </div>
      <div class="header-right">
        <div class="header-search">
          ${Utils.icons.search}
          <input type="text" placeholder="Search anything..." id="globalSearch">
        </div>
        <div class="header-notification" id="notificationBtn">
          ${Utils.icons.bell}
          <span class="notification-dot hidden" id="notificationDot"></span>
        </div>
        <div class="header-user" id="headerUser">
          <div class="header-user-avatar">${initials}</div>
          <div class="header-user-info">
            <span class="header-user-name">${user.name || 'User'}</span>
            <span class="header-user-role">${App.roleLabel(user.role)}</span>
          </div>
        </div>
      </div>
    `;

    // Global search
    const searchInput = document.getElementById('globalSearch');
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        const query = searchInput.value.trim();
        if (query) {
          if (!App.canAccessPage('products')) {
            Toast.warning('Locked', 'Owner access required');
            return;
          }
          App.navigate('products');
          setTimeout(() => {
            const prodSearch = document.getElementById('productSearchInput');
            if (prodSearch) { prodSearch.value = query; prodSearch.dispatchEvent(new Event('input')); }
          }, 100);
        }
      }
    });

    // Hamburger toggle
    document.getElementById('hamburgerBtn').addEventListener('click', () => {
      Sidebar.toggle();
    });

    // Notification click
    document.getElementById('notificationBtn').addEventListener('click', async () => {
      const lowStock = await DB.getLowStockProducts();
      if (lowStock.length === 0) {
        Toast.info('All Good', 'No low stock alerts');
        return;
      }
      const list = lowStock.slice(0, 10).map(p =>
        `<div class="low-stock-item">
          <div class="low-stock-item-info">
            <div class="low-stock-item-icon">${p.emoji || '📦'}</div>
            <div>
              <div class="low-stock-item-name">${p.name}</div>
              <div class="low-stock-item-qty">Stock: ${p.stock} (Min: ${p.reorderLevel})</div>
            </div>
          </div>
        </div>`
      ).join('');
      Modal.show({
        title: `⚠️ Low Stock Alerts (${lowStock.length})`,
        content: `<div class="low-stock-list">${list}</div>`,
        footer: '<button class="btn btn-primary" onclick="Modal.close();App.navigate(\'inventory\')">View Inventory</button>'
      });
    });

    this.updateNotificationDot();
    this.bindSyncStatus();
  },

  bindSyncStatus() {
    const indicator = document.getElementById('syncStatusIndicator');
    const icon = document.getElementById('syncStatusIcon');
    const text = document.getElementById('syncStatusText');
    if (!indicator || !DB.cloudEnabled) return;
    
    indicator.style.display = 'flex';

    window.addEventListener('sync-status-change', (e) => {
      const pending = e.detail.pending || 0;
      const pulled = e.detail.pulled || false;
      
      if (pending > 0) {
        indicator.style.background = '#fffbeb';
        indicator.style.color = '#92400e';
        icon.textContent = '⏳';
        text.textContent = `${pending} pending`;
      } else if (pulled) {
        indicator.style.background = '#f0fdf4';
        indicator.style.color = 'var(--success-dark)';
        icon.textContent = '🔄';
        text.textContent = 'Updated';
        setTimeout(() => {
          if (text.textContent === 'Updated') {
             indicator.style.background = 'var(--bg-secondary)';
             indicator.style.color = 'var(--text-secondary)';
             icon.textContent = '☁️';
             text.textContent = 'Synced';
          }
        }, 3000);
      } else {
        indicator.style.background = 'var(--bg-secondary)';
        indicator.style.color = 'var(--text-secondary)';
        icon.textContent = '☁️';
        text.textContent = 'Synced';
      }
    });
  },

  async updateNotificationDot() {
    const lowStock = await DB.getLowStockProducts();
    const dot = document.getElementById('notificationDot');
    if (dot) dot.classList.toggle('hidden', lowStock.length === 0);
  }
};
