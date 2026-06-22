import{t as e}from"./styles-Q4wE1l15.js";import{t}from"./content-DY3zaZrY.js";var n=e((()=>{(function(){let e=`gbs_smoke_reports_v1`,t=`gbs_age_confirmed_v1`,n=window.GBS_SITE_DATA||{},r=o(localStorage.getItem(`gbs_site_data_v1`))||n,i=(e,t=document)=>t.querySelector(e),a=(e,t=document)=>Array.from(t.querySelectorAll(e));function o(e){if(!e)return null;try{return JSON.parse(e)}catch{return null}}function s(e){return String(e||``).replaceAll(`&`,`&amp;`).replaceAll(`<`,`&lt;`).replaceAll(`>`,`&gt;`).replaceAll(`"`,`&quot;`).replaceAll(`'`,`&#039;`)}function c(e){return e.link?s(e.link):`#top`}function l(){let e=i(`#ageGate`);e&&(localStorage.getItem(t)!==`yes`&&(e.classList.add(`show`),e.setAttribute(`aria-hidden`,`false`)),i(`#enterSite`)?.addEventListener(`click`,()=>{localStorage.setItem(t,`yes`),e.classList.remove(`show`),e.setAttribute(`aria-hidden`,`true`)}),i(`#leaveSite`)?.addEventListener(`click`,()=>{window.location.href=`https://www.google.com`}))}function u(){let e=i(`#navToggle`),t=i(`#mainNav`);e?.addEventListener(`click`,()=>{let n=t.classList.toggle(`open`);e.setAttribute(`aria-expanded`,String(n))}),a(`#mainNav a`).forEach(e=>{e.addEventListener(`click`,()=>t.classList.remove(`open`))})}function d(){i(`#featuredTitle`).textContent=r.site?.featuredTitle||`GBS control room`,i(`#featuredText`).textContent=r.site?.featuredText||``;let e=i(`#quickStats`);e&&(e.innerHTML=(r.stats||[]).map(e=>`
        <div class="stat">
          <strong>${s(e.value)}</strong>
          <span>${s(e.label)}</span>
        </div>
      `).join(``));let t=i(`#announcementTrack`);t&&(t.innerHTML=[...r.announcements||[],...r.announcements||[]].map(e=>`<span>${s(e)}</span>`).join(``))}function f(e=`All`){let t=r.projects||[],n=[`All`,...new Set(t.map(e=>e.tag).filter(Boolean))],o=i(`#projectFilters`);o&&(o.innerHTML=n.map(t=>`<button class="filter-btn ${t===e?`active`:``}" data-filter="${s(t)}">${s(t)}</button>`).join(``),a(`.filter-btn`,o).forEach(e=>{e.addEventListener(`click`,()=>f(e.dataset.filter))}));let l=e===`All`?t:t.filter(t=>t.tag===e),u=i(`#projectGrid`);u&&(u.innerHTML=l.map(e=>`
      <article class="project-card">
        <div class="tag-row">
          <span class="tag">${s(e.tag||`Project`)}</span>
          <span class="status">${s(e.status||`Active`)}</span>
        </div>
        <h3>${s(e.title)}</h3>
        <p>${s(e.description)}</p>
        <div class="notes">${s(e.notes||``)}</div>
        ${e.link?`<a class="btn mini" href="${c(e)}">Open</a>`:``}
      </article>
    `).join(``))}function p(){let e=i(`#botList`);e&&(e.innerHTML=(r.bots||[]).map(e=>`
      <article class="bot-item">
        <div class="bot-top">
          <div>
            <span class="tag">${s(e.status||`Bot`)}</span>
            <h3>${s(e.title)}</h3>
          </div>
          ${e.link?`<a class="btn mini" href="${c(e)}">Docs</a>`:``}
        </div>
        <p>${s(e.description)}</p>
        <div class="command-list">
          ${(e.commands||[]).map(e=>`<code>${s(e)}</code>`).join(``)}
        </div>
      </article>
    `).join(``))}function m(){let e=[`▣`,`✦`,`⌘`,`◉`,`⚙`,`✺`],t=i(`#gameGrid`);t&&(t.innerHTML=(r.games||[]).map((t,n)=>`
      <article class="game-card">
        <div class="game-icon">${e[n%e.length]}</div>
        <span class="tag">${s(t.genre||`Game`)}</span>
        <h3>${s(t.title)}</h3>
        <p>${s(t.description)}</p>
        <div class="notes">${s(t.status||`Concept`)}</div>
        ${t.link?`<a class="btn mini" href="${c(t)}">Play</a>`:``}
      </article>
    `).join(``))}function h(){return o(localStorage.getItem(e))||[]}function g(t){localStorage.setItem(e,JSON.stringify(t))}function _(){let e=i(`#smokeReportList`);if(!e)return;let t=h();if(!t.length){e.innerHTML=`<div class="report-card"><h4>No reports yet</h4><p>Save one from the form and it will show up here.</p></div>`;return}e.innerHTML=t.slice().reverse().map(e=>`
      <article class="report-card">
        <h4>${s(e.strain)}</h4>
        <div class="report-meta">
          <span>${s(e.effect)}</span>
          <span>${s(e.rating)}/10</span>
          <span>${s(e.date)}</span>
        </div>
        <p><strong>Aroma:</strong> ${s(e.aroma||`Not noted`)}</p>
        <p><strong>Flavor:</strong> ${s(e.flavor||`Not noted`)}</p>
        <p>${s(e.notes||``)}</p>
      </article>
    `).join(``)}function v(){let e=i(`#smokeForm`);e&&(e.addEventListener(`submit`,t=>{t.preventDefault();let n=new FormData(e),r=Object.fromEntries(n.entries());r.date=new Date().toLocaleDateString();let i=h();i.push(r),g(i),e.reset(),_()}),i(`#clearLocalReports`)?.addEventListener(`click`,()=>{confirm(`Clear smoke reports saved in this browser?`)&&(g([]),_())}))}function y(){let e=i(`#resourceList`);e&&(e.innerHTML=(r.resources||[]).map(e=>`
      <article class="resource-item">
        <div class="resource-badge">${s((e.category||`R`).slice(0,2).toUpperCase())}</div>
        <div>
          <span class="tag">${s(e.category||`Resource`)}</span>
          <h3>${s(e.title)}</h3>
          <p>${s(e.description)}</p>
        </div>
        ${e.link?`<a class="btn mini" href="${c(e)}">Open</a>`:``}
      </article>
    `).join(``))}function b(){let e=i(`#customSections`),t=i(`#customSectionsWrap`);if(!e||!t)return;let n=r.customSections||[];if(!n.length){t.style.display=`none`;return}e.innerHTML=n.map(e=>`
      <article class="custom-section">
        <h2>${s(e.title)}</h2>
        <p>${s(e.body)}</p>
      </article>
    `).join(``)}function x(){let e=i(`#backTop`);e&&(window.addEventListener(`scroll`,()=>{e.classList.toggle(`show`,window.scrollY>600)}),e.addEventListener(`click`,()=>window.scrollTo({top:0,behavior:`smooth`})))}l(),u(),d(),f(),p(),m(),y(),b(),v(),_(),x()})()}));t(),n();