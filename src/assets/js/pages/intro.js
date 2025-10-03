const doc = document;

const onReady = (cb) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', cb, { once: true });
  } else {
    cb();
  }
};

onReady(() => {
  const grid = doc.getElementById('cdc-grid');
  const chipsRow = doc.getElementById('cdc-chips');
  const searchInput = doc.getElementById('cdc-search');
  const resetBtn = doc.getElementById('cdc-reset');
  const countEl = doc.getElementById('cdc-count');

  if (!grid || !chipsRow || !searchInput || !resetBtn || !countEl) return;

  const cards = Array.from(grid.querySelectorAll('.cdc-card'));
  const tagSet = new Set();
  cards.forEach((card) => {
    const tags = (card.getAttribute('data-tags') || '')
      .split(',')
      .map((text) => text.trim().toLowerCase())
      .filter(Boolean);
    card.dataset.tags = tags.join(',');
    tags.forEach((tag) => tagSet.add(tag));
  });

  const state = { tags: new Set(), q: '' };

  const syncHash = () => {
    const params = new URLSearchParams();
    if (state.tags.size) params.set('cdc', [...state.tags].join(','));
    if (state.q) params.set('q', state.q);
    const next = `#${params.toString()}`;
    if (location.hash !== next) history.replaceState(null, '', next);
  };

  const render = () => {
    const query = state.q.toLowerCase();
    let visible = 0;
    cards.forEach((card) => {
      const name = card.querySelector('h3')?.textContent.toLowerCase() || '';
      const body = card.querySelector('p')?.textContent.toLowerCase() || '';
      const tags = (card.dataset.tags || '').split(',').filter(Boolean);
      const hasAll = [...state.tags].every((tag) => tags.includes(tag));
      const matches = !query || name.includes(query) || body.includes(query);
      const show = hasAll && matches;
      card.classList.toggle('cdc-hide', !show);
      if (show) visible += 1;
    });
    countEl.textContent = `${visible} shown / ${cards.length} total`;
  };

  const makeChip = (tag) => {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'cdc-chip';
    button.textContent = tag;
    button.setAttribute('aria-pressed', 'false');
    button.addEventListener('click', () => {
      const isActive = button.getAttribute('aria-pressed') === 'true';
      button.setAttribute('aria-pressed', isActive ? 'false' : 'true');
      if (isActive) state.tags.delete(tag);
      else state.tags.add(tag);
      syncHash();
      render();
    });
    return button;
  };

  [...tagSet].sort().forEach((tag) => chipsRow.appendChild(makeChip(tag)));

  searchInput.addEventListener('input', (event) => {
    state.q = event.target.value.trim();
    syncHash();
    render();
  });

  resetBtn.addEventListener('click', () => {
    state.q = '';
    searchInput.value = '';
    state.tags.clear();
    chipsRow.querySelectorAll('.cdc-chip').forEach((chip) => chip.setAttribute('aria-pressed', 'false'));
    syncHash();
    render();
  });

  const parseHash = () => {
    const params = new URLSearchParams(location.hash.replace(/^#/, ''));
    const tags = (params.get('cdc') || '')
      .split(',')
      .map((token) => token.trim().toLowerCase())
      .filter(Boolean);
    const q = (params.get('q') || '').trim();
    state.tags = new Set(tags);
    state.q = q;
    chipsRow.querySelectorAll('.cdc-chip').forEach((chip) => {
      chip.setAttribute('aria-pressed', state.tags.has(chip.textContent.toLowerCase()) ? 'true' : 'false');
    });
    searchInput.value = state.q;
  };

  window.addEventListener('hashchange', () => {
    parseHash();
    render();
  });

  parseHash();
  render();
});

onReady(() => {
  const chooser = doc.getElementById('priority-chooser');
  if (chooser) {
    const buttons = Array.from(chooser.querySelectorAll('.priority-btn'));
    const result = chooser.querySelector('.priority-result');
    const resultHeading = chooser.querySelector('#priority-method');
    const resultSummary = chooser.querySelector('#priority-summary');

    const cards = {
      log: doc.getElementById('method-log'),
      trigger: doc.getElementById('method-trigger'),
      polling: doc.getElementById('method-polling')
    };

    const activate = (button) => {
      if (!button) return;
      const method = button.dataset.method;
      buttons.forEach((btn) => {
        const isActive = btn === button;
        btn.classList.toggle('is-active', isActive);
        btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      if (result) {
        result.setAttribute('aria-labelledby', button.id);
        result.dataset.selected = method;
      }
      Object.entries(cards).forEach(([key, card]) => {
        if (!card) return;
        card.classList.toggle('is-highlighted', key === method);
      });
      const label = cards[method]?.querySelector('h3')?.textContent || button.textContent.trim();
      if (resultHeading) resultHeading.textContent = label;
      if (resultSummary) resultSummary.textContent = button.dataset.summary || '';
    };

    const rotate = (index) => {
      if (!buttons.length) return;
      const next = (index + buttons.length) % buttons.length;
      const target = buttons[next];
      target.focus();
      activate(target);
    };

    buttons.forEach((button, index) => {
      button.addEventListener('click', () => activate(button));
      button.addEventListener('keydown', (event) => {
        switch (event.key) {
          case 'ArrowRight':
          case 'ArrowDown':
            event.preventDefault();
            rotate(index + 1);
            break;
          case 'ArrowLeft':
          case 'ArrowUp':
            event.preventDefault();
            rotate(index - 1);
            break;
          case 'Home':
            event.preventDefault();
            rotate(0);
            break;
          case 'End':
            event.preventDefault();
            rotate(buttons.length - 1);
            break;
          default:
            break;
        }
      });
    });

    activate(buttons.find((btn) => btn.classList.contains('is-active')) || buttons[0]);
  }

  const nav = doc.querySelector('.sticky-subnav');
  if (nav) {
    const links = Array.from(nav.querySelectorAll('a[href^="#"]'));
    const sections = links
      .map((link) => {
        const id = link.getAttribute('href')?.slice(1);
        const section = id ? doc.getElementById(id) : null;
        return section ? { link, section } : null;
      })
      .filter(Boolean);

    const setActiveLink = (id) => {
      links.forEach((link) => {
        const isActive = link.getAttribute('href') === `#${id}`;
        link.classList.toggle('is-active', isActive);
        if (isActive) link.setAttribute('aria-current', 'true');
        else link.removeAttribute('aria-current');
      });
    };

    if (sections.length) {
      const observer = new IntersectionObserver((entries) => {
        entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)
          .slice(0, 1)
          .forEach((entry) => setActiveLink(entry.target.id));
      }, {
        root: null,
        rootMargin: '-55% 0px -35% 0px',
        threshold: [0.1, 0.25, 0.5, 0.75, 1]
      });

      sections.forEach(({ section }) => observer.observe(section));
      setActiveLink(sections[0].section.id);
    }

    links.forEach((link) => {
      link.addEventListener('click', () => {
        const id = link.getAttribute('href')?.slice(1);
        if (id) setActiveLink(id);
      });
    });
  }
});
