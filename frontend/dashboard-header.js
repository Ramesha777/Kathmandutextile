/**
 * Shared dashboard header component (modular Firebase SDK)
 * Shows current date/time, logged-in user name (bold), compact sign-out button, greeting
 */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

let headerUserEl, headerDateTimeEl, logoutBtn;

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str || "";
  return d.innerHTML;
}

function initHeader() {
  headerUserEl =
    document.getElementById("dashboard-user") ||
    document.querySelector(".dashboard-header-user") ||
    document.querySelector("header [data-user]");
  headerDateTimeEl =
    document.getElementById("dashboard-datetime") ||
    document.querySelector(".dashboard-header-datetime") ||
    document.querySelector("header [data-datetime]");
  logoutBtn =
    document.getElementById("compact-logout") ||
    document.getElementById("btnSignOut") ||
    document.getElementById("logoutBtn") ||
    document.querySelector('header button[type="button"]');

  updateDateTime();
  setupClock();
  setupCompactLogout();

  onAuthStateChanged(auth, (user) => {
    if (user) {
      resolveAndGreet(user);
    } else {
      showGreeting("User");
    }
  });
}

async function resolveAndGreet(user) {
  let displayName = "";

  // 1. Try users/{uid} in Firestore
  try {
    const userSnap = await getDoc(doc(db, "users", user.uid));
    if (userSnap.exists()) {
      const d = userSnap.data();
      displayName = d.fullName || d.displayName || d.name || "";
    }
  } catch (_) {
    /* ignore */
  }

  // 2. Try employees collection — match by uid or email
  if (!displayName) {
    try {
      const empSnap = await getDocs(collection(db, "employees"));
      const email = (user.email || "").toLowerCase().trim();
      for (const d of empSnap.docs) {
        const e = d.data();
        const empEmail = (e.email || "").toLowerCase().trim();
        if (d.id === user.uid || (email && empEmail === email)) {
          displayName = e.fullName || e.name || "";
          if (displayName) break;
        }
      }
    } catch (_) {
      /* ignore */
    }
  }

  // 3. Firebase Auth displayName
  if (!displayName) {
    displayName = user.displayName || "";
  }

  // 4. Fallback
  if (!displayName) {
    displayName = "User";
  }

  sessionStorage.setItem("userName", displayName);
  showGreeting(displayName, user);
}

function showGreeting(displayName, user) {
  if (!headerUserEl) return;
  const hour = new Date().getHours();
  const greeting =
    hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  headerUserEl.innerHTML =
    `${escapeHtml(greeting)}, <strong style="color:#f59e0b;font-weight:700;">${escapeHtml(displayName)}</strong>`;
  headerUserEl.title = "Logged in as: " + (user?.email || displayName);
}

function updateDateTime() {
  if (!headerDateTimeEl) return;
  const now = new Date();
  const timeStr = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const dateStr = now.toLocaleDateString("en-NP", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  headerDateTimeEl.innerHTML =
    '<span class="datetime-date">' + dateStr + "</span>" +
    '<span class="datetime-time">' + timeStr + "</span>";
}

function setupClock() {
  setInterval(updateDateTime, 30000);
}

function setupCompactLogout() {
  if (!logoutBtn) return;
  logoutBtn.addEventListener("click", async () => {
    try {
      await signOut(auth);
    } catch (e) {
      console.error("Sign out error:", e);
    }
    sessionStorage.clear();
    window.location.href = "login.html";
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initHeader);
} else {
  initHeader();
}
