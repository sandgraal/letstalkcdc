// Content depth toggle (Beginner / Practitioner)
document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.querySelector('.depth-toggle');
  if (!toggle) return;

  const setDepth = (level) => {
    toggle.querySelectorAll('.depth-btn').forEach((button) => {
      const isActive = button.dataset.depth === level;
      button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    });

    document.querySelectorAll('[data-level]').forEach((el) => {
      el.classList.toggle('is-active', el.dataset.level === level);
    });

    try {
      localStorage.setItem('cdcDepth', level);
    } catch (_) {
      /* no-op for storage denials */
    }
  };

  const initial = (() => {
    try {
      return localStorage.getItem('cdcDepth') || 'beginner';
    } catch (_) {
      return 'beginner';
    }
  })();

  setDepth(initial);

  toggle.addEventListener('click', (event) => {
    const button = event.target.closest('.depth-btn');
    if (button) setDepth(button.dataset.depth);
  });
});


/* search overlay */
document.addEventListener('DOMContentLoaded', () => {
  const overlay = document.createElement('div');
  overlay.className = 'search-overlay hidden';
  overlay.innerHTML = `
    <div class="search-panel" role="dialog" aria-modal="true" aria-labelledby="searchTitle">
      <div class="search-header">
        <h2 id="searchTitle">Search the CDC Manual</h2>
        <input type="search" id="searchInput" placeholder="Search pages, concepts, and code..." aria-label="Search text">
        <button class="btn close-search" aria-label="Close search">×</button>
      </div>
      <div id="searchResults" class="search-results" role="listbox" aria-label="Search results"></div>
      <div class="search-hint">Press <kbd>/</kbd> to open. <kbd>Esc</kbd> to close.</div>
    </div>`;
  document.body.appendChild(overlay);
  const input = overlay.querySelector('#searchInput');
  const results = overlay.querySelector('#searchResults');
  const closeBtn = overlay.querySelector('.close-search');
  let data = [];
  fetch('search-index.json').then(r => r.json()).then(j => data = j).catch(()=>{});

  function openOverlay(){
    overlay.classList.remove('hidden');
    input.value = '';
    results.innerHTML = '';
    input.focus();
  }
  function closeOverlay(){
    overlay.classList.add('hidden');
  }
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey) {
      e.preventDefault(); openOverlay();
    } else if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeOverlay();
    }
  });
  closeBtn.addEventListener('click', closeOverlay);

  function render(items){
    results.innerHTML = items.slice(0, 30).map(it => {
      const snippet = it.text.slice(0, 240).replace(/</g,'&lt;');
      return `<a class="result" href="${it.path}"><strong>${it.title}</strong><div class="snippet">${snippet}...</div></a>`
    }).join('');
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.innerHTML = ''; return; }
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = data.map(it => {
      let score = 0; const t = it.text.toLowerCase();
      terms.forEach(term => {
        const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
        const matches = (t.match(re) || []).length;
        score += (matches * (term.length >= 4 ? 2 : 1));
        if (it.title.toLowerCase().includes(term)) score += 5;
      });
      return { ...it, score };
    }).filter(it => it.score > 0).sort((a,b) => b.score - a.score);
    render(scored);
  });

  // Add a lightweight "Search" button in the header if nav exists
  const header = document.querySelector('.nav-right, header .nav-links');
  if (header) {
    const a = document.createElement('button');
    a.className = 'btn search-btn';
    a.type = 'button';
    a.textContent = 'Search';
    a.addEventListener('click', openOverlay);
    header.appendChild(a);
  }
});
