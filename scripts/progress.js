import { renderProgressDashboard, appendAgentLog } from "./dashboard.js";

const globalScope = typeof window !== "undefined" ? window : globalThis;

const config = {
  endpoint: globalScope.APPWRITE_ENDPOINT ?? "",
  project: globalScope.APPWRITE_PROJECT ?? "",
  databaseId: globalScope.APPWRITE_DB_ID ?? "",
  progressCollectionId: globalScope.COL_PROGRESS_ID ?? "",
  eventsCollectionId: globalScope.COL_EVENTS_ID ?? "",
  journeySlug:
    globalScope.CDC_JOURNEY_SLUG ??
    (globalScope.document?.body?.dataset?.journeySlug ?? ""),
};

const LOCAL_STORAGE_KEY = "cdc-progress-store";
const LOCAL_ANON_KEY = "cdc-progress-anon";
const RESUME_SESSION_KEY = (slug) => `cdc-progress-resume-${slug}`;

const state = {
  client: null,
  account: null,
  databases: null,
  user: null,
  session: null,
  isAuthenticated: false,
  isAnonymous: true,
  ready: false,
  progress: new Map(),
  remoteDocs: new Map(),
  readyResolvers: [],
  pendingStepChanges: [],
};

let readyEventDispatched = false;

const rawDashboardModules = Array.isArray(globalScope.CDC_MODULES)
  ? globalScope.CDC_MODULES
  : [];
const dashboardModules = rawDashboardModules
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

const persistDashboardDocs = (docs) => {
  if (typeof globalScope.localStorage === "undefined") return;
  try {
    globalScope.localStorage.setItem(
      "lastProgressDocs",
      JSON.stringify(docs)
    );
  } catch (_) {
    /* ignore */
  }
};

const resetDashboardView = () => {
  const doc = globalScope.document;
  if (!doc) return;
  const boot = doc.getElementById("cdcDashboardBoot");
  const board = doc.getElementById("cdcDashboard");
  if (board) {
    board.setAttribute("hidden", "hidden");
  }
  if (boot) {
    boot.removeAttribute("hidden");
  }
};

const canRenderDashboard = () => {
  const doc = globalScope.document;
  if (!doc) return false;
  const overall = doc.getElementById("cdc-progress-overall");
  const modulesCanvas = doc.getElementById("cdc-progress-modules");
  return Boolean(overall && modulesCanvas && dashboardModules.length);
};

