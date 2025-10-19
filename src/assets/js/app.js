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

onReady(() => {
  const quickNavs = doc.querySelectorAll('.intro-quick-nav');
  if (!quickNavs.length) return;

  const hasObserver = typeof window.IntersectionObserver === 'function';

  const getHashId = () => {
    const raw = window.location.hash.replace(/^#/, '');
    if (!raw) return '';
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  };

  quickNavs.forEach((nav) => {
    const links = Array.from(nav.querySelectorAll('a[href]'));
    if (!links.length) return;

    const decodeId = (value) => {
      if (!value) return '';
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return value;
      }
    };

    const targets = links
      .map((link) => {
        const href = link.getAttribute('href');
        if (!href || !href.startsWith('#')) return null;
        const id = decodeId(href.slice(1));
        if (!id) return null;
        const section = doc.getElementById(id);
        if (!section) return null;
        section.dataset.quickNavVisible = '0';
        return { link, id, section };
      })
      .filter(Boolean);

    if (!targets.length) return;

    const targetMap = new Map();
    targets.forEach((target) => {
      targetMap.set(target.id, target);
    });

    const ensureBadge = (link) => {
      let badge = link.querySelector('.quick-nav-badge');
      if (!badge) {
        badge = doc.createElement('span');
        badge.className = 'quick-nav-badge';
        badge.setAttribute('aria-hidden', 'true');
        link.appendChild(badge);
      }
      return badge;
    };

    const applyProgressDetail = (detail) => {
      if (!detail || !detail.sectionId) return;
      const target = targetMap.get(detail.sectionId);
      if (!target) return;
      if (!detail.total || detail.total <= 0) {
        if (target.badge) {
          target.badge.remove();
        }
        target.badge = null;
        target.link.dataset.quickNavComplete = '0';
        return;
      }
      const badge = ensureBadge(target.link);
      target.badge = badge;
      if (detail.completed >= detail.total) {
        badge.textContent = '✓';
        badge.dataset.state = 'complete';
        target.link.dataset.quickNavComplete = '1';
      } else {
        badge.textContent = `${detail.completed}/${detail.total}`;
        badge.dataset.state = 'progress';
        target.link.dataset.quickNavComplete = '0';
      }
    };

    doc.addEventListener('scorecard:update', (event) => {
      applyProgressDetail(event.detail || {});
    });

    doc.addEventListener('scorecard:summary', (event) => {
      applyProgressDetail(event.detail || {});
    });

    const applyActive = (targetId) => {
      let matched = false;
      targets.forEach(({ link, id }) => {
        const isActive = Boolean(targetId) && id === targetId;
        if (isActive) matched = true;
        if (isActive) {
          link.setAttribute('aria-current', 'true');
          link.classList.add('is-active');
        } else {
          link.removeAttribute('aria-current');
          link.classList.remove('is-active');
        }
      });
      return matched;
    };

    const ensureActive = (id) => {
      if (id && applyActive(id)) return;
      applyActive(targets[0].id);
    };

    nav.addEventListener('click', (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute('href');
      const id = decodeId(href ? href.slice(1) : '');
      ensureActive(id);
    });

    window.addEventListener('hashchange', () => {
      ensureActive(getHashId());
    });

    ensureActive(getHashId());

    if (!hasObserver) {
      return;
    }

    let currentId = getHashId() || targets[0].id;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          entry.target.dataset.quickNavVisible = entry.isIntersecting ? '1' : '0';
        });
        const visible = targets
          .filter(({ section }) => section.dataset.quickNavVisible === '1')
          .sort((a, b) => a.section.offsetTop - b.section.offsetTop);
        const candidate = visible.length ? visible[visible.length - 1] : null;
        const nextId = candidate?.id;
        if (nextId && nextId !== currentId) {
          currentId = nextId;
          applyActive(nextId);
        } else if (!nextId) {
          const fallback = targets
            .find(({ section }) => {
              const rect = section.getBoundingClientRect();
              return rect.top >= 0 && rect.top < window.innerHeight * 0.6;
            })?.id;
          if (fallback && fallback !== currentId) {
            currentId = fallback;
            applyActive(fallback);
          }
        }
      },
      { rootMargin: '-45% 0px -45% 0px', threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    targets.forEach(({ section }) => observer.observe(section));
  });
});

