const doc = document;

const syncThemeToggle = (mode) => {
  doc.querySelectorAll('[data-toggle-theme]').forEach((button) => {
    button.setAttribute('aria-pressed', mode === 'dark' ? 'true' : 'false');
  });
};

const applyTheme = (mode) => {
  doc.documentElement.dataset.theme = mode;
  syncThemeToggle(mode);
};

const getStoredTheme = () => {
  try {
    return localStorage.getItem('theme');
  } catch (_) {
    return null;
  }
};

const setStoredTheme = (mode) => {
  try {
    localStorage.setItem('theme', mode);
  } catch (_) {
    /* storage denied */
  }
};

const themeMediaQuery = window.matchMedia
  ? window.matchMedia('(prefers-color-scheme: dark)')
  : null;

const initialTheme = getStoredTheme() ?? (themeMediaQuery?.matches ? 'dark' : 'light');

applyTheme(initialTheme);

doc.addEventListener('click', (event) => {
  const target = event.target.closest('[data-toggle-theme]');
  if (!target) return;
  const next = doc.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  setStoredTheme(next);
});

if (themeMediaQuery) {
  themeMediaQuery.addEventListener('change', (event) => {
    if (getStoredTheme()) return;
    applyTheme(event.matches ? 'dark' : 'light');
  });
}

if (window.matchMedia) {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  if (reduceMotion.matches) {
    doc.documentElement.classList.add('reduce-motion');
  }
  reduceMotion.addEventListener('change', (event) => {
    doc.documentElement.classList.toggle('reduce-motion', event.matches);
  });
}

const onReady = (callback) => {
  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', callback, { once: true });
  } else {
    callback();
  }
};

onReady(() => {
  const navToggle = doc.querySelector('[data-nav-toggle]');
  const navPanel = doc.querySelector('[data-nav-panel]');
  if (!navToggle || !navPanel) return;

  const closeNav = () => {
    navPanel.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
    doc.body.classList.remove('nav-open');
  };

  navToggle.addEventListener('click', () => {
    const isOpen = navPanel.classList.toggle('is-open');
    navToggle.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    doc.body.classList.toggle('nav-open', isOpen);
    if (isOpen && window.matchMedia && window.matchMedia('(max-width: 900px)').matches) {
      const firstLink = navPanel.querySelector('a[href]');
      if (firstLink) {
        firstLink.focus({ preventScroll: true });
      }
    }
  });

  doc.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && navPanel.classList.contains('is-open')) {
      closeNav();
      navToggle.focus({ preventScroll: true });
    }
  });

  navPanel.addEventListener('click', (event) => {
    if (event.target.closest('a[href]')) {
      closeNav();
    }
  });

  window.addEventListener('resize', () => {
    if (window.matchMedia && window.matchMedia('(min-width: 901px)').matches) {
      closeNav();
    }
  });
});

onReady(() => {
  // Content depth toggle (Beginner / Practitioner)
  const toggle = doc.querySelector('.depth-toggle');
  if (toggle) {
    const setDepth = (level) => {
      toggle.querySelectorAll('.depth-btn').forEach((button) => {
        const isActive = button.dataset.depth === level;
        button.setAttribute('aria-pressed', isActive ? 'true' : 'false');
      });
      doc.querySelectorAll('[data-level]').forEach((el) => {
        el.classList.toggle('is-active', el.dataset.level === level);
      });
      doc.documentElement.dataset.depth = level;
    };

    const initialDepth = (() => {
      try {
        return localStorage.getItem('cdcDepth') || 'beginner';
      } catch (_) {
        return 'beginner';
      }
    })();

    setDepth(initialDepth);

    toggle.addEventListener('click', (event) => {
      const button = event.target.closest('.depth-btn');
      if (!button) return;
      const level = button.dataset.depth;
      setDepth(level);
      try {
        localStorage.setItem('cdcDepth', level);
      } catch (_) {
        /* ignore */
      }
    });
  }
});

