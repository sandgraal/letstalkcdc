/**
 * Quick Navigation Module
 * Provides in-page quick nav with IntersectionObserver-based active state
 * tracking and progress badge display from scorecard events.
 *
 * @module quick-nav
 * @exports {function} initQuickNav - Initialize quick navigation components
 */

const doc = document;

/**
 * Initialize quick navigation components.
 * Sets up IntersectionObserver to highlight active sections, listens for
 * scorecard:update and scorecard:summary events to display progress badges,
 * and handles hash-based navigation.
 */
const initQuickNav = () => {
  const quickNavs = doc.querySelectorAll(".intro-quick-nav");
  if (!quickNavs.length) return;

  const hasObserver = typeof window.IntersectionObserver === "function";

  const getHashId = () => {
    const raw = window.location.hash.replace(/^#/, "");
    if (!raw) return "";
    try {
      return decodeURIComponent(raw);
    } catch (_) {
      return raw;
    }
  };

  quickNavs.forEach((nav) => {
    const links = Array.from(nav.querySelectorAll("a[href]"));
    if (!links.length) return;

    const decodeId = (value) => {
      if (!value) return "";
      try {
        return decodeURIComponent(value);
      } catch (_) {
        return value;
      }
    };

    const targets = links
      .map((link) => {
        const href = link.getAttribute("href");
        if (!href || !href.startsWith("#")) return null;
        const id = decodeId(href.slice(1));
        if (!id) return null;
        const section = doc.getElementById(id);
        if (!section) return null;
        section.dataset.quickNavVisible = "0";
        return { link, id, section };
      })
      .filter(Boolean);

    if (!targets.length) return;

    const targetMap = new Map();
    targets.forEach((target) => {
      targetMap.set(target.id, target);
    });

    const ensureBadge = (link) => {
      let badge = link.querySelector(".quick-nav-badge");
      if (!badge) {
        badge = doc.createElement("span");
        badge.className = "quick-nav-badge";
        badge.setAttribute("aria-hidden", "true");
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
        target.link.dataset.quickNavComplete = "0";
        return;
      }
      const badge = ensureBadge(target.link);
      target.badge = badge;
      if (detail.completed >= detail.total) {
        badge.textContent = "✓";
        badge.dataset.state = "complete";
        target.link.dataset.quickNavComplete = "1";
      } else {
        badge.textContent = `${detail.completed}/${detail.total}`;
        badge.dataset.state = "progress";
        target.link.dataset.quickNavComplete = "0";
      }
    };

    doc.addEventListener("scorecard:update", (event) => {
      applyProgressDetail(event.detail || {});
    });

    doc.addEventListener("scorecard:summary", (event) => {
      applyProgressDetail(event.detail || {});
    });

    const applyActive = (targetId) => {
      let matched = false;
      targets.forEach(({ link, id }) => {
        const isActive = Boolean(targetId) && id === targetId;
        if (isActive) matched = true;
        if (isActive) {
          link.setAttribute("aria-current", "true");
          link.classList.add("is-active");
        } else {
          link.removeAttribute("aria-current");
          link.classList.remove("is-active");
        }
      });
      return matched;
    };

    const ensureActive = (id) => {
      if (id && applyActive(id)) return;
      applyActive(targets[0].id);
    };

    nav.addEventListener("click", (event) => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      const href = link.getAttribute("href");
      const id = decodeId(href ? href.slice(1) : "");
      ensureActive(id);
    });

    window.addEventListener("hashchange", () => {
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
          entry.target.dataset.quickNavVisible = entry.isIntersecting
            ? "1"
            : "0";
        });
        const visible = targets
          .filter(({ section }) => section.dataset.quickNavVisible === "1")
          .sort((a, b) => a.section.offsetTop - b.section.offsetTop);
        const candidate = visible.length ? visible[visible.length - 1] : null;
        const nextId = candidate?.id;
        if (nextId && nextId !== currentId) {
          currentId = nextId;
          applyActive(nextId);
        } else if (!nextId) {
          const fallback = targets.find(({ section }) => {
            const rect = section.getBoundingClientRect();
            return rect.top >= 0 && rect.top < window.innerHeight * 0.6;
          })?.id;
          if (fallback && fallback !== currentId) {
            currentId = fallback;
            applyActive(fallback);
          }
        }
      },
      {
        rootMargin: "-45% 0px -45% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      },
    );

    targets.forEach(({ section }) => observer.observe(section));
  });
};

export { initQuickNav };
