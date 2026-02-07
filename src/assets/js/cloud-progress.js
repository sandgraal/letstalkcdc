/**
 * Cloud Progress Sync Module
 * Syncs local progress with Appwrite database when user is authenticated
 * Works alongside local-progress.js for progressive enhancement
 */

import { getCurrentUser, isAuthenticated } from "./auth.js";
import {
  getCompletedModules,
  getVisitedModules,
  markModuleCompleted,
} from "./local-progress.js";

let databases = null;
let Query = null;
let dbConfig = null;
let isInitialized = false;

const COLLECTION_PROGRESS = "progress";
const COLLECTION_EVENTS = "events";

/**
 * Initialize Appwrite Databases SDK
 */
async function initCloudProgress() {
  if (isInitialized) return true;

  const endpoint = window.APPWRITE_ENDPOINT;
  const project = window.APPWRITE_PROJECT;
  const databaseId = window.APPWRITE_DB_ID;

  if (!endpoint || !project || !databaseId) {
    console.log("Appwrite not configured; cloud sync unavailable");
    return false;
  }

  try {
    const AppwriteSDK =
      await import("https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js");
    const { Client, Databases, Query: AppwriteQuery } = AppwriteSDK;

    const client = new Client().setEndpoint(endpoint).setProject(project);

    databases = new Databases(client);
    Query = AppwriteQuery;
    dbConfig = { databaseId };
    isInitialized = true;

    return true;
  } catch (error) {
    console.error("Failed to initialize cloud progress:", error);
    return false;
  }
}

/**
 * Fetch user's progress from cloud
 */
async function fetchCloudProgress(userId) {
  if (!databases || !dbConfig) {
    await initCloudProgress();
    if (!databases) return null;
  }

  try {
    const response = await databases.listDocuments(
      dbConfig.databaseId,
      COLLECTION_PROGRESS,
      [Query.equal("userId", userId)],
    );

    return response.documents || [];
  } catch (error) {
    console.error("Failed to fetch cloud progress:", error);
    return null;
  }
}

/**
 * Save or update module progress in cloud
 */
async function saveModuleProgress(userId, journeySlug, progressData) {
  if (!databases || !dbConfig) {
    await initCloudProgress();
    if (!databases) return false;
  }

  try {
    // Try to find existing document
    const existing = await databases.listDocuments(
      dbConfig.databaseId,
      COLLECTION_PROGRESS,
      [Query.equal("userId", userId), Query.equal("journeySlug", journeySlug)],
    );

    const data = {
      userId,
      journeySlug,
      step: progressData.step || 0,
      percent: progressData.percent || 0,
      state: JSON.stringify(progressData.state || {}),
      updatedAt: new Date().toISOString(),
    };

    if (existing.documents && existing.documents.length > 0) {
      // Update existing
      await databases.updateDocument(
        dbConfig.databaseId,
        COLLECTION_PROGRESS,
        existing.documents[0].$id,
        data,
      );
    } else {
      // Create new
      await databases.createDocument(
        dbConfig.databaseId,
        COLLECTION_PROGRESS,
        "unique()",
        data,
      );
    }

    return true;
  } catch (error) {
    console.error("Failed to save cloud progress:", error);
    return false;
  }
}

/**
 * Log an event to cloud
 */
async function logEvent(userId, type, journeySlug, metadata = {}) {
  if (!databases || !dbConfig) {
    await initCloudProgress();
    if (!databases) return false;
  }

  try {
    await databases.createDocument(
      dbConfig.databaseId,
      COLLECTION_EVENTS,
      "unique()",
      {
        userId,
        type,
        journeySlug: journeySlug || null,
        metadata: JSON.stringify(metadata),
        createdAt: new Date().toISOString(),
      },
    );
    return true;
  } catch (error) {
    console.error("Failed to log event:", error);
    return false;
  }
}

/**
 * Merge local progress with cloud progress
 * Strategy: Take the union of completed modules, prefer most recent timestamps
 */
async function mergeProgressOnLogin(userId) {
  const cloudProgress = await fetchCloudProgress(userId);
  if (!cloudProgress) return;

  const localCompleted = getCompletedModules();
  const _localVisits = getVisitedModules();

  // Create a map of cloud progress by module
  const cloudMap = new Map();
  cloudProgress.forEach((doc) => {
    try {
      const state = JSON.parse(doc.state || "{}");
      cloudMap.set(doc.journeySlug, {
        percent: doc.percent,
        step: doc.step,
        state: state,
        updatedAt: new Date(doc.updatedAt).getTime(),
      });
    } catch (e) {
      console.warn("Failed to parse cloud progress state:", e);
    }
  });

  // Merge: Union of local and cloud completed modules
  const allModules = new Set([...localCompleted]);
  cloudProgress.forEach((doc) => {
    if (doc.percent === 100) {
      allModules.add(doc.journeySlug);
    }
  });

  // Update local storage with merged data
  allModules.forEach((moduleKey) => {
    if (!localCompleted.has(moduleKey)) {
      markModuleCompleted(moduleKey);
    }
  });

  // Sync any local-only completions to cloud
  for (const moduleKey of localCompleted) {
    const cloudData = cloudMap.get(moduleKey);
    if (!cloudData || cloudData.percent < 100) {
      await saveModuleProgress(userId, moduleKey, {
        step: 1,
        percent: 100,
        state: {},
      });
    }
  }

  // Log merge event
  await logEvent(userId, "progress_merge", null, {
    localModules: localCompleted.size,
    cloudModules: cloudProgress.length,
    mergedModules: allModules.size,
  });

  // Dispatch event to update UI
  window.dispatchEvent(
    new CustomEvent("cdc:progress-synced", {
      detail: {
        userId,
        totalModules: allModules.size,
      },
    }),
  );
}

/**
 * Sync progress to cloud when module is completed
 */
async function syncProgressToCloud(moduleKey) {
  if (!isAuthenticated()) return;

  const user = getCurrentUser();
  if (!user) return;

  await saveModuleProgress(user.userId, moduleKey, {
    step: 1,
    percent: 100,
    state: {},
  });

  await logEvent(user.userId, "module_complete", moduleKey);
}

/**
 * Initialize cloud sync listeners
 */
function initCloudSync() {
  // Listen for login events to trigger merge
  window.addEventListener("cdc:user-logged-in", async (e) => {
    const { userId } = e.detail;
    await mergeProgressOnLogin(userId);
  });

  // Listen for progress updates to sync to cloud
  window.addEventListener("cdc:progress-updated", async (e) => {
    if (e.detail.type === "complete" && isAuthenticated()) {
      await syncProgressToCloud(e.detail.moduleKey);
    }
  });
}

// Auto-initialize
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCloudSync);
  } else {
    initCloudSync();
  }
}

export {
  initCloudProgress,
  fetchCloudProgress,
  saveModuleProgress,
  logEvent,
  mergeProgressOnLogin,
  syncProgressToCloud,
};
