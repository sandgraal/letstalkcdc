/**
 * Authentication Module
 * Handles user login/signup using Appwrite Account SDK
 * Progressive enhancement - works with or without Appwrite config
 */

// Import Appwrite SDK dynamically
let Account = null;
let client = null;

const AUTH_STATE_KEY = "cdc-auth-state";
const _PENDING_LOGIN_KEY = "cdc-pending-login";

/**
 * Initialize Appwrite Account SDK
 */
async function initAppwriteAuth() {
  const endpoint = window.APPWRITE_ENDPOINT;
  const project = window.APPWRITE_PROJECT;

  if (!endpoint || !project) {
    console.log("Appwrite not configured; authentication unavailable");
    return false;
  }

  try {
    const AppwriteSDK =
      await import("https://cdn.jsdelivr.net/npm/appwrite@13.0.0/dist/esm/appwrite.js");
    const { Client, Account: AppwriteAccount } = AppwriteSDK;

    client = new Client().setEndpoint(endpoint).setProject(project);

    Account = new AppwriteAccount(client);
    return true;
  } catch (error) {
    console.error("Failed to initialize Appwrite auth:", error);
    return false;
  }
}

/**
 * Get current authentication state
 */
function getAuthState() {
  try {
    const stored = localStorage.getItem(AUTH_STATE_KEY);
    return stored ? JSON.parse(stored) : null;
  } catch (_e) {
    return null;
  }
}

/**
 * Store authentication state
 */
function setAuthState(state) {
  try {
    if (state) {
      localStorage.setItem(AUTH_STATE_KEY, JSON.stringify(state));
    } else {
      localStorage.removeItem(AUTH_STATE_KEY);
    }
  } catch (_e) {
    console.warn("Failed to store auth state:", _e);
  }
}

/**
 * Check if user is currently logged in
 */
async function checkSession() {
  if (!Account) {
    const initialized = await initAppwriteAuth();
    if (!initialized) return null;
  }

  try {
    const session = await Account.get();
    const authState = {
      userId: session.$id,
      email: session.email,
      name: session.name || session.email.split("@")[0],
      loggedIn: true,
    };
    setAuthState(authState);
    return authState;
  } catch (_error) {
    // No active session
    setAuthState(null);
    return null;
  }
}

/**
 * Create a new user account
 */
async function signup(email, password, name) {
  if (!Account) {
    const initialized = await initAppwriteAuth();
    if (!initialized) {
      throw new Error("Authentication not configured");
    }
  }

  try {
    // Create account
    const userId = "unique()";
    await Account.create(userId, email, password, name);

    // Log in the new user
    return await login(email, password);
  } catch (error) {
    console.error("Signup failed:", error);
    throw error;
  }
}

/**
 * Log in an existing user
 */
async function login(email, password) {
  if (!Account) {
    const initialized = await initAppwriteAuth();
    if (!initialized) {
      throw new Error("Authentication not configured");
    }
  }

  try {
    // Create email session
    await Account.createEmailSession(email, password);

    // Get user details
    const user = await Account.get();
    const authState = {
      userId: user.$id,
      email: user.email,
      name: user.name || user.email.split("@")[0],
      loggedIn: true,
    };

    setAuthState(authState);

    // Dispatch login event
    window.dispatchEvent(
      new CustomEvent("cdc:user-logged-in", {
        detail: authState,
      }),
    );

    return authState;
  } catch (error) {
    console.error("Login failed:", error);
    throw error;
  }
}

/**
 * Log out the current user
 */
async function logout() {
  if (!Account) return;

  try {
    // Delete current session
    await Account.deleteSession("current");
  } catch (error) {
    console.error("Logout failed:", error);
  } finally {
    // Clear local auth state regardless
    setAuthState(null);

    // Dispatch logout event
    window.dispatchEvent(new CustomEvent("cdc:user-logged-out"));
  }
}

/**
 * Get current user
 */
function getCurrentUser() {
  return getAuthState();
}

/**
 * Check if user is authenticated
 */
function isAuthenticated() {
  const state = getAuthState();
  return state && state.loggedIn;
}

/**
 * Initialize authentication on page load
 */
async function initAuth() {
  // Check for active session
  await checkSession();

  // Dispatch auth ready event
  window.dispatchEvent(
    new CustomEvent("cdc:auth-ready", {
      detail: { user: getCurrentUser() },
    }),
  );
}

export {
  initAuth,
  signup,
  login,
  logout,
  getCurrentUser,
  isAuthenticated,
  checkSession,
};