onReady(() => {
  const cards = Array.from(doc.querySelectorAll('[data-scorecard]'));
  if (!cards.length) return;

  const summaries = Array.from(doc.querySelectorAll('[data-scorecard-summary]'));
  const summaryByGroup = new Map();
  const groupState = new Map();
  const cardGroups = new Map();

  const toOrder = (value, fallback = 0) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  };

  const toCount = (value) => {
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const ensureGroupState = (group) => {
    const key = group || 'default';
    if (!groupState.has(key)) {
      groupState.set(key, new Map());
    }
    return groupState.get(key);
  };

  const renderSummary = (group) => {
    const resolvedGroup = group || 'default';
    const records = summaryByGroup.get(resolvedGroup);
    if (!records || !records.length) return;

    const state = ensureGroupState(resolvedGroup);
    const entries = Array.from(state.values()).sort((a, b) => toOrder(a.order, 0) - toOrder(b.order, 0));

    let totalChecks = 0;
    let completedChecks = 0;

    entries.forEach((entry) => {
      const entryTotal = toCount(entry.total);
      const entryCompleted = Math.min(toCount(entry.completed), entryTotal);
      totalChecks += entryTotal;
      completedChecks += entryCompleted;
    });

    const percentComplete = totalChecks ? Math.round((completedChecks / totalChecks) * 100) : 0;
    const summaryState = totalChecks > 0 && completedChecks >= totalChecks ? 'complete' : 'progress';

    records.forEach((record) => {
      if (record.element) {
        record.element.dataset.scorecardSummaryState = summaryState;
        record.element.dataset.scorecardSummaryTotal = String(totalChecks);
        record.element.dataset.scorecardSummaryCompleted = String(completedChecks);
        record.element.dataset.scorecardSummaryPercent = String(percentComplete);
      }

      if (record.progress) {
        record.progress.textContent = `${completedChecks} of ${totalChecks} readiness checks complete (${percentComplete}%)`;
      }

      if (record.meter) {
        record.meter.setAttribute('aria-valuenow', String(percentComplete));
        record.meter.setAttribute('aria-valuetext', `${percentComplete}% complete`);
        record.meter.setAttribute('aria-valuemax', '100');
      }

      if (record.meterFill) {
        record.meterFill.style.width = `${percentComplete}%`;
      }

      if (record.list) {
        record.list.innerHTML = '';
        entries.forEach((entry) => {
          const itemTotal = toCount(entry.total);
          const itemCompleted = Math.min(toCount(entry.completed), itemTotal);
          const isComplete = itemTotal > 0 && itemCompleted >= itemTotal;
          const statusText = isComplete
            ? 'Complete'
            : itemTotal
            ? `${itemCompleted} of ${itemTotal} ready`
            : 'No checks defined';
          const labelText = (entry.summaryLabel || entry.title || entry.key || '').trim() || 'Readiness scorecard';

          const item = doc.createElement('li');
          item.className = 'scorecard-summary-item';
          item.dataset.scorecardSummaryItem = entry.key;
          item.dataset.state = isComplete ? 'complete' : 'pending';
          item.dataset.order = String(toOrder(entry.order, 0));

          const label = doc.createElement('div');
          label.className = 'scorecard-summary-item-label';

          const nameNode = doc.createElement(entry.sectionId ? 'a' : 'span');
          nameNode.className = 'scorecard-summary-item-name';
          nameNode.textContent = labelText;
          if (entry.sectionId) {
            nameNode.setAttribute('href', `#${entry.sectionId}`);
          }
          label.appendChild(nameNode);

          const status = doc.createElement('span');
          status.className = 'scorecard-summary-item-status';
          status.textContent = statusText;

          item.appendChild(label);
          item.appendChild(status);
          record.list.appendChild(item);
        });

        const hasItems = entries.length > 0;
        record.list.hidden = !hasItems;
        if (record.empty) {
          record.empty.hidden = hasItems;
        }
        if (record.resetButton) {
          record.resetButton.disabled = !hasItems;
        }
      } else if (record.empty && !entries.length) {
        record.empty.hidden = false;
      }
    });

    const sections = new Set();
    records.forEach((record) => {
      const section = record.element?.closest('section');
      if (section && section.id) {
        sections.add(section);
      }
    });

    sections.forEach((section) => {
      const heading = section.querySelector('h2, h3');
      const headingText = heading?.textContent?.trim() || '';
      doc.dispatchEvent(
        new CustomEvent('scorecard:summary', {
          detail: {
            group: resolvedGroup,
            sectionId: section.id,
            title: headingText,
            total: totalChecks,
            completed: completedChecks,
            percent: percentComplete
          }
        })
      );
    });
  };

  summaries.forEach((summaryElement) => {
    const group = summaryElement.getAttribute('data-scorecard-summary') || 'default';
    const record = {
      element: summaryElement,
      progress: summaryElement.querySelector('[data-scorecard-summary-progress]'),
      meter: summaryElement.querySelector('[data-scorecard-summary-meter]'),
      meterFill: summaryElement.querySelector('[data-scorecard-summary-meter-fill]'),
      list: summaryElement.querySelector('[data-scorecard-summary-list]'),
      empty: summaryElement.querySelector('[data-scorecard-summary-empty]'),
      resetButton: summaryElement.querySelector('[data-scorecard-summary-reset]')
    };

    if (!summaryByGroup.has(group)) {
      summaryByGroup.set(group, []);
    }
    summaryByGroup.get(group).push(record);
    ensureGroupState(group);
    renderSummary(group);

    if (record.resetButton) {
      record.resetButton.addEventListener('click', () => {
        const targets = cardGroups.get(group) || [];
        targets.forEach((entry) => {
          entry.reset({ focus: false });
        });
        const first = targets.find((entry) => typeof entry.focus === 'function');
        if (first) {
          first.focus();
        }
      });
    }
  });

  doc.addEventListener('scorecard:update', (event) => {
    const detail = event.detail;
    if (!detail || !detail.key) return;
    const group = detail.group || 'default';
    ensureGroupState(group).set(detail.key, detail);
    renderSummary(group);
  });

  const storage = (() => {
    try {
      const probe = '__scorecard_probe__';
      localStorage.setItem(probe, '1');
      localStorage.removeItem(probe);
      return {
        get: (key) => {
          try {
            const value = localStorage.getItem(key);
            if (!value) return [];
            const parsed = JSON.parse(value);
            return Array.isArray(parsed) ? parsed : [];
          } catch (_) {
            return [];
          }
        },
        set: (key, value) => {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch (_) {
            /* ignore */
          }
        },
        remove: (key) => {
          try {
            localStorage.removeItem(key);
          } catch (_) {
            /* ignore */
          }
        }
      };
    } catch (_) {
      return {
        get: () => [],
        set: () => {},
        remove: () => {}
      };
    }
  })();

  cards.forEach((card, index) => {
    const key = card.getAttribute('data-scorecard');
    if (!key) return;

    if (!card.dataset.scorecardIndex) {
      card.dataset.scorecardIndex = String(index);
    }

    const group = card.getAttribute('data-scorecard-group') || 'default';
    ensureGroupState(group);
    if (!cardGroups.has(group)) {
      cardGroups.set(group, []);
    }

    const checkboxes = Array.from(card.querySelectorAll('input[data-scorecard-control]'));
    if (!checkboxes.length) return;

    const progress = card.querySelector('[data-scorecard-progress]');
    const reset = card.querySelector('[data-scorecard-reset]');
    const filter = card.querySelector('[data-scorecard-filter]');
    const copy = card.querySelector('[data-scorecard-copy]');
    const empty = card.querySelector('[data-scorecard-empty]');
    const caption = card.querySelector('caption');
    const total = checkboxes.length;
    const storageKey = `scorecard:${key}`;

    const validIds = new Set(checkboxes.map((checkbox) => checkbox.dataset.scorecardItem).filter(Boolean));
    let completed = new Set(storage.get(storageKey).filter((id) => validIds.has(id)));

    const rows = checkboxes
      .map((checkbox) => checkbox.closest('tr[data-scorecard-item]'))
      .filter(Boolean);
    const rowById = new Map();
    rows.forEach((row) => {
      const id = row.dataset.scorecardItem;
      if (id) {
        rowById.set(id, row);
      }
    });

    const filterLabels = filter
      ? {
          incomplete: filter.dataset.labelIncomplete || filter.textContent || 'Show incomplete only',
          all: filter.dataset.labelAll || 'Show all items'
        }
      : null;

    const copyLabels = copy
      ? {
          default: copy.dataset.labelDefault || copy.textContent.trim() || 'Copy progress',
          success: copy.dataset.labelSuccess || 'Progress copied!',
          error: copy.dataset.labelError || 'Copy failed'
        }
      : null;

    if (!card.dataset.scorecardFilter) {
      card.dataset.scorecardFilter = 'all';
    }

    const syncControls = () => {
      checkboxes.forEach((checkbox) => {
        const id = checkbox.dataset.scorecardItem;
        if (!id) return;
        checkbox.checked = completed.has(id);
      });
    };

    const updateRowStates = () => {
      rowById.forEach((row, id) => {
        const isComplete = completed.has(id);
        row.dataset.scorecardState = isComplete ? 'complete' : 'pending';
        row.classList.toggle('scorecard-row-first', false);
      });
    };

    const syncFilterLabel = () => {
      if (!filter || !filterLabels) return;
      const isIncomplete = card.dataset.scorecardFilter === 'incomplete';
      filter.setAttribute('aria-pressed', isIncomplete ? 'true' : 'false');
      filter.textContent = isIncomplete ? filterLabels.all : filterLabels.incomplete;
    };

    const applyVisibility = () => {
      const mode = card.dataset.scorecardFilter === 'incomplete' ? 'incomplete' : 'all';
      let firstVisible = true;
      rowById.forEach((row) => {
        const hidden = mode === 'incomplete' && row.dataset.scorecardState === 'complete';
        row.toggleAttribute('hidden', hidden);
        if (hidden) {
          row.classList.remove('scorecard-row-first');
        } else {
          row.classList.toggle('scorecard-row-first', firstVisible);
          firstVisible = false;
        }
      });
      if (empty) {
        const showEmpty = mode === 'incomplete' && completed.size === total && total > 0;
        empty.hidden = !showEmpty;
      }
    };

    const focusFirstCheckbox = () => {
      const firstCheckbox = checkboxes.find((checkbox) => checkbox.offsetParent !== null) || checkboxes[0];
      firstCheckbox?.focus({ preventScroll: true });
    };

    const notifyUpdate = () => {
      const section = card.closest('section');
      const sectionId = section?.id || null;
      const captionText = caption ? caption.textContent.trim() : '';
      const sectionTitle = section?.querySelector('h2, h3')?.textContent?.trim() || '';
      const datasetLabel = (card.dataset.scorecardSummaryLabel || '').trim();
      const summaryLabel = datasetLabel || captionText || sectionTitle || key;
      const order = toOrder(card.dataset.scorecardIndex, index);

      doc.dispatchEvent(
        new CustomEvent('scorecard:update', {
          detail: {
            key,
            group,
            total,
            completed: completed.size,
            sectionId,
            title: captionText || sectionTitle,
            summaryLabel,
            order
          }
        })
      );
    };

    const copyReport = () => {
      if (!copy || !copyLabels) return '';
      const normalize = (value) => (value ? value.replace(/\s+/g, ' ').trim() : '');
      const captionText = caption ? caption.textContent.trim() : '';
      const summary = progress ? normalize(progress.textContent) : '';
      const ready = [];
      const pending = [];
      rowById.forEach((row, id) => {
        const title = normalize(row.querySelector('.scorecard-label span')?.textContent || id);
        const cells = row.querySelectorAll('td');
        const readyText = normalize(cells[0]?.textContent || '');
        const actionText = normalize(cells[1]?.textContent || '');
        const entry = { title, readyText, actionText };
        if (completed.has(id)) {
          ready.push(entry);
        } else {
          pending.push(entry);
        }
      });
      const lines = [];
      if (captionText) lines.push(captionText);
      if (summary) lines.push(summary);
      if (ready.length) {
        if (lines.length) lines.push('');
        lines.push('Ready:');
        ready.forEach((item) => {
          const detail = item.readyText || item.actionText;
          lines.push(`- ${item.title}${detail ? ` — ${detail}` : ''}`);
        });
      }
      if (pending.length) {
        if (lines.length) lines.push('');
        lines.push('Still in progress:');
        pending.forEach((item) => {
          const detail = item.actionText || item.readyText;
          lines.push(`- ${item.title}${detail ? ` — ${detail}` : ''}`);
        });
      }
      if (!ready.length && !pending.length) {
        if (lines.length) lines.push('');
        lines.push('No checklist items defined.');
      }
      return lines.join('\n');
    };

    const updateCopyState = (state) => {
      if (!copy || !copyLabels) return;
      const label = copyLabels[state] || copyLabels.default;
      copy.dataset.state = state;
      copy.textContent = label;
    };

    const copyToClipboard = async (value) => {
      if (!value) return false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(value);
          return true;
        }
        const textarea = doc.createElement('textarea');
        textarea.value = value;
        textarea.setAttribute('readonly', '');
        textarea.style.position = 'absolute';
        textarea.style.left = '-9999px';
        doc.body.appendChild(textarea);
        const selection = doc.getSelection();
        const range = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
        textarea.select();
        const success = doc.execCommand ? doc.execCommand('copy') : false;
        doc.body.removeChild(textarea);
        if (range) {
          selection.removeAllRanges();
          selection.addRange(range);
        }
        return success;
      } catch (_) {
        return false;
      }
    };

    const updateProgress = () => {
      syncControls();
      if (progress) {
        const done = Math.min(completed.size, total);
        const percent = total ? Math.round((done / total) * 100) : 0;
        progress.textContent = `${done} of ${total} ready (${percent}%)`;
      }
      card.dataset.scorecardComplete = completed.size === total ? '1' : '0';
      updateRowStates();
      applyVisibility();
      syncFilterLabel();
      notifyUpdate();
    };

    const performReset = ({ focus = true } = {}) => {
      const hadProgress = completed.size > 0;
      if (!hadProgress) {
        if (focus) {
          focusFirstCheckbox();
        }
        return false;
      }
      completed = new Set();
      storage.remove(storageKey);
      updateProgress();
      if (focus) {
        focusFirstCheckbox();
      }
      return true;
    };

    const persist = () => {
      storage.set(storageKey, Array.from(completed));
    };

    checkboxes.forEach((checkbox) => {
      const id = checkbox.dataset.scorecardItem;
      if (!id) return;
      checkbox.addEventListener('change', () => {
        if (checkbox.checked) {
          completed.add(id);
        } else {
          completed.delete(id);
        }
        persist();
        updateProgress();
      });
    });

    if (reset) {
      reset.addEventListener('click', () => {
        performReset({ focus: true });
      });
    }

    card.addEventListener('scorecard:reset', (event) => {
      const focus = event?.detail?.focus ?? false;
      performReset({ focus });
    });

    if (filter) {
      filter.addEventListener('click', () => {
        const next = card.dataset.scorecardFilter === 'incomplete' ? 'all' : 'incomplete';
        card.dataset.scorecardFilter = next;
        syncFilterLabel();
        applyVisibility();
        if (next === 'incomplete') {
          const firstPending = checkboxes.find((checkbox) => !completed.has(checkbox.dataset.scorecardItem));
          firstPending?.focus({ preventScroll: true });
        }
      });
      syncFilterLabel();
    }

    if (copy) {
      updateCopyState('default');
      copy.addEventListener('click', async () => {
        if (copy.disabled) return;
        const report = copyReport();
        copy.disabled = true;
        const success = await copyToClipboard(report);
        updateCopyState(success ? 'success' : 'error');
        setTimeout(() => {
          copy.disabled = false;
          updateCopyState('default');
        }, 1600);
      });
    }

    const groupEntries = cardGroups.get(group);
    groupEntries.push({
      reset: (options = {}) => performReset(options),
      focus: () => focusFirstCheckbox()
    });

    updateProgress();
  });
});
