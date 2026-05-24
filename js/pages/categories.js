/* ===== CATEGORIES PAGE ===== */
const CategoriesPage = {
  async render() {
    const content = document.getElementById('pageContent');
    content.className = 'page-content';
    content.style.padding = '';
    content.style.overflow = '';

    const categories = await DB.getCategories();
    const products = await DB.getProducts();

    content.innerHTML = `
      <div class="page-header">
        <h2>Categories (${categories.length})</h2>
        <button class="btn btn-primary" id="addCategoryBtn">${Utils.icons.plus} Add Category</button>
      </div>
      <div class="grid-4" id="categoriesGrid">
        ${categories.map(c => {
          const count = products.filter(p => p.categoryId === c.id).length;
          return `
            <div class="content-card" style="cursor:pointer" data-cat-id="${c.id}">
              <div class="content-card-body" style="text-align:center;padding:24px">
                <div style="font-size:36px;margin-bottom:8px">${Utils.categoryEmoji(c.name)}</div>
                <h4 style="margin-bottom:4px">${Utils.escapeHtml(c.name)}</h4>
                <p style="font-size:var(--font-size-sm)">${count} products</p>
                <div style="display:flex;gap:8px;justify-content:center;margin-top:12px">
                  <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();CategoriesPage.editCategory(${c.id})">${Utils.icons.edit}</button>
                  <button class="btn btn-sm btn-outline" onclick="event.stopPropagation();CategoriesPage.deleteCategory(${c.id})" style="color:var(--danger)">${Utils.icons.trash}</button>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    document.getElementById('addCategoryBtn').addEventListener('click', () => this.showForm());
  },

  showForm(category = null) {
    const isEdit = !!category;
    Modal.show({
      title: isEdit ? 'Edit Category' : 'Add Category',
      content: `
        <div class="form-group">
          <label class="form-label">Category Name <span class="required">*</span></label>
          <input class="form-input" id="catName" value="${category?.name || ''}" autofocus>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" onclick="Modal.close()">Cancel</button>
        <button class="btn btn-primary" id="saveCatBtn">${isEdit ? 'Update' : 'Add'}</button>
      `
    });
    document.getElementById('saveCatBtn').addEventListener('click', async () => {
      const name = document.getElementById('catName').value.trim();
      if (!name) { Toast.error('Required', 'Category name is required'); return; }
      if (isEdit) {
        await DB.updateCategory(category.id, { name });
        Toast.success('Updated', 'Category updated');
      } else {
        await DB.addCategory({ name });
        Toast.success('Added', 'Category added');
      }
      Modal.close();
      this.render();
    });
  },

  async editCategory(id) {
    const cat = await DB.getCategory(id);
    if (cat) this.showForm(cat);
  },

  async deleteCategory(id) {
    Modal.confirm('Delete Category', 'Are you sure? Products in this category will not be deleted.', async () => {
      await DB.deleteCategory(id);
      Toast.success('Deleted', 'Category deleted');
      this.render();
    });
  }
};
