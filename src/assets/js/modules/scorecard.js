/**
 * Scorecard Module
 * Comprehensive readiness checklist system with local persistence,
 * remote sync via CDCProgress, summary rendering, and journey progress tracking.
 *
 * @module scorecard
 * @exports {function} initScorecards - Initialize the scorecard system
 */

const doc = document;

/**
 * Parse a numeric order value with a fallback.
 * @param {*} value - Value to parse
 * @param {number} [fallback=0] - Default if not a finite number
 * @returns {number}
 */
const toOrder = (value, fallback = 0) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

/**
 * Parse a count value as an integer.
 * @param {*} value - Value to parse
 * @returns {number}
 */
const toCount = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
};

/**
 * Create a localStorage wrapper with graceful fallback.
 * @returns {{ get(key: string): string[], set(key: string, value: string[]): void, remove(key: string): void }}
 */
const createStorage = () => {
  try {
    const probe = "__scorecard_probe__";
    localStorage.setItem(probe, "1");
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
      },
    };
  } catch (_) {
    return {
      get: () => [],
      set: () => {},
      remove: () => {},
    };
  }
};

/**
 * Parse a progress state value (string or object) into a state object.
 * @param {*} value - State value (JSON string or object)
 * @returns {object|null}
 */
const parseProgressState = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch (_) {
      return null;
    }
  }
  if (typeof value === "object") {
    return value;
  }
  return null;
};

/**
 * Initialize the full scorecard system: card tracking, summary rendering,
 * local persistence, remote sync, and journey progress dispatch.
 *
 * @param {object} tracer - OpenTelemetry education tracer instance
 */
