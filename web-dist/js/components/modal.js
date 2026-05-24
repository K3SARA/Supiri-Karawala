/* ===== MODAL COMPONENT ===== */
const Modal = {
  show(options = {}) {
    const { title = 'Modal', content = '', footer = '', size = '', onClose } = options;
    const overlay = document.getElementById('modalOverlay');
    const container = document.getElementById('modalContainer');

    overlay.classList.remove('hidden');
    container.classList.remove('hidden');

    container.innerHTML = `
      <div class="modal ${size ? 'modal-' + size : ''}">
        <div class="modal-header">
          <h3>${Utils.escapeHtml(title || '')}</h3>
          <button class="modal-close" id="modalCloseBtn">${Utils.icons.close}</button>
        </div>
        <div class="modal-body">${content}</div>
        ${footer ? `<div class="modal-footer">${footer}</div>` : ''}
      </div>
    `;

    const closeModal = () => {
      overlay.classList.add('hidden');
      container.classList.add('hidden');
      container.innerHTML = '';
      if (onClose) onClose();
    };

    document.getElementById('modalCloseBtn').onclick = closeModal;
    overlay.onclick = closeModal;
    this._closeFn = closeModal;
  },

  close() {
    if (this._closeFn) this._closeFn();
  },

  confirm(title, message, onConfirm) {
    this.show({
      title,
      content: `<p style="color:var(--text-primary);font-size:var(--font-size-base)">${message}</p>`,
      footer: `
        <button class="btn btn-outline" id="modalCancelBtn">Cancel</button>
        <button class="btn btn-danger" id="modalConfirmBtn">Confirm</button>
      `,
      onClose: null
    });
    document.getElementById('modalCancelBtn').addEventListener('click', () => this.close());
    document.getElementById('modalConfirmBtn').addEventListener('click', () => {
      this.close();
      if (onConfirm) onConfirm();
    });
  }
};
