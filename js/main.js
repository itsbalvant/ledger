import { initFirebase, firebaseConfigured, getAuthInstance, exportUserData } from "./db.js";
import { onAuthChange, register, login, logout, resetPassword, friendlyAuthError } from "./auth.js";
import { initTasks } from "./tasks.js";
import { initReading } from "./reading.js";
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
  b.addEventListener("click", () => { setTheme(b.dataset.theme); updateThemeColorMeta(); });
  b.classList.toggle("active", b.dataset.theme === (themeStored || "auto"));
});

/* ---------------- Palette ---------------- */
const PALETTE_ACCENTS = {
  terracotta: { light: "#b5502f", dark: "#e07a52" },
  ocean: { light: "#2e6f8e", dark: "#5fb8d9" },
  forest: { light: "#3f7d52", dark: "#6fbf82" },
  plum: { light: "#85499c", dark: "#c586d9" },
  slate: { light: "#45505f", dark: "#9fb0c4" },
};
const paletteStored = localStorage.getItem("palette") || "terracotta";
if (paletteStored !== "terracotta") document.documentElement.setAttribute("data-palette", paletteStored);

function setPalette(p) {
  if (p === "terracotta") {
    document.documentElement.removeAttribute("data-palette");
    localStorage.removeItem("palette");
  } else {
    document.documentElement.setAttribute("data-palette", p);
    localStorage.setItem("palette", p);
  }
  document.querySelectorAll(".palette-swatch").forEach((b) => b.classList.toggle("selected", b.dataset.palette === p));
  updateThemeColorMeta();
}
document.querySelectorAll(".palette-swatch").forEach((b) => {
  b.addEventListener("click", () => setPalette(b.dataset.palette));
  b.classList.toggle("selected", b.dataset.palette === paletteStored);
});

function isDarkActive() {
  const explicit = document.documentElement.getAttribute("data-theme");
  if (explicit === "dark") return true;
  if (explicit === "light") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}
function updateThemeColorMeta() {
  const palette = document.documentElement.getAttribute("data-palette") || "terracotta";
  const accents = PALETTE_ACCENTS[palette] || PALETTE_ACCENTS.terracotta;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", isDarkActive() ? accents.dark : accents.light);
}
updateThemeColorMeta();
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", updateThemeColorMeta);

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
  submitBtn.innerHTML = '<span class="btn-spinner"></span>';
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
const exportBtn = document.getElementById("export-btn");
const userEmailEl = document.getElementById("user-email");
const avatarInitial = document.getElementById("avatar-initial");

let currentUser = null;

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

exportBtn.addEventListener("click", async () => {
  if (!currentUser) return;
  exportBtn.disabled = true;
  const original = exportBtn.textContent;
  exportBtn.textContent = "Exporting…";
  try {
    const data = await exportUserData(currentUser.uid);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-backup-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    showToast("Backup downloaded");
  } catch (e) {
    showToast("Export failed: " + e.message);
  } finally {
    exportBtn.disabled = false;
    exportBtn.textContent = original;
  }
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
    currentUser = user;
    if (user) {
      authScreen.classList.add("hidden");
      appShell.classList.remove("hidden");
      userEmailEl.textContent = user.email || "";
      avatarInitial.textContent = (user.displayName || user.email || "?")[0].toUpperCase();

      activeModules.push(initTasks({ root: document.getElementById("view-tasks"), uid: user.uid, showToast }));
      activeModules.push(initReading({ root: document.getElementById("view-reading"), uid: user.uid, showToast }));
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
