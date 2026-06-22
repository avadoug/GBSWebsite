(function () {
  const DATA_KEY = 'gbs_site_data_v1';
  const REPORT_KEY = 'gbs_smoke_reports_v1';
  const AGE_KEY = 'gbs_age_confirmed_v1';

  const baseData = window.GBS_SITE_DATA || {};
  const storedData = safeJson(localStorage.getItem(DATA_KEY));
  const data = storedData || baseData;

  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));

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

  function linkOrHash(item) {
    return item.link ? escapeHTML(item.link) : '#top';
  }

  function initAgeGate() {
    const gate = $('#ageGate');
    if (!gate) return;
    if (localStorage.getItem(AGE_KEY) !== 'yes') {
      gate.classList.add('show');
      gate.setAttribute('aria-hidden', 'false');
    }
    $('#enterSite')?.addEventListener('click', () => {
      localStorage.setItem(AGE_KEY, 'yes');
      gate.classList.remove('show');
      gate.setAttribute('aria-hidden', 'true');
    });
    $('#leaveSite')?.addEventListener('click', () => {
      window.location.href = 'https://www.google.com';
    });
  }

  function initNav() {
    const toggle = $('#navToggle');
    const nav = $('#mainNav');
    toggle?.addEventListener('click', () => {
      const open = nav.classList.toggle('open');
      toggle.setAttribute('aria-expanded', String(open));
    });
    $$('#mainNav a').forEach((link) => {
      link.addEventListener('click', () => nav.classList.remove('open'));
    });
  }

  function renderHero() {
    $('#featuredTitle').textContent = data.site?.featuredTitle || 'GBS control room';
    $('#featuredText').textContent = data.site?.featuredText || '';

    const stats = $('#quickStats');
    if (stats) {
      stats.innerHTML = (data.stats || []).map((stat) => `
        <div class="stat">
          <strong>${escapeHTML(stat.value)}</strong>
          <span>${escapeHTML(stat.label)}</span>
        </div>
      `).join('');
    }

    const track = $('#announcementTrack');
    if (track) {
      const announcements = [...(data.announcements || []), ...(data.announcements || [])];
      track.innerHTML = announcements.map((item) => `<span>${escapeHTML(item)}</span>`).join('');
    }
  }

  function renderProjects(filter = 'All') {
    const projects = data.projects || [];
    const filters = ['All', ...new Set(projects.map((p) => p.tag).filter(Boolean))];
    const filterWrap = $('#projectFilters');
    if (filterWrap) {
      filterWrap.innerHTML = filters.map((name) => `<button class="filter-btn ${name === filter ? 'active' : ''}" data-filter="${escapeHTML(name)}">${escapeHTML(name)}</button>`).join('');
      $$('.filter-btn', filterWrap).forEach((btn) => {
        btn.addEventListener('click', () => renderProjects(btn.dataset.filter));
      });
    }

    const visible = filter === 'All' ? projects : projects.filter((p) => p.tag === filter);
    const grid = $('#projectGrid');
    if (!grid) return;
    grid.innerHTML = visible.map((project) => `
      <article class="project-card">
        <div class="tag-row">
          <span class="tag">${escapeHTML(project.tag || 'Project')}</span>
          <span class="status">${escapeHTML(project.status || 'Active')}</span>
        </div>
        <h3>${escapeHTML(project.title)}</h3>
        <p>${escapeHTML(project.description)}</p>
        <div class="notes">${escapeHTML(project.notes || '')}</div>
        ${project.link ? `<a class="btn mini" href="${linkOrHash(project)}">Open</a>` : ''}
      </article>
    `).join('');
  }

  function renderBots() {
    const list = $('#botList');
    if (!list) return;
    list.innerHTML = (data.bots || []).map((bot) => `
      <article class="bot-item">
        <div class="bot-top">
          <div>
            <span class="tag">${escapeHTML(bot.status || 'Bot')}</span>
            <h3>${escapeHTML(bot.title)}</h3>
          </div>
          ${bot.link ? `<a class="btn mini" href="${linkOrHash(bot)}">Docs</a>` : ''}
        </div>
        <p>${escapeHTML(bot.description)}</p>
        <div class="command-list">
          ${(bot.commands || []).map((cmd) => `<code>${escapeHTML(cmd)}</code>`).join('')}
        </div>
      </article>
    `).join('');
  }

  function renderGames() {
    const icons = ['▣', '✦', '⌘', '◉', '⚙', '✺'];
    const grid = $('#gameGrid');
    if (!grid) return;
    grid.innerHTML = (data.games || []).map((game, index) => `
      <article class="game-card">
        <div class="game-icon">${icons[index % icons.length]}</div>
        <span class="tag">${escapeHTML(game.genre || 'Game')}</span>
        <h3>${escapeHTML(game.title)}</h3>
        <p>${escapeHTML(game.description)}</p>
        <div class="notes">${escapeHTML(game.status || 'Concept')}</div>
        ${game.link ? `<a class="btn mini" href="${linkOrHash(game)}">Play</a>` : ''}
      </article>
    `).join('');
  }

  function getReports() {
    return safeJson(localStorage.getItem(REPORT_KEY)) || [];
  }

  function saveReports(reports) {
    localStorage.setItem(REPORT_KEY, JSON.stringify(reports));
  }

  function renderReports() {
    const list = $('#smokeReportList');
    if (!list) return;
    const reports = getReports();
    if (!reports.length) {
      list.innerHTML = `<div class="report-card"><h4>No reports yet</h4><p>Save one from the form and it will show up here.</p></div>`;
      return;
    }
    list.innerHTML = reports.slice().reverse().map((report) => `
      <article class="report-card">
        <h4>${escapeHTML(report.strain)}</h4>
        <div class="report-meta">
          <span>${escapeHTML(report.effect)}</span>
          <span>${escapeHTML(report.rating)}/10</span>
          <span>${escapeHTML(report.date)}</span>
        </div>
        <p><strong>Aroma:</strong> ${escapeHTML(report.aroma || 'Not noted')}</p>
        <p><strong>Flavor:</strong> ${escapeHTML(report.flavor || 'Not noted')}</p>
        <p>${escapeHTML(report.notes || '')}</p>
      </article>
    `).join('');
  }

  function initSmokeForm() {
    const form = $('#smokeForm');
    if (!form) return;
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const formData = new FormData(form);
      const report = Object.fromEntries(formData.entries());
      report.date = new Date().toLocaleDateString();
      const reports = getReports();
      reports.push(report);
      saveReports(reports);
      form.reset();
      renderReports();
    });
    $('#clearLocalReports')?.addEventListener('click', () => {
      if (confirm('Clear smoke reports saved in this browser?')) {
        saveReports([]);
        renderReports();
      }
    });
  }

  function renderResources() {
    const list = $('#resourceList');
    if (!list) return;
    list.innerHTML = (data.resources || []).map((item) => `
      <article class="resource-item">
        <div class="resource-badge">${escapeHTML((item.category || 'R').slice(0, 2).toUpperCase())}</div>
        <div>
          <span class="tag">${escapeHTML(item.category || 'Resource')}</span>
          <h3>${escapeHTML(item.title)}</h3>
          <p>${escapeHTML(item.description)}</p>
        </div>
        ${item.link ? `<a class="btn mini" href="${linkOrHash(item)}">Open</a>` : ''}
      </article>
    `).join('');
  }

  function renderCustomSections() {
    const wrap = $('#customSections');
    const outer = $('#customSectionsWrap');
    if (!wrap || !outer) return;
    const sections = data.customSections || [];
    if (!sections.length) {
      outer.style.display = 'none';
      return;
    }
    wrap.innerHTML = sections.map((section) => `
      <article class="custom-section">
        <h2>${escapeHTML(section.title)}</h2>
        <p>${escapeHTML(section.body)}</p>
      </article>
    `).join('');
  }

  function initBackTop() {
    const btn = $('#backTop');
    if (!btn) return;
    window.addEventListener('scroll', () => {
      btn.classList.toggle('show', window.scrollY > 600);
    });
    btn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
  }

  initAgeGate();
  initNav();
  renderHero();
  renderProjects();
  renderBots();
  renderGames();
  renderResources();
  renderCustomSections();
  initSmokeForm();
  renderReports();
  initBackTop();
})();
