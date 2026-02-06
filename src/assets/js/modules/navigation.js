/**
 * Navigation Module
 * Handles mobile navigation menu, dropdown navigation, and legacy nav panel.
 *
 * @module navigation
 * @exports {function} initNavigation - Initialize all navigation components
 * @exports {function} initMobileNav - Initialize mobile menu only
 * @exports {function} initDropdowns - Initialize dropdown menus only
 */

const doc = document;

/** Mobile navigation breakpoint in pixels */
const MOBILE_NAV_BREAKPOINT = 639;

/**
 * Initialize mobile navigation menu toggle, overlay close, and resize handling.
 */
const initMobileNav = () => {
  const mobileMenuToggle = doc.querySelector("[data-mobile-menu-toggle]");
  const mobileNav = doc.querySelector("[data-mobile-nav]");

  if (!mobileMenuToggle || !mobileNav) return;

  const closeNav = () => {
    mobileNav.removeAttribute("data-mobile-nav-open");
    mobileMenuToggle.setAttribute("aria-expanded", "false");
    doc.body.removeAttribute("data-mobile-nav-open");
  };

  mobileMenuToggle.addEventListener("click", () => {
    const isOpen = mobileNav.hasAttribute("data-mobile-nav-open");

    if (isOpen) {
      closeNav();
    } else {
      mobileNav.setAttribute("data-mobile-nav-open", "");
      mobileMenuToggle.setAttribute("aria-expanded", "true");
      doc.body.setAttribute("data-mobile-nav-open", "");

      const firstLink = mobileNav.querySelector("a[href]");
      if (firstLink) {
        setTimeout(() => firstLink.focus(), 50);
      }
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      mobileNav.hasAttribute("data-mobile-nav-open")
    ) {
      closeNav();
      mobileMenuToggle.focus();
    }
  });

  doc.body.addEventListener("click", (event) => {
    if (
      mobileNav.hasAttribute("data-mobile-nav-open") &&
      !mobileNav.contains(event.target) &&
      !mobileMenuToggle.contains(event.target)
    ) {
      closeNav();
    }
  });

  mobileNav.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) {
      closeNav();
    }
  });

  window.addEventListener("resize", () => {
    if (
      window.matchMedia(`(min-width: ${MOBILE_NAV_BREAKPOINT + 1}px)`).matches
    ) {
      closeNav();
    }
  });
};

/**
 * Initialize dropdown navigation menus with positioning, keyboard handling,
 * and click-outside-to-close behavior.
 */