onReady(() => {
  // Heading anchors
  doc.querySelectorAll('.prose h2, .prose h3').forEach((heading) => {
    const slug = heading.id || heading.textContent.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');
    heading.id = slug;
    if (heading.querySelector('.anchor')) return;
    const anchor = Object.assign(doc.createElement('a'), {
      href: `#${slug}`,
      className: 'anchor',
      ariaLabel: 'Link to section'
    });
    heading.appendChild(anchor);
  });

  // Code copy buttons
  doc.querySelectorAll('pre > code').forEach((code) => {
    const pre = code.parentElement;
    let button = pre.querySelector('.copy-btn, .copy-snippet');
    if (!button) {
      button = Object.assign(doc.createElement('button'), {
        textContent: 'Copy',
        className: 'copy-snippet',
        type: 'button'
      });
      pre.style.position = 'relative';
      pre.appendChild(button);
    }

    const restore = (label) => {
      setTimeout(() => {
        button.textContent = label;
      }, 1200);
    };

    const label = button.textContent;

    button.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(code.innerText);
        button.textContent = 'Copied!';
        restore(label);
      } catch (_) {
        button.textContent = 'Failed';
        restore(label);
      }
    });
  });
});

onReady(() => {
  // Search overlay
  const overlay = doc.createElement('div');
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
  doc.body.appendChild(overlay);
  const input = overlay.querySelector('#searchInput');
  const results = overlay.querySelector('#searchResults');
  const closeBtn = overlay.querySelector('.close-search');
  let data = [];

  fetch('/search-index.json', { cache: 'force-cache' })
    .then((res) => (res.ok ? res.json() : []))
    .then((json) => {
      if (Array.isArray(json)) {
        data = json;
      }
    })
    .catch(() => {
      data = [];
    });

  const openOverlay = () => {
    const openNav = doc.querySelector('[data-nav-panel].is-open');
    if (openNav) {
      openNav.classList.remove('is-open');
      doc.body.classList.remove('nav-open');
      const navToggle = doc.querySelector('[data-nav-toggle]');
      if (navToggle) navToggle.setAttribute('aria-expanded', 'false');
    }
    overlay.classList.remove('hidden');
    input.value = '';
    results.innerHTML = '';
    input.focus();
  };

  const closeOverlay = () => {
    overlay.classList.add('hidden');
  };

  doc.addEventListener('keydown', (event) => {
    if (event.key === '/' && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      openOverlay();
    } else if (event.key === 'Escape' && !overlay.classList.contains('hidden')) {
      closeOverlay();
    }
  });

  closeBtn.addEventListener('click', closeOverlay);

  const render = (items) => {
    results.innerHTML = items
      .slice(0, 30)
      .map((item) => {
        const snippet = (item.text || '').slice(0, 240).replace(/</g, '&lt;');
        return `<a class="result" href="${item.path}"><strong>${item.title}</strong><div class="snippet">${snippet}...</div></a>`;
      })
      .join('');
  };

  input.addEventListener('input', () => {
    const query = input.value.trim().toLowerCase();
    if (!query) {
      results.innerHTML = '';
      return;
    }
    const terms = query.split(/\s+/).filter(Boolean);
    const scored = data
      .map((item) => {
        let score = 0;
        const text = (item.text || '').toLowerCase();
        terms.forEach((term) => {
          const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
          const matches = (text.match(new RegExp(escaped, 'g')) || []).length;
          score += matches * (term.length >= 4 ? 2 : 1);
          if ((item.title || '').toLowerCase().includes(term)) {
            score += 5;
          }
        });
        return { ...item, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    render(scored);
  });

  const utilities = doc.querySelector('.nav-utilities') || doc.querySelector('.nav-right, header .nav-links');
  if (utilities) {
    const trigger = doc.createElement('button');
    trigger.className = 'button ghost search-btn';
    trigger.type = 'button';
    trigger.textContent = 'Search';
    trigger.addEventListener('click', openOverlay);
    utilities.appendChild(trigger);
  }
});
