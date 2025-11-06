/**
 * Local Progress Tracker
 * Tracks module completion using localStorage (no server required)
 * Progressive enhancement - works alongside Appwrite integration
 */

const STORAGE_KEY = 'cdc-local-progress';
const VISIT_KEY = 'cdc-module-visits';

/**
 * Safe localStorage wrapper
 */
const storage = {
  get(key) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : null;
    } catch (e) {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (e) {
      return false;
    }
  }
};

/**
 * Get all completed modules
 * @returns {Set<string>} Set of completed module keys
 */
export function getCompletedModules() {
  const data = storage.get(STORAGE_KEY);
  return new Set(data?.completed || []);
}

/**
 * Get all visited modules
 * @returns {Object} Map of module key to visit data
 */
export function getVisitedModules() {
  return storage.get(VISIT_KEY) || {};
}

/**
 * Mark a module as visited
 * @param {string} moduleKey - The module key
 */
export function markModuleVisited(moduleKey) {
  if (!moduleKey) return;
  
  const visits = getVisitedModules();
  visits[moduleKey] = {
    firstVisit: visits[moduleKey]?.firstVisit || Date.now(),
    lastVisit: Date.now(),
    visitCount: (visits[moduleKey]?.visitCount || 0) + 1
  };
  
  storage.set(VISIT_KEY, visits);
  
  // Dispatch event for UI updates
  window.dispatchEvent(new CustomEvent('cdc:progress-updated', {
    detail: { type: 'visit', moduleKey }
  }));
}

/**
 * Mark a module as completed
 * @param {string} moduleKey - The module key
 */
export function markModuleCompleted(moduleKey) {
  if (!moduleKey) return;
  
  const data = storage.get(STORAGE_KEY) || { completed: [], badges: [] };
  if (!data.completed.includes(moduleKey)) {
    data.completed.push(moduleKey);
    data.completedAt = data.completedAt || {};
    data.completedAt[moduleKey] = Date.now();
    storage.set(STORAGE_KEY, data);
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('cdc:progress-updated', {
      detail: { type: 'complete', moduleKey }
    }));
  }
}

/**
 * Check if a module is completed
 * @param {string} moduleKey - The module key
 * @returns {boolean}
 */
export function isModuleCompleted(moduleKey) {
  return getCompletedModules().has(moduleKey);
}

/**
 * Get completion percentage across all modules
 * @param {Array} modules - Array of module objects with 'key' property
 * @returns {number} Percentage (0-100)
 */
export function getOverallProgress(modules) {
  if (!modules || modules.length === 0) return 0;
  const completed = getCompletedModules();
  const validModules = modules.filter(m => m.key && m.state !== 'disabled');
  if (validModules.length === 0) return 0;
  return Math.round((completed.size / validModules.length) * 100);
}

/**
 * Get completion stats by category
 * @param {Array} modules - Array of module objects
 * @returns {Object} Category stats
 */
export function getCategoryProgress(modules) {
  const completed = getCompletedModules();
  const categories = {};
  
  modules.forEach(module => {
    if (module.state === 'disabled') return;
    
    module.tags?.forEach(tag => {
      const label = typeof tag === 'string' ? tag : tag.label;
      if (!categories[label]) {
        categories[label] = { total: 0, completed: 0 };
      }
      categories[label].total++;
      if (completed.has(module.key)) {
        categories[label].completed++;
      }
    });
  });
  
  return categories;
}

/**
 * Check which badges have been earned
 * @param {Array} modules - Array of module objects
 * @returns {Array} Array of earned badge objects
 */
export function getEarnedBadges(modules) {
  const categoryProgress = getCategoryProgress(modules);
  const badges = [];
  
  Object.entries(categoryProgress).forEach(([category, stats]) => {
    if (stats.completed === stats.total && stats.total > 0) {
      badges.push({
        category,
        title: `${category} Master`,
        description: `Completed all ${stats.total} ${category} module(s)`,
        earnedAt: Date.now()
      });
    }
  });
  
  return badges;
}

/**
 * Initialize progress tracking on current page
 */
export function initializeProgressTracking() {
  // Mark current module as visited if on a module page
  const journeySlug = document.body.dataset.journeySlug;
  if (journeySlug) {
    markModuleVisited(journeySlug);
  }
  
  // Listen for completion events (can be triggered by interactive elements)
  window.addEventListener('cdc:mark-complete', (e) => {
    const { moduleKey } = e.detail;
    markModuleCompleted(moduleKey);
  });
}

// Auto-initialize when module loads
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeProgressTracking);
  } else {
    initializeProgressTracking();
  }
}
