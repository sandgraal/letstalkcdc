/**
 * Authentication UI Components
 * Handles login/signup modal and user profile display
 */

import { login, signup, logout, getCurrentUser, initAuth } from "./auth.js";

const AUTH_MODAL_ID = "authModal";
const USER_PROFILE_ID = "userProfile";

/**
 * Create authentication modal
 */
function createAuthModal() {
  const existing = document.getElementById(AUTH_MODAL_ID);
  if (existing) return existing;

  const modal = document.createElement("div");
  modal.id = AUTH_MODAL_ID;
  modal.className = "auth-modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "authModalTitle");

  modal.innerHTML = `
    <div class="auth-modal-overlay"></div>
    <div class="auth-modal-content">
      <button type="button" class="auth-modal-close" aria-label="Close">&times;</button>
      
      <div class="auth-modal-tabs">
        <button type="button" class="auth-tab active" data-tab="login">Log In</button>
        <button type="button" class="auth-tab" data-tab="signup">Sign Up</button>
      </div>
      
      <!-- Login Form -->
      <div class="auth-panel" data-panel="login">
        <h2 id="authModalTitle">Log In to Your Account</h2>
        <p class="auth-subtitle">Access your progress from any device</p>
        
        <form id="loginForm" class="auth-form">
          <div class="form-group">
            <label for="loginEmail">Email</label>
            <input 
              type="email" 
              id="loginEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="you@example.com"
            >
          </div>
          
          <div class="form-group">
            <label for="loginPassword">Password</label>
            <input 
              type="password" 
              id="loginPassword" 
              name="password" 
              required 
              autocomplete="current-password"
              placeholder="Enter your password"
            >
          </div>
          
          <div class="auth-error" id="loginError" hidden></div>
          
          <button type="submit" class="button primary full-width" id="loginButton">
            Log In
          </button>
        </form>
        
        <p class="auth-footer">
          New here? <button type="button" class="link-button" data-switch-tab="signup">Create an account</button>
        </p>
      </div>
      
      <!-- Signup Form -->
      <div class="auth-panel hidden" data-panel="signup">
        <h2>Create Your Account</h2>
        <p class="auth-subtitle">Start tracking your CDC learning journey</p>
        
        <form id="signupForm" class="auth-form">
          <div class="form-group">
            <label for="signupName">Name</label>
            <input 
              type="text" 
              id="signupName" 
              name="name" 
              required 
              autocomplete="name"
              placeholder="Your name"
            >
          </div>
          
          <div class="form-group">
            <label for="signupEmail">Email</label>
            <input 
              type="email" 
              id="signupEmail" 
              name="email" 
              required 
              autocomplete="email"
              placeholder="you@example.com"
            >
          </div>
          
          <div class="form-group">
            <label for="signupPassword">Password</label>
            <input 
              type="password" 
              id="signupPassword" 
              name="password" 
              required 
              autocomplete="new-password"
              minlength="8"
              placeholder="At least 8 characters"
            >
          </div>
          
          <div class="auth-error" id="signupError" hidden></div>
          
          <button type="submit" class="button primary full-width" id="signupButton">
            Create Account
          </button>
        </form>
        
        <p class="auth-footer">
          Already have an account? <button type="button" class="link-button" data-switch-tab="login">Log in</button>
        </p>
        
        <p class="auth-privacy">
          By creating an account, you agree to store your learning progress in our secure cloud storage. 
          We will never share your data with third parties.
        </p>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  return modal;
}

/**
 * Show authentication modal
 */
function showAuthModal(defaultTab = "login") {
  const modal = createAuthModal();

  // Switch to default tab
  switchTab(defaultTab);

  // Show modal
  modal.classList.remove("hidden");

  // Focus first input
  const firstInput = modal.querySelector(
    `[data-panel="${defaultTab}"] input:not([hidden])`,
  );
  if (firstInput) {
    setTimeout(() => firstInput.focus(), 100);
  }

  // Prevent body scroll
  document.body.style.overflow = "hidden";
}

/**
 * Hide authentication modal
 */
function hideAuthModal() {
  const modal = document.getElementById(AUTH_MODAL_ID);
  if (modal) {
    modal.classList.add("hidden");
    document.body.style.overflow = "";
  }
}

/**
 * Switch between login and signup tabs
 */
function switchTab(tabName) {
  const modal = document.getElementById(AUTH_MODAL_ID);
  if (!modal) return;

  // Update tab buttons
  modal.querySelectorAll(".auth-tab").forEach((tab) => {
    const isActive = tab.dataset.tab === tabName;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  // Update panels
  modal.querySelectorAll(".auth-panel").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("hidden", !isActive);
  });

  // Update title for accessibility
  const titleEl = modal.querySelector("h2");
  if (titleEl) {
    document.getElementById("authModalTitle").textContent = titleEl.textContent;
  }
}

/**
 * Show error message
 */
function showError(formType, message) {
  const errorEl = document.getElementById(`${formType}Error`);
  if (errorEl) {
    errorEl.textContent = message;
    errorEl.hidden = false;
  }
}

/**
 * Clear error messages
 */
function clearErrors() {
  document.querySelectorAll(".auth-error").forEach((el) => {
    el.hidden = true;
    el.textContent = "";
  });
}

/**
 * Handle login form submission
 */
async function handleLogin(e) {
  e.preventDefault();
  clearErrors();

  const form = e.target;
  const email = form.email.value;
  const password = form.password.value;
  const button = document.getElementById("loginButton");

  button.disabled = true;
  button.textContent = "Logging in...";

  try {
    await login(email, password);
    hideAuthModal();
    form.reset();

    // Show success toast
    if (window.showToast) {
      window.showToast({
        title: "Welcome back!",
        message: "Your progress has been synced from the cloud.",
        type: "success",
        duration: 3000,
      });
    }
  } catch (error) {
    let message = "Login failed. Please check your credentials.";
    if (error.message.includes("Invalid credentials")) {
      message = "Invalid email or password. Please try again.";
    } else if (error.message.includes("network")) {
      message = "Network error. Please check your connection.";
    }
    showError("login", message);
  } finally {
    button.disabled = false;
    button.textContent = "Log In";
  }
}

/**
 * Handle signup form submission
 */
async function handleSignup(e) {
  e.preventDefault();
  clearErrors();

  const form = e.target;
  const name = form.name.value;
  const email = form.email.value;
  const password = form.password.value;
  const button = document.getElementById("signupButton");

  if (password.length < 8) {
    showError("signup", "Password must be at least 8 characters long.");
    return;
  }

  button.disabled = true;
  button.textContent = "Creating account...";

  try {
    await signup(email, password, name);
    hideAuthModal();
    form.reset();

    // Show success toast
    if (window.showToast) {
      window.showToast({
        title: "Account created!",
        message:
          "Welcome to Let's Talk CDC. Your progress will now be saved to the cloud.",
        type: "success",
        duration: 4000,
      });
    }
  } catch (error) {
    let message = "Signup failed. Please try again.";
    if (error.message.includes("already exists") || error.code === 409) {
      message =
        "An account with this email already exists. Please log in instead.";
    } else if (error.message.includes("password")) {
      message = "Password must be at least 8 characters long.";
    } else if (error.message.includes("network")) {
      message = "Network error. Please check your connection.";
    }
    showError("signup", message);
  } finally {
    button.disabled = false;
    button.textContent = "Create Account";
  }
}

/**
 * Create user profile button in header
 */
function createUserProfile() {
  const headerProgress = document.querySelector("[data-header-progress]");
  if (!headerProgress) return;

  const container = headerProgress.parentElement;
  if (!container) return;

  // Remove existing profile if present
  const existing = document.getElementById(USER_PROFILE_ID);
  if (existing) existing.remove();

  const user = getCurrentUser();

  if (user && user.loggedIn) {
    // Show user profile
    const profile = document.createElement("div");
    profile.id = USER_PROFILE_ID;
    profile.className = "user-profile";
    profile.innerHTML = `
      <button type="button" class="user-profile-button" aria-label="User menu" aria-haspopup="true" aria-expanded="false">
        <span class="user-avatar">${user.name.charAt(0).toUpperCase()}</span>
        <span class="user-name">${user.name}</span>
      </button>
      <div class="user-menu hidden" role="menu">
        <div class="user-menu-header">
          <div class="user-menu-name">${user.name}</div>
          <div class="user-menu-email">${user.email}</div>
        </div>
        <button type="button" class="user-menu-item" data-logout role="menuitem">
          <span>Log Out</span>
        </button>
      </div>
    `;

    container.insertBefore(profile, headerProgress);

    // Add menu toggle
    const profileButton = profile.querySelector(".user-profile-button");
    const menu = profile.querySelector(".user-menu");

    profileButton.addEventListener("click", () => {
      const isOpen = !menu.classList.contains("hidden");
      menu.classList.toggle("hidden");
      profileButton.setAttribute("aria-expanded", isOpen ? "false" : "true");
    });

    // Close menu when clicking outside
    document.addEventListener("click", (e) => {
      if (!profile.contains(e.target)) {
        menu.classList.add("hidden");
        profileButton.setAttribute("aria-expanded", "false");
      }
    });

    // Handle logout
    profile
      .querySelector("[data-logout]")
      .addEventListener("click", async () => {
        await logout();
        menu.classList.add("hidden");

        if (window.showToast) {
          window.showToast({
            title: "Logged out",
            message:
              "You have been logged out. Your local progress is still saved.",
            type: "info",
            duration: 3000,
          });
        }
      });
  } else {
    // Show login button
    const loginButton = document.createElement("button");
    loginButton.id = USER_PROFILE_ID;
    loginButton.type = "button";
    loginButton.className = "button secondary login-button";
    loginButton.textContent = "Log In";
    loginButton.setAttribute("aria-label", "Log in to sync your progress");

    loginButton.addEventListener("click", () => showAuthModal("login"));

    container.insertBefore(loginButton, headerProgress);
  }
}

/**
 * Initialize authentication UI
 */
export function initAuthUI() {
  // Create modal structure
  createAuthModal();

  const modal = document.getElementById(AUTH_MODAL_ID);
  if (!modal) return;

  // Tab switching
  modal.querySelectorAll(".auth-tab").forEach((tab) => {
    tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  });

  modal.querySelectorAll("[data-switch-tab]").forEach((button) => {
    button.addEventListener("click", () => switchTab(button.dataset.switchTab));
  });

  // Close modal
  modal
    .querySelector(".auth-modal-close")
    .addEventListener("click", hideAuthModal);
  modal
    .querySelector(".auth-modal-overlay")
    .addEventListener("click", hideAuthModal);

  // Form submissions
  document.getElementById("loginForm").addEventListener("submit", handleLogin);
  document
    .getElementById("signupForm")
    .addEventListener("submit", handleSignup);

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      hideAuthModal();
    }
  });

  // Initialize auth system
  initAuth().then(() => {
    // Create user profile or login button
    createUserProfile();
  });

  // Update UI when auth state changes
  window.addEventListener("cdc:user-logged-in", () => {
    createUserProfile();
  });

  window.addEventListener("cdc:user-logged-out", () => {
    createUserProfile();
  });
}

// Auto-initialize
if (typeof document !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initAuthUI);
  } else {
    initAuthUI();
  }
}
