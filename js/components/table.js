/* ===== DATA TABLE COMPONENT ===== */
const DataTable = {
  render(containerId, options = {}) {
    const {
      columns = [], data = [], searchable = true, paginate = true,
      pageSize = 15, actions = null, emptyMessage = 'No data found',
      onRowClick = null, id = 'table'
    } = options;

    const container = document.getElementById(containerId);
    if (!container) return;

    let filteredData = [...data];
    let currentPage = 1;
    let sortCol = null;
    let sortDir = 'asc';

    function renderTable() {
      const totalPages = Math.ceil(filteredData.length / pageSize);
      const startIdx = (currentPage - 1) * pageSize;
      const pageData = paginate ? filteredData.slice(startIdx, startIdx + pageSize) : filteredData;

      let html = `<div class="content-card">`;

      if (searchable) {
        html += `<div class="table-toolbar">
          <div class="table-search">
            ${Utils.icons.search}
            <input type="text" placeholder="Search..." id="${id}Search">
          </div>
          <span class="text-secondary" style="font-size:var(--font-size-sm)">${filteredData.length} records</span>
        </div>`;
      }

      html += `<div class="data-table-wrapper"><table class="data-table">
        <thead><tr>
          ${columns.map(col => `<th class="${col.sortable !== false ? 'sortable' : ''}" data-key="${col.key}">${col.label}</th>`).join('')}
          ${actions ? '<th class="dt-actions-col" style="width:100px">Actions</th>' : ''}
        </tr></thead>
        <tbody>`;

      if (pageData.length === 0) {
        html += `<tr><td colspan="${columns.length + (actions ? 1 : 0)}" style="text-align:center;padding:40px;color:var(--text-secondary)">${emptyMessage}</td></tr>`;
      } else {
        pageData.forEach(row => {
          html += `<tr ${onRowClick ? 'style="cursor:pointer"' : ''} data-id="${row.id || ''}">`;
          columns.forEach(col => {
            const val = col.render
              ? col.render(row)
              : Utils.escapeHtml(String(row[col.key] ?? ''));
            html += `<td>${val}</td>`;
          });
          if (actions) {
            html += `<td class="dt-actions-col"><div class="table-actions">${actions(row)}</div></td>`;
          }
          html += `</tr>`;
        });
      }

      html += `</tbody></table></div>`;

      if (paginate && totalPages > 1) {
        html += `<div class="table-pagination">
          <span class="table-pagination-info">Showing ${startIdx + 1}-${Math.min(startIdx + pageSize, filteredData.length)} of ${filteredData.length}</span>
          <div class="table-pagination-pages">
            <button class="pagination-btn" data-page="prev">&lt;</button>`;
        for (let i = 1; i <= totalPages; i++) {
          if (totalPages <= 7 || i === 1 || i === totalPages || Math.abs(i - currentPage) <= 1) {
            html += `<button class="pagination-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
          } else if (i === 2 || i === totalPages - 1) {
            html += `<span style="padding:0 4px;color:var(--text-secondary)">...</span>`;
          }
        }
        html += `<button class="pagination-btn" data-page="next">&gt;</button>
          </div></div>`;
      }

      html += `</div>`;
      container.innerHTML = html;

      // Search handler
      const searchInput = document.getElementById(`${id}Search`);
      if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce((e) => {
          const q = e.target.value.toLowerCase();
          filteredData = data.filter(row =>
            columns.some(col => {
              const val = row[col.key];
              return val && String(val).toLowerCase().includes(q);
            })
          );
          currentPage = 1;
          renderTable();
          const newSearch = document.getElementById(`${id}Search`);
          if (newSearch) { newSearch.value = e.target.value; newSearch.focus(); }
        }, 200));
      }

      // Pagination
      container.querySelectorAll('.pagination-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const p = btn.dataset.page;
          if (p === 'prev' && currentPage > 1) currentPage--;
          else if (p === 'next' && currentPage < totalPages) currentPage++;
          else if (!isNaN(p)) currentPage = parseInt(p);
          renderTable();
        });
      });

      // Sort
      container.querySelectorAll('th.sortable').forEach(th => {
        th.addEventListener('click', () => {
          const key = th.dataset.key;
          if (sortCol === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
          else { sortCol = key; sortDir = 'asc'; }
          filteredData.sort((a, b) => {
            const va = a[key] ?? '', vb = b[key] ?? '';
            const cmp = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb));
            return sortDir === 'asc' ? cmp : -cmp;
          });
          renderTable();
        });
      });

      // Row click
      if (onRowClick) {
        container.querySelectorAll('tbody tr[data-id]').forEach(tr => {
          tr.addEventListener('click', (e) => {
            if (e.target.closest('button')) return;
            onRowClick(tr.dataset.id);
          });
        });
      }
    }

    renderTable();
  }
};
