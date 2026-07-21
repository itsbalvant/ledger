import { initFirebase, firebaseConfigured, getAuthInstance } from "./db.js";
import { onAuthChange, register, login, logout, resetPassword, friendlyAuthError } from "./auth.js";
import { initTasks } from "./tasks.js";
import { initReading } from "./reading.js";
import { initNotes } from "./notes.js";
import { initFinance } from "./finance.js";

const authScreen = document.getElementById("auth-screen");
const appShell = document.getElementById("app-shell");
const authError = document.getElementById("auth-error");
const configWarning = document.getElementById("config-warning");
const toastEl = document.getElementById("toast");

let toastTimer;
function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.remove("show"), 3200);
}
window.showToast = showToast;

/* ---------------- Theme ---------------- */
const themeStored = localStorage.getItem("theme");
if (themeStored) document.documentElement.setAttribute("data-theme", themeStored);
function setTheme(t) {
  if (t === "auto") {
    document.documentElement.removeAttribute("data-theme");
    localStorage.removeItem("theme");
  } else {
    document.documentElement.setAttribute("data-theme", t);
    localStorage.setItem("theme", t);
  }
  document.querySelectorAll(".theme-toggle button").forEach((b) =>
    b.classList.toggle("active", b.dataset.theme === (t || "auto"))
  );
}
document.querySelectorAll(".theme-toggle button").forEach((b) => {
  b.addEventListener("click", () => setTheme(b.dataset.theme));
  b.classList.toggle("active", b.dataset.theme === (themeStored || "auto"));
});

/* ---------------- Auth screen ---------------- */
if (!firebaseConfigured) {
  configWarning.classList.remove("hidden");
  configWarning.classList.add("show");
} else {
  initFirebase();
}

let mode = "login"; // login | register
const nameField = document.getElementById("name-field");
const nameInput = document.getElementById("name-input");
const emailInput = document.getElementById("email-input");
const passwordInput = document.getElementById("password-input");
const submitBtn = document.getElementById("auth-submit");
const switchBtn = document.getElementById("auth-switch-btn");
const switchLabel = document.getElementById("auth-switch-label");
const authTitle = document.getElementById("auth-title");
const forgotBtn = document.getElementById("forgot-btn");

function setMode(m) {
  mode = m;
  const isRegister = m === "register";
  nameField.classList.toggle("hidden", !isRegister);
  authTitle.textContent = isRegister ? "Create your account" : "Welcome back";
  submitBtn.textContent = isRegister ? "Create account" : "Log in";
  switchLabel.textContent = isRegister ? "Already have an account?" : "New here?";
  switchBtn.textContent = isRegister ? "Log in" : "Create one";
  authError.classList.remove("show");
}
switchBtn.addEventListener("click", () => setMode(mode === "login" ? "register" : "login"));
setMode("login");

forgotBtn.addEventListener("click", async () => {
  const email = emailInput.value.trim();
  if (!email) {
    authError.textContent = "Enter your email above first, then tap 'Forgot password'.";
    authError.classList.add("show");
    return;
  }
  try {
    await resetPassword(email);
    showToast("Password reset email sent.");
  } catch (e) {
    authError.textContent = friendlyAuthError(e);
    authError.classList.add("show");
  }
});

document.getElementById("auth-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  if (!firebaseConfigured) {
    authError.textContent = "Firebase isn't configured yet — see js/firebase-config.js.";
    authError.classList.add("show");
    return;
  }
  authError.classList.remove("show");
  submitBtn.disabled = true;
  submitBtn.textContent = "Please wait…";
  try {
    if (mode === "register") {
      await register(nameInput.value.trim(), emailInput.value.trim(), passwordInput.value);
    } else {
      await login(emailInput.value.trim(), passwordInput.value);
    }
  } catch (err) {
    authError.textContent = friendlyAuthError(err);
    authError.classList.add("show");
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = mode === "register" ? "Create account" : "Log in";
  }
});

/* ---------------- App shell / nav ---------------- */
const navButtons = document.querySelectorAll(".nav-btn[data-view]");
const views = document.querySelectorAll(".view");
function switchView(name) {
  navButtons.forEach((b) => b.classList.toggle("active", b.dataset.view === name));
  views.forEach((v) => v.classList.toggle("active", v.id === "view-" + name));
}
navButtons.forEach((b) => b.addEventListener("click", () => switchView(b.dataset.view)));

const settingsBtn = document.getElementById("settings-btn");
const avatarBtn = document.getElementById("avatar-btn");
const settingsBackdrop = document.getElementById("settings-backdrop");
const closeSettingsBtn = document.getElementById("close-settings-btn");
const logoutBtn = document.getElementById("logout-btn");
const userEmailEl = document.getElementById("user-email");
const avatarInitial = document.getElementById("avatar-initial");

settingsBtn.addEventListener("click", () => settingsBackdrop.classList.remove("hidden"));
avatarBtn.addEventListener("click", () => settingsBackdrop.classList.remove("hidden"));
closeSettingsBtn.addEventListener("click", () => settingsBackdrop.classList.add("hidden"));
settingsBackdrop.addEventListener("click", (e) => {
  if (e.target === settingsBackdrop) settingsBackdrop.classList.add("hidden");
});
logoutBtn.addEventListener("click", async () => {
  await logout();
  settingsBackdrop.classList.add("hidden");
});

/* ---------------- Wire feature modules to auth state ---------------- */
let activeModules = [];
function teardownModules() {
  activeModules.forEach((m) => m?.destroy && m.destroy());
  activeModules = [];
}

if (firebaseConfigured) {
  onAuthChange((user) => {
    teardownModules();
    if (user) {
      authScreen.classList.add("hidden");
      appShell.classList.remove("hidden");
      userEmailEl.textContent = user.email || "";
      avatarInitial.textContent = (user.displayName || user.email || "?")[0].toUpperCase();

      activeModules.push(initTasks({ root: document.getElementById("view-tasks"), uid: user.uid, showToast }));
      activeModules.push(initReading({ root: document.getElementById("view-reading"), uid: user.uid, showToast }));
      activeModules.push(initNotes({ root: document.getElementById("view-notes"), uid: user.uid, showToast }));
      activeModules.push(initFinance({ root: document.getElementById("view-finance"), uid: user.uid, showToast }));
    } else {
      appShell.classList.add("hidden");
      authScreen.classList.remove("hidden");
    }
  });
}

/* ---------------- Online/offline indicator ---------------- */
function updateSyncDots() {
  document.querySelectorAll(".sync-dot").forEach((d) => {
    d.classList.toggle("offline", !navigator.onLine);
    d.classList.toggle("synced", navigator.onLine);
    d.title = navigator.onLine ? "Synced" : "Offline — changes will sync when you're back online";
  });
}
window.addEventListener("online", updateSyncDots);
window.addEventListener("offline", updateSyncDots);
updateSyncDots();

/* ---------------- Service worker ---------------- */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
