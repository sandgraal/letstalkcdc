import { renderProgressDashboard } from "./dashboard.js";

const globalScope = typeof window !== "undefined" ? window : globalThis;

const STORAGE_KEY = "cdc-progress-store";
const DASHBOARD_STORAGE_KEY = "lastProgressDocs";

const config = {
  journeySlug:
    globalScope.CDC_JOURNEY_SLUG ??
    globalScope.document?.body?.dataset?.journeySlug ??
    "",
};

const rawModules = Array.isArray(globalScope.CDC_MODULES)
  ? globalScope.CDC_MODULES
  : [];

const dashboardModules = rawModules
  .filter((module) => module && (module.key || module.id || module.slug))
  .map((module, index) => ({
    id: module.key || module.id || module.slug || `module-${index + 1}`,
    title: module.title || module.name || `Module ${index + 1}`,
    totalSteps:
      typeof module.totalSteps === "number" && module.totalSteps > 0
        ? module.totalSteps
        : 1,
  }));

const moduleTitleLookup = new Map(
  dashboardModules.map((module) => [module.id, module.title])
);

const state = {
  ready: false,
  readyResolvers: [],
  progress: new Map(),
};

let readyEventDispatched = false;

const clampPercent = (value) => {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return 0;
  if (number > 100) return 100;
  return Math.round(number);
};

const safeParseState = (value) => {
  if (!value) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return null;
  try {
    return JSON.parse(value);
  } catch (_) {
    return value;
  }
};

const normalizeEntry = (slug, entry = {}) => {
  const percent = clampPercent(entry.percent ?? entry.percentComplete ?? 0);
  const stepRaw = Number(entry.step ?? entry.completed ?? 0);
  const step = Number.isFinite(stepRaw) ? stepRaw : 0;
  const updatedAt =
    entry.updatedAt ?? entry.$updatedAt ?? entry.$createdAt ?? new Date().toISOString();
  const parsedState = safeParseState(entry.state);
  const status = percent >= 100 ? "completed" : percent > 0 ? "in-progress" : "not-started";
  return {
    journeySlug: slug,
    percent,
    step,
    updatedAt,
    state: parsedState,
    status,
  };
};