const initScorecards = (tracer) => {
  const cards = Array.from(doc.querySelectorAll("[data-scorecard]"));
  if (!cards.length) return;

  const summaries = Array.from(
    doc.querySelectorAll("[data-scorecard-summary]"),
  );
  const summaryByGroup = new Map();
  const groupState = new Map();
  const cardGroups = new Map();
  const cardControllers = new Map();

  const journeySlug =
    window.CDC_JOURNEY_SLUG || (doc.body?.dataset?.journeySlug ?? "") || "";

  const progressEntries = new Map();
  const pendingProgressUpdates = [];
  const storage = createStorage();

  // --- Journey progress dispatch ---

  const flushPendingProgress = () => {
    const progress = window.CDCProgress;
    if (!progress?.onStepChange) {
      return;
    }
    while (pendingProgressUpdates.length) {
      const next = pendingProgressUpdates.shift();
      if (!next) continue;
      const send = () => progress.onStepChange(next);
      if (progress.ready && typeof progress.ready.then === "function") {
        progress.ready.then(send).catch(() => {
          /* ignore */
        });
      } else {
        send();
      }
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("cdc-progress-ready", flushPendingProgress);
    window.addEventListener("load", flushPendingProgress, { once: true });
  }

  const dispatchJourneyProgress = (payload) => {
    if (!journeySlug) return;
    const normalized = { journeySlug, ...payload };
    const progress = window.CDCProgress;
    if (progress?.onStepChange) {
      const send = () => progress.onStepChange(normalized);
      if (progress.ready && typeof progress.ready.then === "function") {
        progress.ready.then(send).catch(() => {
          /* ignore */
        });
      } else {
        send();
      }
    } else {
      pendingProgressUpdates.push(normalized);
    }
    flushPendingProgress();
  };

  const updateJourneyProgress = () => {
    if (!journeySlug || !progressEntries.size) return;

    let total = 0;
    let completed = 0;
    let latest = null;
    const checklists = {};

    progressEntries.forEach((entry, entryKey) => {
      const entryTotal = toCount(entry.total);
      const entryCompleted = Math.min(toCount(entry.completed), entryTotal);
      total += entryTotal;
      completed += entryCompleted;
      if (!latest || (entry.updatedAt ?? 0) > (latest.updatedAt ?? 0)) {
        latest = entry;
      }

      const completedIds = Array.isArray(entry.completedIds)
        ? entry.completedIds.filter((id) => typeof id === "string")
        : [];

      checklists[entryKey] = {
        completed: completedIds,
        total: entryTotal,
        sectionId: entry.sectionId || null,
        updatedAt: entry.updatedAt ?? Date.now(),
      };
    });

    const percent =
      total > 0
        ? Math.min(100, Math.max(0, Math.round((completed / total) * 100)))
        : 0;
    const payload = {
      step: completed,
      percent,
    };

    const state = { checklists };
    if (latest?.sectionId) {
      state.hash = `#${latest.sectionId}`;
      if (typeof window !== "undefined") {
        state.scrollY = Math.max(0, window.scrollY ?? window.pageYOffset ?? 0);
      }
    }

    payload.state = state;

    try {
      tracer.trackProgress(journeySlug, completed, percent);
    } catch (error) {
      console.debug("Progress tracking failed:", error);
    }

    dispatchJourneyProgress(payload);
  };

  // --- Group state and summary rendering ---

  const ensureGroupState = (group) => {
    const key = group || "default";
    if (!groupState.has(key)) {
      groupState.set(key, new Map());
    }
    return groupState.get(key);
  };

  const renderSummary = (group) => {
    const resolvedGroup = group || "default";
    const records = summaryByGroup.get(resolvedGroup);
    if (!records || !records.length) return;

    const state = ensureGroupState(resolvedGroup);
    const entries = Array.from(state.values()).sort(
      (a, b) => toOrder(a.order, 0) - toOrder(b.order, 0),
    );

    let totalChecks = 0;
    let completedChecks = 0;

    entries.forEach((entry) => {
      const entryTotal = toCount(entry.total);
      const entryCompleted = Math.min(toCount(entry.completed), entryTotal);
      totalChecks += entryTotal;
      completedChecks += entryCompleted;
    });

    const percentComplete = totalChecks
      ? Math.round((completedChecks / totalChecks) * 100)
      : 0;
    const summaryState =
      totalChecks > 0 && completedChecks >= totalChecks
        ? "complete"
        : "progress";

    records.forEach((record) => {
      if (record.element) {
        record.element.dataset.scorecardSummaryState = summaryState;
        record.element.dataset.scorecardSummaryTotal = String(totalChecks);
        record.element.dataset.scorecardSummaryCompleted =
          String(completedChecks);
        record.element.dataset.scorecardSummaryPercent =
          String(percentComplete);
      }

      if (record.progress) {
        record.progress.textContent = `${completedChecks} of ${totalChecks} readiness checks complete (${percentComplete}%)`;
      }

      if (record.meter) {
        record.meter.setAttribute("aria-valuenow", String(percentComplete));
        record.meter.setAttribute(
          "aria-valuetext",
          `${percentComplete}% complete`,
        );
        record.meter.setAttribute("aria-valuemax", "100");
      }

      if (record.meterFill) {
        record.meterFill.style.width = `${percentComplete}%`;
      }

      if (record.list) {
        record.list.innerHTML = "";
        entries.forEach((entry) => {
          const itemTotal = toCount(entry.total);
          const itemCompleted = Math.min(toCount(entry.completed), itemTotal);
          const isComplete = itemTotal > 0 && itemCompleted >= itemTotal;
          const statusText = isComplete
            ? "Complete"
            : itemTotal
              ? `${itemCompleted} of ${itemTotal} ready`
              : "No checks defined";
          const labelText =
            (entry.summaryLabel || entry.title || entry.key || "").trim() ||
            "Readiness scorecard";

          const item = doc.createElement("li");
          item.className = "scorecard-summary-item";
          item.dataset.scorecardSummaryItem = entry.key;
          item.dataset.state = isComplete ? "complete" : "pending";
          item.dataset.order = String(toOrder(entry.order, 0));

          const label = doc.createElement("div");
          label.className = "scorecard-summary-item-label";

          const nameNode = doc.createElement(entry.sectionId ? "a" : "span");
          nameNode.className = "scorecard-summary-item-name";
          nameNode.textContent = labelText;
          if (entry.sectionId) {
            nameNode.setAttribute("href", `#${entry.sectionId}`);
          }
          label.appendChild(nameNode);

          const status = doc.createElement("span");
          status.className = "scorecard-summary-item-status";
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
      const section = record.element?.closest("section");
      if (section && section.id) {
        sections.add(section);
      }
    });

    sections.forEach((section) => {
      const heading = section.querySelector("h2, h3");
      const headingText = heading?.textContent?.trim() || "";
      doc.dispatchEvent(
        new CustomEvent("scorecard:summary", {
          detail: {
            group: resolvedGroup,
            sectionId: section.id,
            title: headingText,
            total: totalChecks,
            completed: completedChecks,
            percent: percentComplete,
          },
        }),
      );
    });
  };

  // --- Initialize summaries ---

  summaries.forEach((summaryElement) => {
    const group =
      summaryElement.getAttribute("data-scorecard-summary") || "default";
    const record = {
      element: summaryElement,
      progress: summaryElement.querySelector(
        "[data-scorecard-summary-progress]",
      ),
      meter: summaryElement.querySelector("[data-scorecard-summary-meter]"),
      meterFill: summaryElement.querySelector(
        "[data-scorecard-summary-meter-fill]",
      ),
      list: summaryElement.querySelector("[data-scorecard-summary-list]"),
      empty: summaryElement.querySelector("[data-scorecard-summary-empty]"),
      resetButton: summaryElement.querySelector(
        "[data-scorecard-summary-reset]",
      ),
    };

    if (!summaryByGroup.has(group)) {
      summaryByGroup.set(group, []);
    }
    summaryByGroup.get(group).push(record);
    ensureGroupState(group);
    renderSummary(group);

    if (record.resetButton) {
      record.resetButton.addEventListener("click", () => {
        const targets = cardGroups.get(group) || [];
        targets.forEach((entry) => {
          entry.reset({ focus: false });
        });
        const first = targets.find(
          (entry) => typeof entry.focus === "function",
        );
        if (first) {
          first.focus();
        }
      });
    }
  });

  doc.addEventListener("scorecard:update", (event) => {
    const detail = event.detail;
    if (!detail || !detail.key) return;
    const group = detail.group || "default";
    ensureGroupState(group).set(detail.key, detail);
    renderSummary(group);
  });

  // --- Initialize individual cards ---

  cards.forEach((card, index) => {
    const key = card.getAttribute("data-scorecard");
    if (!key) return;

    if (!card.dataset.scorecardIndex) {
      card.dataset.scorecardIndex = String(index);
    }

    const group = card.getAttribute("data-scorecard-group") || "default";
    ensureGroupState(group);
    if (!cardGroups.has(group)) {
      cardGroups.set(group, []);
    }

    const checkboxes = Array.from(
      card.querySelectorAll("input[data-scorecard-control]"),
    );
    if (!checkboxes.length) return;

    const progress = card.querySelector("[data-scorecard-progress]");
    const reset = card.querySelector("[data-scorecard-reset]");
    const filter = card.querySelector("[data-scorecard-filter]");
    const copy = card.querySelector("[data-scorecard-copy]");
    const empty = card.querySelector("[data-scorecard-empty]");
    const caption = card.querySelector("caption");
    const total = checkboxes.length;
    const storageKey = `scorecard:${key}`;

    const validIds = new Set(
      checkboxes
        .map((checkbox) => checkbox.dataset.scorecardItem)
        .filter(Boolean),
    );
    let completed = new Set(
      storage.get(storageKey).filter((id) => validIds.has(id)),
    );

    const rows = checkboxes
      .map((checkbox) => checkbox.closest("tr[data-scorecard-item]"))
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
          incomplete:
            filter.dataset.labelIncomplete ||
            filter.textContent ||
            "Show incomplete only",
          all: filter.dataset.labelAll || "Show all items",
        }
      : null;

    const copyLabels = copy
      ? {
          default:
            copy.dataset.labelDefault ||
            copy.textContent.trim() ||
            "Copy progress",
          success: copy.dataset.labelSuccess || "Progress copied!",
          error: copy.dataset.labelError || "Copy failed",
        }
      : null;

    if (!card.dataset.scorecardFilter) {
      card.dataset.scorecardFilter = "all";
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
        row.dataset.scorecardState = isComplete ? "complete" : "pending";
        row.classList.toggle("scorecard-row-first", false);
      });
    };

    const syncFilterLabel = () => {
      if (!filter || !filterLabels) return;
      const isIncomplete = card.dataset.scorecardFilter === "incomplete";
      filter.setAttribute("aria-pressed", isIncomplete ? "true" : "false");
      filter.textContent = isIncomplete
        ? filterLabels.all
        : filterLabels.incomplete;
    };

    const applyVisibility = () => {
      const mode =
        card.dataset.scorecardFilter === "incomplete" ? "incomplete" : "all";
      let firstVisible = true;
      rowById.forEach((row) => {
        const hidden =
          mode === "incomplete" && row.dataset.scorecardState === "complete";
        row.toggleAttribute("hidden", hidden);
        if (hidden) {
          row.classList.remove("scorecard-row-first");
        } else {
          row.classList.toggle("scorecard-row-first", firstVisible);
          firstVisible = false;
        }
      });
      if (empty) {
        const showEmpty =
          mode === "incomplete" && completed.size === total && total > 0;
        empty.hidden = !showEmpty;
      }
    };

    const focusFirstCheckbox = () => {
      const firstCheckbox =
        checkboxes.find((checkbox) => checkbox.offsetParent !== null) ||
        checkboxes[0];
      firstCheckbox?.focus({ preventScroll: true });
    };

    const notifyUpdate = () => {
      const section = card.closest("section");
      const sectionId = section?.id || null;
      const captionText = caption ? caption.textContent.trim() : "";
      const sectionTitle =
        section?.querySelector("h2, h3")?.textContent?.trim() || "";
      const datasetLabel = (card.dataset.scorecardSummaryLabel || "").trim();
      const summaryLabel = datasetLabel || captionText || sectionTitle || key;
      const order = toOrder(card.dataset.scorecardIndex, index);

      doc.dispatchEvent(
        new CustomEvent("scorecard:update", {
          detail: {
            key,
            group,
            total,
            completed: completed.size,
            sectionId,
            title: captionText || sectionTitle,
            summaryLabel,
            order,
          },
        }),
      );

      const completedIds = Array.from(completed)
        .map((id) => (typeof id === "string" ? id : String(id)))
        .filter((id) => validIds.has(id));
      completedIds.sort();

      progressEntries.set(key, {
        total,
        completed: completed.size,
        completedIds,
        sectionId,
        updatedAt: Date.now(),
      });
      updateJourneyProgress();
    };

    const copyReport = () => {
      if (!copy || !copyLabels) return "";
      const normalize = (value) =>
        value ? value.replace(/\s+/g, " ").trim() : "";
      const captionText = caption ? caption.textContent.trim() : "";
      const summary = progress ? normalize(progress.textContent) : "";
      const ready = [];
      const pending = [];
      rowById.forEach((row, id) => {
        const title = normalize(
          row.querySelector(".scorecard-label span")?.textContent || id,
        );
        const cells = row.querySelectorAll("td");
        const readyText = normalize(cells[0]?.textContent || "");
        const actionText = normalize(cells[1]?.textContent || "");
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
        if (lines.length) lines.push("");
        lines.push("Ready:");
        ready.forEach((item) => {
          const detail = item.readyText || item.actionText;
          lines.push(`- ${item.title}${detail ? ` — ${detail}` : ""}`);
        });
      }
      if (pending.length) {
        if (lines.length) lines.push("");
        lines.push("Still in progress:");
        pending.forEach((item) => {
          const detail = item.actionText || item.readyText;
          lines.push(`- ${item.title}${detail ? ` — ${detail}` : ""}`);
        });
      }
      if (!ready.length && !pending.length) {
        if (lines.length) lines.push("");
        lines.push("No checklist items defined.");
      }
      return lines.join("\n");
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
        const textarea = doc.createElement("textarea");
        textarea.value = value;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "absolute";
        textarea.style.left = "-9999px";
        doc.body.appendChild(textarea);
        const selection = doc.getSelection();
        const range =
          selection && selection.rangeCount > 0
            ? selection.getRangeAt(0)
            : null;
        textarea.select();
        const success = doc.execCommand ? doc.execCommand("copy") : false;
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
      card.dataset.scorecardComplete = completed.size === total ? "1" : "0";
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
      const values = Array.from(completed).map((id) =>
        typeof id === "string" ? id : String(id),
      );
      values.sort();
      storage.set(storageKey, values);
    };

    const applyChecklist = (ids = []) => {
      if (!Array.isArray(ids)) return false;
      const normalized = ids
        .map((id) => (typeof id === "string" ? id : String(id)))
        .filter((id) => validIds.has(id));
      const next = new Set(normalized);

      if (next.size === completed.size) {
        let identical = true;
        next.forEach((id) => {
          if (!completed.has(id)) {
            identical = false;
          }
        });
        if (identical) {
          return false;
        }
      }

      completed = next;
      persist();
      updateProgress();
      return true;
    };

    checkboxes.forEach((checkbox) => {
      const id = checkbox.dataset.scorecardItem;
      if (!id) return;
      checkbox.addEventListener("change", () => {
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
      reset.addEventListener("click", () => {
        performReset({ focus: true });
      });
    }

    card.addEventListener("scorecard:reset", (event) => {
      const focus = event?.detail?.focus ?? false;
      performReset({ focus });
    });

    if (filter) {
      filter.addEventListener("click", () => {
        const next =
          card.dataset.scorecardFilter === "incomplete" ? "all" : "incomplete";
        card.dataset.scorecardFilter = next;
        syncFilterLabel();
        applyVisibility();
        if (next === "incomplete") {
          const firstPending = checkboxes.find(
            (checkbox) => !completed.has(checkbox.dataset.scorecardItem),
          );
          firstPending?.focus({ preventScroll: true });
        }
      });
      syncFilterLabel();
    }

    if (copy) {
      updateCopyState("default");
      copy.addEventListener("click", async () => {
        if (copy.disabled) return;
        const report = copyReport();
        copy.disabled = true;
        const success = await copyToClipboard(report);
        updateCopyState(success ? "success" : "error");
        setTimeout(() => {
          copy.disabled = false;
          updateCopyState("default");
        }, 1600);
      });
    }

    const groupEntries = cardGroups.get(group);
    groupEntries.push({
      reset: (options = {}) => performReset(options),
      focus: () => focusFirstCheckbox(),
    });

    cardControllers.set(key, {
      applyChecklist,
    });

    updateProgress();
  });

  // --- Remote progress sync ---

  const applyRemoteProgress = (entry) => {
    if (!entry) return;
    const state = parseProgressState(entry.state);
    if (
      !state ||
      typeof state.checklists !== "object" ||
      state.checklists === null
    ) {
      return;
    }

    Object.entries(state.checklists).forEach(([cardKey, descriptor]) => {
      const controller = cardControllers.get(cardKey);
      if (!controller || typeof controller.applyChecklist !== "function") {
        return;
      }
      let completedIds = [];
      if (Array.isArray(descriptor?.completed)) {
        completedIds = descriptor.completed;
      } else if (Array.isArray(descriptor)) {
        completedIds = descriptor;
      }
      controller.applyChecklist(completedIds);
    });
  };

  const syncRemoteProgress = () => {
    if (!journeySlug) return;
    const progress = window.CDCProgress;
    if (!progress || typeof progress.getProgress !== "function") {
      return;
    }

    const apply = () => {
      const entry = progress.getProgress(journeySlug);
      if (entry) {
        applyRemoteProgress(entry);
      }
    };

    if (progress.ready && typeof progress.ready.then === "function") {
      progress.ready.then(apply).catch(() => {
        /* ignore */
      });
    } else {
      apply();
    }
  };

  if (typeof window !== "undefined") {
    window.addEventListener("cdc-progress-ready", () => {
      syncRemoteProgress();
    });

    window.addEventListener("cdc-progress-change", (event) => {
      const detail = event?.detail;
      if (!detail || detail.journeySlug !== journeySlug) {
        return;
      }
      applyRemoteProgress(detail.entry || null);
    });
  }

  syncRemoteProgress();
};

export { initScorecards };