const initDropdowns = () => {
  const dropdownToggles = Array.from(
    doc.querySelectorAll(".nav-dropdown-toggle"),
  );

  const isMobileNavView = () =>
    window.matchMedia &&
    window.matchMedia(`(max-width: ${MOBILE_NAV_BREAKPOINT}px)`).matches;

  const resetDropdownPosition = (dropdown, menu) => {
    dropdown?.removeAttribute("data-dropdown-align");
    dropdown?.removeAttribute("data-dropdown-placement");
    menu?.style.removeProperty("--dropdown-max-height");
    menu?.style.removeProperty("--dropdown-min-width");
  };

  const applyDropdownPosition = (toggle, menu, dropdown) => {
    if (!dropdown || !menu || isMobileNavView()) {
      resetDropdownPosition(dropdown, menu);
      return;
    }

    const rect = toggle.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gutter = 16;

    // Temporarily clear min-width to get accurate natural dimensions
    menu.style.removeProperty("--dropdown-min-width");
    void menu.offsetHeight;

    const menuWidth = Math.max(menu.scrollWidth, rect.width, 200);
    const spaceToRight = viewportWidth - rect.left - gutter;
    const spaceToLeft = rect.right - gutter;
    const alignEnd = spaceToRight < menuWidth && spaceToLeft > spaceToRight;

    if (alignEnd) {
      dropdown.setAttribute("data-dropdown-align", "end");
    } else {
      dropdown.removeAttribute("data-dropdown-align");
    }

    const menuHeight = menu.scrollHeight;
    const spaceBelow = viewportHeight - rect.bottom - gutter;
    const spaceAbove = rect.top - gutter;
    const placeTop = spaceBelow < menuHeight && spaceAbove > spaceBelow;

    if (placeTop) {
      dropdown.setAttribute("data-dropdown-placement", "top");
    } else {
      dropdown.removeAttribute("data-dropdown-placement");
    }

    const availableVertical = placeTop ? spaceAbove : spaceBelow;
    let maxHeight;
    if (menuHeight > availableVertical) {
      maxHeight = Math.max(availableVertical, 160, 0);
    } else {
      maxHeight = menuHeight;
    }

    menu.style.setProperty(
      "--dropdown-max-height",
      `${Math.round(maxHeight)}px`,
    );
    menu.style.setProperty(
      "--dropdown-min-width",
      `${Math.round(menuWidth)}px`,
    );
  };

  const repositionOpenDropdowns = () => {
    if (!dropdownToggles.length) return;

    dropdownToggles.forEach((toggle) => {
      if (toggle.getAttribute("aria-expanded") !== "true") return;
      const dropdown = toggle.closest(".nav-dropdown");
      const menu = dropdown?.querySelector(".nav-dropdown-menu");
      if (!dropdown || !menu) return;
      applyDropdownPosition(toggle, menu, dropdown);
    });
  };

  let repositionQueued = false;
  const queueReposition = () => {
    if (repositionQueued) return;
    repositionQueued = true;
    requestAnimationFrame(() => {
      repositionQueued = false;
      repositionOpenDropdowns();
    });
  };

  dropdownToggles.forEach((toggle) => {
    const dropdown = toggle.closest(".nav-dropdown");
    const menu = dropdown?.querySelector(".nav-dropdown-menu");

    if (!dropdown || !menu) return;

    const setExpanded = (expanded) => {
      toggle.setAttribute("aria-expanded", expanded ? "true" : "false");
      if (expanded) {
        dropdown.setAttribute("data-dropdown-open", "");
        queueReposition();
      } else {
        dropdown.removeAttribute("data-dropdown-open");
        resetDropdownPosition(dropdown, menu);
      }
    };

    toggle.addEventListener("click", (event) => {
      event.preventDefault();
      const isExpanded = toggle.getAttribute("aria-expanded") === "true";

      dropdownToggles.forEach((other) => {
        if (other === toggle) return;
        other.setAttribute("aria-expanded", "false");
        const otherDropdown = other.closest(".nav-dropdown");
        const otherMenu = otherDropdown?.querySelector(".nav-dropdown-menu");
        otherDropdown?.removeAttribute("data-dropdown-open");
        resetDropdownPosition(otherDropdown, otherMenu);
      });

      setExpanded(!isExpanded);

      if (!isExpanded) {
        const firstMenuItem = menu.querySelector("a");
        if (firstMenuItem) {
          setTimeout(() => firstMenuItem.focus(), 50);
        }
      }
    });

    toggle.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        toggle.click();
      } else if (event.key === "Escape") {
        setExpanded(false);
        toggle.focus();
      }
    });

    menu.addEventListener("keydown", (event) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      setExpanded(false);
      toggle.focus();
    });
  });

  if (dropdownToggles.length > 0) {
    window.addEventListener("resize", queueReposition, { passive: true });
    window.addEventListener("scroll", queueReposition, {
      passive: true,
      capture: true,
    });
  }

  doc.addEventListener("click", (event) => {
    if (event.target.closest(".nav-dropdown")) return;
    dropdownToggles.forEach((toggle) => {
      toggle.setAttribute("aria-expanded", "false");
      const dropdown = toggle.closest(".nav-dropdown");
      const menu = dropdown?.querySelector(".nav-dropdown-menu");
      dropdown?.removeAttribute("data-dropdown-open");
      resetDropdownPosition(dropdown, menu);
    });
  });
};

/**
 * Initialize the legacy nav panel toggle (data-nav-toggle / data-nav-panel).
 */
const initLegacyNavPanel = () => {
  const navToggle = doc.querySelector("[data-nav-toggle]");
  const navPanel = doc.querySelector("[data-nav-panel]");
  if (!navToggle || !navPanel) return;

  const closeNav = () => {
    navPanel.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
    doc.body.classList.remove("nav-open");
  };

  navToggle.addEventListener("click", () => {
    const isOpen = navPanel.classList.toggle("is-open");
    navToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    doc.body.classList.toggle("nav-open", isOpen);
    if (
      isOpen &&
      window.matchMedia &&
      window.matchMedia("(max-width: 900px)").matches
    ) {
      const firstLink = navPanel.querySelector("a[href]");
      if (firstLink) {
        firstLink.focus({ preventScroll: true });
      }
    }
  });

  doc.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && navPanel.classList.contains("is-open")) {
      closeNav();
      navToggle.focus({ preventScroll: true });
    }
  });

  navPanel.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) {
      closeNav();
    }
  });

  window.addEventListener("resize", () => {
    if (window.matchMedia && window.matchMedia("(min-width: 901px)").matches) {
      closeNav();
    }
  });
};

/**
 * Initialize all navigation components: mobile nav, dropdowns, and legacy panel.
 */
const initNavigation = () => {
  initMobileNav();
  initDropdowns();
  initLegacyNavPanel();
};

export { initNavigation, initMobileNav, initDropdowns };