const readStoredProgress = () => {
  if (typeof globalScope.localStorage === "undefined") return {};
  try {
    const raw = globalScope.localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (_) {
    return {};
  }
};

const writeStoredProgress = () => {
  if (typeof globalScope.localStorage === "undefined") return;
  const plainObject = {};
  state.progress.forEach((value, key) => {
    plainObject[key] = {
      percent: value.percent,
      step: value.step,
      updatedAt: value.updatedAt,
      state: value.state,
    };
  });
  try {
    globalScope.localStorage.setItem(STORAGE_KEY, JSON.stringify(plainObject));
  } catch (_) {
    /* ignore storage write errors */
  }
};

const persistDashboardDocs = (docs) => {
  if (typeof globalScope.localStorage === "undefined") return;
  try {
    globalScope.localStorage.setItem(DASHBOARD_STORAGE_KEY, JSON.stringify(docs));
  } catch (_) {
    /* ignore */
  }
};

const readPersistedDashboardDocs = () => {
  if (typeof globalScope.localStorage === "undefined") return [];
  try {
    const raw = globalScope.localStorage.getItem(DASHBOARD_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
};

const ensureReadyPromise = () =>
  new Promise((resolve) => {
    if (state.ready) {
      resolve();
    } else {
      state.readyResolvers.push(resolve);
    }
  });

const resolveReady = () => {
  state.ready = true;
  state.readyResolvers.splice(0).forEach((fn) => fn());
  if (
    !readyEventDispatched &&
    typeof globalScope.dispatchEvent === "function" &&
    typeof globalScope.CustomEvent === "function"
  ) {
    readyEventDispatched = true;
    try {
      globalScope.dispatchEvent(
        new CustomEvent("cdc-progress-ready", {
          detail: { progress: globalScope.CDCProgress ?? null },
        })
      );
    } catch (_) {
      /* ignore */
    }
  }
};

const dispatchProgressChange = (slug) => {
  if (!slug) return;
  if (
    typeof globalScope.dispatchEvent !== "function" ||
    typeof globalScope.CustomEvent !== "function"
  ) {
    return;
  }

  const entry = state.progress.get(slug) ?? null;
  let detailEntry = null;
  if (entry) {
    detailEntry = { ...entry };
    if (detailEntry.state && typeof detailEntry.state !== "string") {
      try {
        detailEntry.state = JSON.stringify(detailEntry.state);
      } catch (_) {
        detailEntry.state = null;
      }
    }
  }

  try {
    globalScope.dispatchEvent(
      new CustomEvent("cdc-progress-change", {
        detail: {
          journeySlug: slug,
          entry: detailEntry,
        },
      })
    );
  } catch (_) {
    /* ignore */
  }
};

const getToolbarNodes = () => {
  const doc = globalScope.document;
  if (!doc) {
    return {
      percent: [],
      status: [],
      fill: [],
      note: [],
    };
  }

  return {
    percent: Array.from(doc.querySelectorAll("[data-progress-percent]")),
    status: Array.from(doc.querySelectorAll("[data-progress-status]")),
    fill: Array.from(doc.querySelectorAll("[data-progress-fill]")),
    note: Array.from(doc.querySelectorAll("[data-progress-note]")),
  };
};

const statusTextForEntry = (entry) => {
  if (!entry) {
    return {
      text: "No progress yet",
      status: "not-started",
    };
  }
  if (entry.status === "completed") {
    return {
      text: "Module completed (saved locally)",
      status: "completed",
    };
  }
  if (entry.status === "in-progress") {
    return {
      text: "Progress saved locally",
      status: "in-progress",
    };
  }
  // Entry exists but has no explicit status (or status is "not-started")
  // Use "initialized" to distinguish from null entries
  return {
    text: "Tracking started",
    status: "initialized",
  };
};

const renderToolbar = (slug) => {
  const nodes = getToolbarNodes();
  const entry = slug ? state.progress.get(slug) : null;
  const percentValue = entry ? clampPercent(entry.percent) : 0;
  const statusDescriptor = statusTextForEntry(entry);

  nodes.percent.forEach((node) => {
    node.textContent = `${percentValue}%`;
  });

  nodes.fill.forEach((node) => {
    node.style.width = `${percentValue}%`;
    node.setAttribute("aria-valuenow", String(percentValue));
  });

  nodes.status.forEach((node) => {
    node.textContent = statusDescriptor.text;
    node.setAttribute("data-status", statusDescriptor.status);
  });

  const updatedAt = entry?.updatedAt
    ? new Date(entry.updatedAt).toLocaleString()
    : null;
  nodes.note.forEach((node) => {
    if (updatedAt) {
      node.textContent = `Progress is stored locally. Last updated ${updatedAt}.`;
    } else {
      node.textContent = "Progress is stored locally in this browser.";
    }
  });
};

const canRenderDashboard = () => {
  const doc = globalScope.document;
  if (!doc) return false;
  const overall = doc.getElementById("cdc-progress-overall");
  const modulesCanvas = doc.getElementById("cdc-progress-modules");
  return Boolean(overall && modulesCanvas && dashboardModules.length);
};

const snapshotProgressDocs = () =>
  Array.from(state.progress.entries()).map(([journeySlug, entry]) => ({
    journeySlug,
    percent: clampPercent(entry.percent ?? 0),
    step: Number.isFinite(Number(entry.step)) ? Number(entry.step) : 0,
    updatedAt: entry.updatedAt ?? new Date().toISOString(),
    status: entry.status ?? "not-started",
  }));

const transformDocsForDashboard = (docs = []) =>
  docs.map((doc) => {
    const rawPercent = Number(doc.percent ?? 0);
    const percent = Number.isFinite(rawPercent)
      ? Math.min(100, Math.max(0, rawPercent))
      : 0;
    const updatedAt = doc.updatedAt ?? new Date().toISOString();

    return {
      moduleId: doc.journeySlug,
      moduleTitle:
        moduleTitleLookup.get(doc.journeySlug) ?? doc.journeySlug ?? "",
      percent,
      status:
        percent >= 100
          ? "completed"
          : percent > 0
          ? "in-progress"
          : "not-started",
      updatedAt,
      step: typeof doc.step === "number" ? doc.step : null,
    };
  });

const updateDashboardView = (docs = []) => {
  if (!canRenderDashboard()) return;
  renderProgressDashboard("cdc-progress", dashboardModules, docs);
  const doc = globalScope.document;
  if (!doc) return;
  const boot = doc.getElementById("cdcDashboardBoot");
  const board = doc.getElementById("cdcDashboard");
  if (docs.length > 0) {
    boot?.setAttribute("hidden", "hidden");
    board?.removeAttribute("hidden");
  } else {
    board?.setAttribute("hidden", "hidden");
    boot?.removeAttribute("hidden");
  }
};

const refreshDashboard = ({ force } = {}) => {
  const docs = transformDocsForDashboard(snapshotProgressDocs());
  if (force || docs.length) {
    persistDashboardDocs(docs);
  }
  if (force || docs.length) {
    updateDashboardView(docs);
  } else {
    const cachedDocs = readPersistedDashboardDocs();
    if (cachedDocs.length) {
      updateDashboardView(cachedDocs);
    }
  }
  return docs;
};

const getProgressInternal = (slug) => {
  if (!slug) return null;
  return state.progress.get(slug) ?? null;
};

const onStepChangeInternal = ({
  journeySlug,
  step = 0,
  percent = 0,
  state: entryState = null,
} = {}) => {
  if (!journeySlug) {
    console.warn("CDCProgress: Missing journeySlug in onStepChange");
    return null;
  }

  const normalized = normalizeEntry(journeySlug, {
    percent,
    step,
    state: entryState,
    updatedAt: new Date().toISOString(),
  });

  state.progress.set(journeySlug, normalized);
  writeStoredProgress();
  renderToolbar(journeySlug);
  refreshDashboard({ force: true });
  dispatchProgressChange(journeySlug);
  return normalized;
};

const refreshProgressInternal = async () => {
  await ensureReadyPromise();
  return refreshDashboard({ force: true });
};

const loadStoredEntries = () => {
  const stored = readStoredProgress();
  Object.entries(stored).forEach(([slug, entry]) => {
    if (!slug) return;
    state.progress.set(slug, normalizeEntry(slug, entry));
  });
};

const bootstrap = () => {
  loadStoredEntries();
  renderToolbar(config.journeySlug ?? "");
  const docs = transformDocsForDashboard(snapshotProgressDocs());
  if (docs.length) {
    persistDashboardDocs(docs);
  }
  updateDashboardView(docs);
  resolveReady();
};

const CDCProgress = {
  ready: ensureReadyPromise(),
  getCurrentUser: () => null,
  isAuthenticated: () => false,
  getProgress: getProgressInternal,
  getDashboardDocs: () =>
    transformDocsForDashboard(snapshotProgressDocs()),
  signInWithOAuth: () => {
    return Promise.resolve(false);
  },
  signOut: () => {
    console.info("CDCProgress: OAuth sign-out has been removed.");
    return Promise.resolve(false);
  },
  onStepChange: onStepChangeInternal,
  offerResume: () => false,
  refresh: refreshProgressInternal,
};

globalScope.CDCProgress = CDCProgress;

bootstrap();

export default CDCProgress;