const transformDocsForDashboard = (docs = []) =>
  docs.map((doc) => {
    const rawPercent = Number(doc.percent ?? 0);
    const percent = Number.isFinite(rawPercent)
      ? Math.min(100, Math.max(0, rawPercent))
      : 0;
    const updatedAt =
      doc.updatedAt ?? doc.$updatedAt ?? doc.$createdAt ?? new Date().toISOString();

    return {
      moduleId: doc.journeySlug,
      moduleTitle:
        moduleTitleLookup.get(doc.journeySlug) ?? doc.journeySlug ?? "",
      percent,
      status:
        percent >= 99
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
  renderProgressDashboard("cdc-progress", dashboardModules);
  const doc = globalScope.document;
  if (!doc) return;
  const boot = doc.getElementById("cdcDashboardBoot");
  const board = doc.getElementById("cdcDashboard");
  if (boot) {
    boot.setAttribute("hidden", "hidden");
  }
  if (board) {
    board.removeAttribute("hidden");
  }
};

let lastAuthState = null;

const logAgentMessage = (message, type = "info", source = "CDC_AGENT") => {
  if (typeof appendAgentLog !== "function") return;
  appendAgentLog(message, type, source);
};

const hasAppwriteConfig =
  Boolean(config.endpoint) &&
  Boolean(config.project) &&
  Boolean(config.databaseId) &&
  Boolean(config.progressCollectionId);

let AppwriteExports = null;
if (hasAppwriteConfig) {
  try {
    AppwriteExports = await import(
      "https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js"
    );
  } catch (error) {
    console.warn("CDCProgress: Failed to load Appwrite SDK", error);
  }
}

const Client = AppwriteExports?.Client;
const Account = AppwriteExports?.Account;
const Databases = AppwriteExports?.Databases;
const ID = AppwriteExports?.ID;
const Query = AppwriteExports?.Query;
const Permission = AppwriteExports?.Permission;
const Role = AppwriteExports?.Role;

const inFlightSaves = new Map();
const lastStepEvents = new Map();

const safeJsonParse = (value) => {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (error) {
    console.warn("CDCProgress: Unable to parse stored state", error);
    return null;
  }
};

const readLocalProgress = () => {
  if (typeof globalScope.localStorage === "undefined") return {};
  try {
    const raw = globalScope.localStorage.getItem(LOCAL_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return {};
    return parsed;
  } catch (_) {
    return {};
  }
};

const writeLocalProgress = () => {
  if (typeof globalScope.localStorage === "undefined") return;
  const entries = {};
  state.progress.forEach((value, slug) => {
    entries[slug] = {
      step: value.step,
      percent: value.percent,
      updatedAt: value.updatedAt,
      state: value.state ?? null,
    };
  });
  try {
    globalScope.localStorage.setItem(
      LOCAL_STORAGE_KEY,
      JSON.stringify(entries)
    );
  } catch (_) {
    /* ignore */
  }
};

const setAnonUserId = (userId) => {
  if (typeof globalScope.localStorage === "undefined") return;
  try {
    if (userId) {
      globalScope.localStorage.setItem(LOCAL_ANON_KEY, userId);
    } else {
      globalScope.localStorage.removeItem(LOCAL_ANON_KEY);
    }
  } catch (_) {
    /* ignore */
  }
};

const getAnonUserId = () => {
  if (typeof globalScope.localStorage === "undefined") return "";
  try {
    return globalScope.localStorage.getItem(LOCAL_ANON_KEY) ?? "";
  } catch (_) {
    return "";
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
    } catch (error) {
      console.warn("CDCProgress: Unable to dispatch ready event", error);
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

  try {
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

    globalScope.dispatchEvent(
      new CustomEvent("cdc-progress-change", {
        detail: {
          journeySlug: slug,
          entry: detailEntry,
        },
      })
    );
  } catch (error) {
    console.warn("CDCProgress: Unable to dispatch progress change event", error);
  }
};

const ensureToastElements = () => {
  const root = globalScope.document?.querySelector("[data-progress-toast]");
  if (!root) return null;
  return {
    root,
    message: root.querySelector("[data-progress-toast-message]"),
    resume: root.querySelector("[data-progress-toast-resume]"),
    dismiss: root.querySelector("[data-progress-toast-dismiss]"),
  };
};

const hideToast = () => {
  const toast = ensureToastElements();
  if (!toast) return;
  toast.root.classList.remove("is-visible");
  toast.root.setAttribute("hidden", "hidden");
};

const showToast = () => {
  const toast = ensureToastElements();
  if (!toast) return;
  toast.root.removeAttribute("hidden");
  requestAnimationFrame(() => {
    toast.root.classList.add("is-visible");
  });
};

const defaultResumeBehavior = (entry) => {
  if (!entry || !entry.state) return;
  if (typeof entry.state === "string") {
    entry = { ...entry, state: safeJsonParse(entry.state) ?? {} };
  }
  const { state } = entry;
  if (!state) return;

  if (state.url) {
    globalScope.location.href = state.url;
    return;
  }
  if (state.hash) {
    globalScope.location.hash = state.hash;
    return;
  }
  if (state.selector) {
    const node = globalScope.document?.querySelector(state.selector);
    if (node) {
      node.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
  }
  if (typeof state.scrollY === "number") {
    globalScope.scrollTo({ top: state.scrollY, behavior: "smooth" });
  }
};

const toolbarNodes = () => {
  const doc = globalScope.document;
  if (!doc) {
    return {
      percent: [],
      status: [],
      login: [],
      logout: [],
    };
  }
  return {
    percent: Array.from(doc.querySelectorAll("[data-progress-percent]")),
    status: Array.from(doc.querySelectorAll("[data-progress-status]")),
    login: Array.from(doc.querySelectorAll("[data-progress-login]")),
    logout: Array.from(doc.querySelectorAll("[data-progress-logout]")),
  };
};

const renderToolbar = (slug) => {
  const { percent, status, login, logout } = toolbarNodes();
  const entry = slug ? state.progress.get(slug) : null;
  const percentValue = entry ? Math.round(entry.percent ?? 0) : 0;

  percent.forEach((node) => {
    node.textContent = `${percentValue}%`;
  });

  const hasSdk = Boolean(AppwriteExports);
  const statusMessage = (() => {
    if (!hasSdk) {
      return "Offline progress only";
    }
    if (state.isAuthenticated) {
      return "Synced across devices";
    }
    if (state.isAnonymous) {
      return "Saving to this device";
    }
    return "Not signed in";
  })();

  status.forEach((node) => {
    node.textContent = statusMessage;
  });

  login.forEach((button) => {
    button.toggleAttribute("disabled", !hasSdk);
    if (state.isAuthenticated) {
      button.setAttribute("hidden", "hidden");
    } else {
      button.removeAttribute("hidden");
    }
  });

  logout.forEach((button) => {
    if (state.isAuthenticated) {
      button.removeAttribute("hidden");
    } else {
      button.setAttribute("hidden", "hidden");
    }
  });

  if (globalScope.document?.body) {
    const mode = state.isAuthenticated
      ? "authenticated"
      : state.isAnonymous
      ? "anonymous"
      : "unknown";
    globalScope.document.body.dataset.progressAuth = mode;
  }
};

const logEvent = async (type, payload = {}) => {
  if (!AppwriteExports || !state.databases || !state.user) return;
  if (!config.eventsCollectionId) return;
  try {
    await state.databases.createDocument(
      config.databaseId,
      config.eventsCollectionId,
      ID.unique(),
      {
        userId: state.user.$id,
        type,
        journeySlug: payload.journeySlug ?? payload.slug ?? null,
        metadata: payload ? JSON.stringify(payload) : null,
        createdAt: new Date().toISOString(),
      },
      [Permission.read(Role.user(state.user.$id))]
    );
  } catch (error) {
    console.warn("CDCProgress: Unable to record event", error);
  }
};

const mergeProgressEntry = (slug, next) => {
  if (!slug) return null;
  const existing = state.progress.get(slug);
  if (!existing) {
    state.progress.set(slug, { ...next });
    return state.progress.get(slug);
  }
  const newer =
    !existing.updatedAt ||
    !next.updatedAt ||
    new Date(next.updatedAt).getTime() >=
      new Date(existing.updatedAt).getTime();
  if (newer) {
    const merged = {
      ...existing,
      ...next,
    };
    state.progress.set(slug, merged);
    return merged;
  }
  return existing;
};

const persistRemote = async (slug) => {
  if (!AppwriteExports || !state.databases || !state.user) return;
  const entry = state.progress.get(slug);
  if (!entry) return;

  if (inFlightSaves.has(slug)) {
    clearTimeout(inFlightSaves.get(slug));
  }

  const timer = setTimeout(async () => {
    inFlightSaves.delete(slug);
    const data = {
      userId: state.user.$id,
      journeySlug: slug,
      step: entry.step ?? 0,
      percent: entry.percent ?? 0,
      updatedAt: entry.updatedAt ?? new Date().toISOString(),
      state: entry.state ? JSON.stringify(entry.state) : null,
    };
    const permissions = [
      Permission.read(Role.user(state.user.$id)),
      Permission.update(Role.user(state.user.$id)),
      Permission.delete(Role.user(state.user.$id)),
    ];

    try {
      if (state.remoteDocs.has(slug)) {
        const docId = state.remoteDocs.get(slug);
        await state.databases.updateDocument(
          config.databaseId,
          config.progressCollectionId,
          docId,
          data,
          permissions
        );
      } else {
        const doc = await state.databases.createDocument(
          config.databaseId,
          config.progressCollectionId,
          ID.unique(),
          data,
          permissions
        );
        state.remoteDocs.set(slug, doc.$id);
      }
    } catch (error) {
      console.warn("CDCProgress: Failed to persist progress", error);
    }
  }, 400);

  inFlightSaves.set(slug, timer);
};

const onStepChangeInternal = async (payload) => {
  const normalized = { ...payload };
  const slug =
    normalized.journeySlug || config.journeySlug || normalized.slug || "";
  if (!slug) {
    console.warn("CDCProgress: Missing journeySlug in onStepChange");
    return;
  }

  if (!state.ready) {
    state.pendingStepChanges.push(normalized);
    return;
  }

  const percent = Number(normalized.percent ?? 0);
  const clampedPercent = Number.isFinite(percent)
    ? Math.min(100, Math.max(0, percent))
    : 0;
  const step = normalized.step ?? 0;
  mergeProgressEntry(slug, {
    step,
    percent: clampedPercent,
    updatedAt: new Date().toISOString(),
    state: normalized.state ?? null,
  });

  writeLocalProgress();
  renderToolbar(slug);
  dispatchProgressChange(slug);

  if (AppwriteExports && state.user) {
    await persistRemote(slug);
  }

  const eventBucket = Math.floor(clampedPercent / 5);
  const previousEvent = lastStepEvents.get(slug) ?? { step: null, bucket: -1 };
  if (previousEvent.step !== step || previousEvent.bucket !== eventBucket) {
    lastStepEvents.set(slug, { step, bucket: eventBucket });
    logEvent("step-change", { journeySlug: slug, step, percent: clampedPercent });
  }
};

const processPendingStepChanges = () => {
  if (!state.ready || !state.pendingStepChanges.length) return;
  const queue = state.pendingStepChanges.splice(0);
  queue.forEach((item) => {
    onStepChangeInternal(item);
  });
};

const getProgressInternal = (journeySlug) => {
  if (!journeySlug) return null;
  return state.progress.get(journeySlug) ?? null;
};

const signInWithOAuthInternal = async (provider = "github") => {
  if (!AppwriteExports || !state.account) {
    console.warn("CDCProgress: OAuth unavailable");
    return;
  }
  try {
    if (state.isAnonymous && state.user?.$id) {
      setAnonUserId(state.user.$id);
    }
    const successUrl = new URL(globalScope.location.href);
    successUrl.searchParams.set("auth", "success");
    const failureUrl = new URL(globalScope.location.href);
    failureUrl.searchParams.set("auth", "failed");
    await state.account.createOAuth2Session(
      provider,
      successUrl.toString(),
      failureUrl.toString()
    );
    await logEvent("login", { provider });
  } catch (error) {
    console.warn("CDCProgress: OAuth login failed", error);
  }
};

const signOutInternal = async () => {
  if (!AppwriteExports || !state.account) return;
  try {
    await state.account.deleteSession("current");
    await logEvent("logout", { journeySlug: config.journeySlug });
  } catch (error) {
    console.warn("CDCProgress: Sign out failed", error);
  }
  state.user = null;
  state.session = null;
  state.isAuthenticated = false;
  state.isAnonymous = true;
  persistDashboardDocs([]);
  resetDashboardView();
  await bootstrap();
};

const offerResumeInternal = ({ journeySlug, onResume, message } = {}) => {
  const slug = journeySlug || config.journeySlug;
  if (!slug) return false;
  const entry = state.progress.get(slug);
  if (!entry) return false;
  const percent = Math.round(entry.percent ?? 0);
  if (percent < 5 || percent >= 99) return false;

  const toast = ensureToastElements();
  if (!toast) return false;

  const text =
    message ||
    `Resume where you left off? You were ${percent}% through this journey.`;
  toast.message.textContent = text;

  toast.resume.onclick = () => {
    hideToast();
    if (typeof globalScope.sessionStorage !== "undefined") {
      globalScope.sessionStorage.setItem(
        RESUME_SESSION_KEY(slug),
        "completed"
      );
    }
    if (typeof onResume === "function") {
      onResume(entry);
    } else {
      defaultResumeBehavior(entry);
    }
    logEvent("resume", { journeySlug: slug, percent });
  };

  toast.dismiss.onclick = () => {
    hideToast();
    if (typeof globalScope.sessionStorage !== "undefined") {
      globalScope.sessionStorage.setItem(
        RESUME_SESSION_KEY(slug),
        "dismissed"
      );
    }
  };

  showToast();
  return true;
};

const updateSessionDetails = async () => {
  if (!AppwriteExports || !state.account) return;
  try {
    const session = await state.account.getSession("current");
    state.session = session;
    state.isAnonymous = session?.provider === "anonymous";
    state.isAuthenticated = !state.isAnonymous;
  } catch (_) {
    state.session = null;
    state.isAnonymous = true;
    state.isAuthenticated = false;
  }
  const previous = lastAuthState;
  lastAuthState = state.isAuthenticated;
  if (previous === null) {
    if (state.isAuthenticated) {
      const identity =
        state.user?.name ?? state.user?.email ?? state.user?.$id ?? "user";
      logAgentMessage(`Session restored for ${identity}.`, "info", "CDC_AGENT");
    } else {
      persistDashboardDocs([]);
      resetDashboardView();
      logAgentMessage(
        "Anonymous session active. Sign in to sync your dashboard.",
        "info",
        "CDC_AGENT"
      );
    }
    return;
  }
  if (state.isAuthenticated && !previous) {
    const identity =
      state.user?.name ?? state.user?.email ?? state.user?.$id ?? "user";
    logAgentMessage(`Signed in as ${identity}.`, "info", "CDC_AGENT");
  } else if (!state.isAuthenticated && previous) {
    persistDashboardDocs([]);
    resetDashboardView();
    logAgentMessage("Signed out of CDC session.", "info", "CDC_AGENT");
  }
};

const migrateAnonymousProgress = async (fromUserId, toUserId) => {
  if (!fromUserId || !toUserId || fromUserId === toUserId) return;
  try {
    const response = await fetch("/.netlify/functions/migrateUser", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ fromUserId, toUserId }),
    });
    if (!response.ok) {
      const message = await response.text();
      throw new Error(message || "Migration failed");
    }
    const payload = await response.json().catch(() => ({}));
    await logEvent("migration", { fromUserId, toUserId, payload });
    return payload;
  } catch (error) {
    console.warn("CDCProgress: Migration failed", error);
  }
};

const listAllDocuments = async (collectionId, filters = []) => {
  if (!AppwriteExports || !state.databases) return [];
  const documents = [];
  let hasMore = true;
  let cursor = null;

  while (hasMore) {
    const queries = [...filters, Query.limit(100)];
    if (cursor) {
      queries.push(Query.cursorAfter(cursor));
    }
    const response = await state.databases.listDocuments(
      config.databaseId,
      collectionId,
      queries
    );
    documents.push(...response.documents);
    if (response.documents.length === 0 || documents.length >= response.total) {
      hasMore = false;
    } else {
      cursor = response.documents[response.documents.length - 1].$id;
    }
  }

  return documents;
};

const loadRemoteProgress = async () => {
  if (!AppwriteExports || !state.user || !state.databases) return;
  try {
    const docs = await listAllDocuments(config.progressCollectionId, [
      Query.equal("userId", state.user.$id),
    ]);
    docs.forEach((doc) => {
      const parsedState = doc.state ? safeJsonParse(doc.state) : null;
      const entry = {
        step: doc.step ?? 0,
        percent: doc.percent ?? 0,
        updatedAt: doc.updatedAt ?? doc.$updatedAt,
        state: parsedState,
      };
      mergeProgressEntry(doc.journeySlug, entry);
      state.remoteDocs.set(doc.journeySlug, doc.$id);
      dispatchProgressChange(doc.journeySlug);
    });
    const normalizedDocs = transformDocsForDashboard(docs);
    persistDashboardDocs(normalizedDocs);
    if (!state.isAnonymous) {
      updateDashboardView(normalizedDocs);
      const completedCount = normalizedDocs.filter(
        (doc) => doc.status === "completed"
      ).length;
      logAgentMessage(
        `Synced ${normalizedDocs.length} progress record(s); ${completedCount} completed.`,
        "info",
        "SYNC"
      );
    }
    writeLocalProgress();
  } catch (error) {
    console.warn("CDCProgress: Unable to load remote progress", error);
  }
};

const maybeAutoResume = () => {
  if (!config.journeySlug) return;
  const entry = state.progress.get(config.journeySlug);
  if (!entry) return;
  const percent = Math.round(entry.percent ?? 0);
  if (percent < 5 || percent >= 99) return;

  if (typeof globalScope.sessionStorage !== "undefined") {
    const key = RESUME_SESSION_KEY(config.journeySlug);
    const flag = globalScope.sessionStorage.getItem(key);
    if (flag === "dismissed" || flag === "completed") {
      return;
    }
    globalScope.sessionStorage.setItem(key, "offered");
  }

  offerResumeInternal({ journeySlug: config.journeySlug });
};

const bootstrap = async () => {
  const local = readLocalProgress();
  Object.entries(local).forEach(([slug, entry]) => {
    mergeProgressEntry(slug, entry);
  });

  renderToolbar(config.journeySlug ?? "");

  if (!AppwriteExports) {
    resolveReady();
    processPendingStepChanges();
    maybeAutoResume();
    return;
  }

  state.client = new Client().setEndpoint(config.endpoint).setProject(config.project);
  state.account = new Account(state.client);
  state.databases = new Databases(state.client);

  try {
    state.user = await state.account.get();
  } catch (_) {
    state.user = null;
  }

  if (!state.user) {
    try {
      const session = await state.account.createAnonymousSession();
      if (session?.userId) {
        setAnonUserId(session.userId);
      }
      state.user = await state.account.get();
    } catch (error) {
      console.warn("CDCProgress: Failed to establish anonymous session", error);
    }
  }

  await updateSessionDetails();

  if (state.user) {
    if (state.isAnonymous) {
      setAnonUserId(state.user.$id);
    } else {
      const storedAnon = getAnonUserId();
      if (storedAnon && storedAnon !== state.user.$id) {
        await migrateAnonymousProgress(storedAnon, state.user.$id);
        setAnonUserId("");
      }
    }
  }

  await loadRemoteProgress();
  resolveReady();
  renderToolbar(config.journeySlug ?? "");
  processPendingStepChanges();
  maybeAutoResume();
};

const bindAuthButtons = () => {
  const doc = globalScope.document;
  if (!doc) return;
  doc.addEventListener("click", (event) => {
    const loginButton = event.target.closest("[data-progress-login]");
    if (loginButton) {
      const provider = loginButton.getAttribute("data-progress-login") || "github";
      signInWithOAuthInternal(provider);
      return;
    }
    const logoutButton = event.target.closest("[data-progress-logout]");
    if (logoutButton) {
      signOutInternal();
    }
  });
};

const CDCProgress = {
  ready: ensureReadyPromise(),
  getCurrentUser: () => state.user,
  isAuthenticated: () => state.isAuthenticated,
  getProgress: getProgressInternal,
  signInWithOAuth: signInWithOAuthInternal,
  signOut: signOutInternal,
  onStepChange: onStepChangeInternal,
  offerResume: offerResumeInternal,
};

globalScope.CDCProgress = CDCProgress;

renderToolbar(config.journeySlug ?? "");

await bootstrap();

bindAuthButtons();

export default CDCProgress;
