(function () {
  const DATA_KEY = 'gbs_site_data_v1';
  const REPORT_KEY = 'gbs_smoke_reports_v1';

  const baseData = window.GBS_SITE_DATA || {};
  let data = safeJson(localStorage.getItem(DATA_KEY)) || structuredCloneSafe(baseData);

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

  function structuredCloneSafe(obj) {
    return JSON.parse(JSON.stringify(obj || {}));
  }

  function safeJson(raw) {
    if (!raw) return null;
    try { return JSON.parse(raw); } catch (err) { return null; }
  }

  function escapeHTML(str) {
    return String(str || '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function save() {
    localStorage.setItem(DATA_KEY, JSON.stringify(data));
    renderAll();
  }

  function normalizeItem(type, formData) {
    const item = Object.fromEntries(formData.entries());
    if (type === 'bots') {
      item.commands = String(item.commands || '')
        .split(',')
        .map((cmd) => cmd.trim())
        .filter(Boolean);
    }
    return item;
  }

  function bindForms() {
    $$('.admin-form').forEach((form) => {
      form.addEventListener('submit', (event) => {
        event.preventDefault();
        const type = form.dataset.type;
        const item = normalizeItem(type, new FormData(form));
        if (!data[type]) data[type] = [];
        data[type].push(item);
        form.reset();
        save();
      });
    });
  }

  function renderAdminList(type, selector, fields = []) {
    const list = $(selector);
    if (!list) return;
    const items = data[type] || [];
    if (!items.length) {
      list.innerHTML = '<div class="admin-row"><div><h3>No items yet</h3><p>Add one above.</p></div></div>';
      return;
    }
    list.innerHTML = items.map((item, index) => {
      const line = fields.map((field) => {
        const value = Array.isArray(item[field]) ? item[field].join(', ') : item[field];
        return value ? `<span class="tag">${escapeHTML(value)}</span>` : '';
      }).join(' ');
      return `
        <div class="admin-row">
          <div>
            <h3>${escapeHTML(item.title || item.strain || 'Untitled')}</h3>
            <p>${line}</p>
            <p>${escapeHTML(item.description || item.notes || item.body || '')}</p>
          </div>
          <button class="delete-btn" data-type="${type}" data-index="${index}">Delete</button>
        </div>
      `;
    }).join('');
    $$(`.delete-btn[data-type="${type}"]`, list).forEach((btn) => {
      btn.addEventListener('click', () => {
        const index = Number(btn.dataset.index);
        data[type].splice(index, 1);
        save();
      });
    });
  }

  function getReports() {
    return safeJson(localStorage.getItem(REPORT_KEY)) || [];
  }

  function renderReports() {
    const reports = getReports();
    const list = $('#adminReports');
    if (!list) return;
    if (!reports.length) {
      list.innerHTML = '<div class="admin-row"><div><h3>No local smoke reports</h3><p>Reports from the public form will appear here.</p></div></div>';
      return;
    }
    list.innerHTML = reports.slice().reverse().map((item, reverseIndex) => {
      const index = reports.length - 1 - reverseIndex;
      return `
        <div class="admin-row">
          <div>
            <h3>${escapeHTML(item.strain)}</h3>
            <p><span class="tag">${escapeHTML(item.effect)}</span> <span class="tag">${escapeHTML(item.rating)}/10</span> <span class="tag">${escapeHTML(item.date)}</span></p>
            <p>${escapeHTML(item.notes || '')}</p>
          </div>
          <button class="delete-btn" data-report-index="${index}">Delete</button>
        </div>
      `;
    }).join('');
    $$('[data-report-index]', list).forEach((btn) => {
      btn.addEventListener('click', () => {
        const fresh = getReports();
        fresh.splice(Number(btn.dataset.reportIndex), 1);
        localStorage.setItem(REPORT_KEY, JSON.stringify(fresh));
        renderReports();
      });
    });
  }

  function renderAll() {
    renderAdminList('projects', '#adminProjects', ['tag', 'status']);
    renderAdminList('bots', '#adminBots', ['status', 'commands']);
    renderAdminList('games', '#adminGames', ['genre', 'status']);
    renderAdminList('resources', '#adminResources', ['category']);
    renderReports();
  }

  function exportPayload() {
    const reports = getReports();
    return JSON.stringify({ ...data, smokeReports: reports }, null, 2);
  }

  function bindExportImport() {
    $('#downloadJson')?.addEventListener('click', () => {
      const blob = new Blob([exportPayload()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'gbs-site-data.json';
      anchor.click();
      URL.revokeObjectURL(url);
    });

    $('#copyJson')?.addEventListener('click', async () => {
      await navigator.clipboard.writeText(exportPayload());
      alert('GBS JSON copied to clipboard. Tiny file goblin captured successfully.');
    });

    $('#importJson')?.addEventListener('click', () => {
      const raw = $('#importBox')?.value;
      const incoming = safeJson(raw);
      if (!incoming) {
        alert('That JSON did not parse. Check commas, quotes, and brackets.');
        return;
      }
      const { smokeReports, ...siteData } = incoming;
      data = siteData;
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      if (Array.isArray(smokeReports)) {
        localStorage.setItem(REPORT_KEY, JSON.stringify(smokeReports));
      }
      renderAll();
      alert('Imported. View the site to see your local changes.');
    });

    $('#resetDemo')?.addEventListener('click', () => {
      if (!confirm('Reset local content manager data back to demo data?')) return;
      data = structuredCloneSafe(baseData);
      localStorage.setItem(DATA_KEY, JSON.stringify(data));
      renderAll();
    });
  }

  bindForms();
  bindExportImport();
  renderAll();
})();
