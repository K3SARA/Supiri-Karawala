/* ===== TOAST NOTIFICATIONS ===== */
const Toast = {
  show(type, title, message = '', duration = 3000) {
    const container = document.getElementById('toastContainer');
    const iconMap = {
      success: Utils.icons.check,
      error: Utils.icons.close,
      warning: Utils.icons.warning,
      info: Utils.icons.info
    };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
      <div class="toast-icon">${iconMap[type] || iconMap.info}</div>
      <div class="toast-content">
        <div class="toast-title">${Utils.escapeHtml(title || '')}</div>
        ${message ? `<div class="toast-message">${Utils.escapeHtml(message)}</div>` : ''}
      </div>
      <button class="toast-close" onclick="this.closest('.toast').remove()">${Utils.icons.close}</button>
    `;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('toast-exit');
      setTimeout(() => toast.remove(), 300);
    }, duration);
  },
  success(title, msg) { this.show('success', title, msg); },
  error(title, msg) { this.show('error', title, msg); },
  warning(title, msg) { this.show('warning', title, msg); },
  info(title, msg) { this.show('info', title, msg); }
};
