// punch.js — Barcode punch kiosk: In/Out, 5-min cooldown, daily reset
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getFirestore,
  collection,
  getDocs,
  addDoc,
  query,
  where,
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const COOLDOWN_MINUTES = 5;
const COLLECTION_EMPLOYEES = "employees";
const COLLECTION_PUNCHES = "punchRecords";

/** Must match punchrecords.js — attendance “day” label for night shifts (6 AM cutover). */
const ATTENDANCE_CUTOVER_HOUR = 6;
const ATTENDANCE_CUTOVER_MINUTE = 0;

const MAX_SHIFT_HOURS = 12;
const MAX_SHIFT_MS = MAX_SHIFT_HOURS * 60 * 60 * 1000;

function ymdLocal(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getAttendanceDateStrFromDate(d) {
  const y = d.getFullYear();
  const m = d.getMonth();
  const day = d.getDate();
  const mins = d.getHours() * 60 + d.getMinutes();
  const cutM = ATTENDANCE_CUTOVER_HOUR * 60 + ATTENDANCE_CUTOVER_MINUTE;
  let ref = new Date(y, m, day);
  if (mins < cutM) ref.setDate(ref.getDate() - 1);
  return `${ref.getFullYear()}-${String(ref.getMonth() + 1).padStart(2, "0")}-${String(ref.getDate()).padStart(2, "0")}`;
}

let employeesCache = [];
let lastPunchTime = 0;
let scannerResetTimer = null;
let processingEmployeeId = null; // prevents race when same employee punches twice quickly

const RESET_SCANNER_DELAY_MS = 5000;
const DEFAULT_MESSAGE = "Scan your barcode to punch";

const timeEl = document.getElementById("punch-time");
const messageEl = document.getElementById("punch-message");
const barcodeInput = document.getElementById("punch-barcode-input");

function getTodayStr() {
  return new Date().toISOString().slice(0, 10);
}

function formatTime(date) {
  const d = date || new Date();
  const hours = d.getHours();
  const mins = d.getMinutes();
  const ampm = hours >= 12 ? "PM" : "AM";
  const h = hours % 12 || 12;
  return `${String(h).padStart(2, "0")}:${String(mins).padStart(2, "0")} ${ampm}`;
}

function updateClock() {
  if (timeEl) timeEl.textContent = formatTime();
}

function showMessage(text, isError = false) {
  if (messageEl) {
    messageEl.textContent = text;
    messageEl.classList.toggle("error", isError);
  }
}

function showTickMark(show) {
  const tickEl = document.getElementById("punch-tick");
  if (!tickEl) return;
  tickEl.classList.toggle("show", !!show);
}

function scheduleScannerReset() {
  if (scannerResetTimer) clearTimeout(scannerResetTimer);
  scannerResetTimer = setTimeout(() => {
    showMessage(DEFAULT_MESSAGE, false);
    showTickMark(false);
    if (barcodeInput) {
      barcodeInput.value = "";
      barcodeInput.focus();
    }
    scannerResetTimer = null;
  }, RESET_SCANNER_DELAY_MS);
}

function findEmployeeByBarcode(barcode) {
  const val = String(barcode || "").trim();
  if (!val) return null;
  return (
    employeesCache.find((e) => e.id === val) ||
    employeesCache.find((e) => (e.barcode || "").toString().trim() === val)
  ) || null;
}

async function loadEmployees() {
  try {
    const snap = await getDocs(collection(db, COLLECTION_EMPLOYEES));
    employeesCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (err) {
    console.error("Failed to load employees:", err);
  }
}

async function getTodayPunchesForEmployee(employeeId) {
  const now = new Date();
  const attendanceDay = getAttendanceDateStrFromDate(now);
  const calDay = ymdLocal(now);
  const dateKeys = attendanceDay === calDay ? [attendanceDay] : [attendanceDay, calDay];
  try {
    const byId = new Map();
    for (const dk of dateKeys) {
      const q = query(
        collection(db, COLLECTION_PUNCHES),
        where("employeeId", "==", employeeId),
        where("date", "==", dk)
      );
      const snap = await getDocs(q);
      snap.docs.forEach((docSnap) => {
        byId.set(docSnap.id, { id: docSnap.id, ...docSnap.data() });
      });
    }
    let punches = [...byId.values()];
    punches = punches.filter((p) => {
      const t = parsePunchTimestamp(p);
      if (!t) return (p.date || "") === attendanceDay;
      return getAttendanceDateStrFromDate(t) === attendanceDay;
    });
    punches.sort((a, b) => {
      const ta = a.timestamp?.toDate ? a.timestamp.toDate().getTime() : new Date(a.timestamp || 0).getTime();
      const tb = b.timestamp?.toDate ? b.timestamp.toDate().getTime() : new Date(b.timestamp || 0).getTime();
      return tb - ta;
    });
    return punches;
  } catch (err) {
    console.error("Failed to get punches:", err);
    return [];
  }
}

// Alternates In/Out: if last punch was In (in building), next is Out (out of building), and vice versa
function getNextPunchType(todayPunches) {
  if (!todayPunches || todayPunches.length === 0) return "in";
  const last = todayPunches[0];
  return (last.type || "in").toLowerCase() === "in" ? "out" : "in";
}

function parsePunchTimestamp(punch) {
  const ts = punch?.timestamp;
  if (!ts) return null;
  if (typeof ts.toDate === "function") return ts.toDate();
  if (ts.seconds != null) return new Date(ts.seconds * 1000);
  if (ts instanceof Date) return ts;
  return new Date(ts);
}

function getAttendanceWindowBounds(attendanceDateStr) {
  const [y, mo, da] = attendanceDateStr.split("-").map(Number);
  const start = new Date(y, mo - 1, da, ATTENDANCE_CUTOVER_HOUR, ATTENDANCE_CUTOVER_MINUTE, 0, 0);
  const end = new Date(y, mo - 1, da + 1, ATTENDANCE_CUTOVER_HOUR, ATTENDANCE_CUTOVER_MINUTE, 0, 0);
  return { startMs: start.getTime(), endMs: end.getTime() };
}

/** Same rules as punchrecords.js — sum In→Out segments + open In within the attendance window. */
function computeTotalMsInsideKiosk(sortedAsc, attendanceDateStr) {
  const { startMs, endMs } = getAttendanceWindowBounds(attendanceDateStr);
  const now = Date.now();
  const inCurrentWindow = now >= startMs && now < endMs;
  let total = 0;
  let i = 0;
  const n = sortedAsc.length;
  while (i < n) {
    if (sortedAsc[i].type !== "in") {
      i++;
      continue;
    }
    const start = sortedAsc[i].timeMs;
    if (i + 1 < n && sortedAsc[i + 1].type === "out") {
      total += Math.max(0, sortedAsc[i + 1].timeMs - start);
      i += 2;
    } else {
      let endCap = endMs;
      if (inCurrentWindow) endCap = Math.min(now, endMs);
      total += Math.max(0, endCap - start);
      i++;
    }
  }
  return total;
}

function buildMergedTimeline(punches, nextType, nowMs) {
  const rows = punches.map((p) => {
    const t = parsePunchTimestamp(p);
    const timeMs = t ? t.getTime() : 0;
    const typ = (p.type || "in").toLowerCase() === "out" ? "out" : "in";
    return { id: p.id || "", type: typ, timeMs };
  });
  rows.push({ id: "_new", type: nextType, timeMs: nowMs });
  rows.sort((a, b) => {
    if (a.timeMs !== b.timeMs) return a.timeMs - b.timeMs;
    if (a.type !== b.type) return a.type === "in" ? -1 : 1;
    return String(a.id).localeCompare(String(b.id));
  });
  return rows;
}

function validateAlternatingTimelineKiosk(sorted) {
  if (sorted.length === 0) return true;
  if (sorted[0].type !== "in") return false;
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i].type === sorted[i - 1].type) return false;
  }
  return true;
}

async function processPunch(barcode) {
  const emp = findEmployeeByBarcode(barcode);
  if (!emp) {
    showTickMark(false);
    showMessage("Employee not found. Please check your barcode.", true);
    scheduleScannerReset();
    return { success: false, message: "Employee not found. Please check your ID.", isError: true };
  }

  const employeeId = emp.id;

  // Prevent same employee from punching twice before first request completes (race fix)
  if (processingEmployeeId === employeeId) {
    showTickMark(false);
    showMessage("Please wait, processing...", true);
    scheduleScannerReset();
    return { success: false, message: "Please wait, processing...", isError: true };
  }
  processingEmployeeId = employeeId;
  const employeeName = emp.fullName || emp.name || emp.email || emp.id;
  const now = new Date();
  const attendanceDay = getAttendanceDateStrFromDate(now);

  const todayPunches = await getTodayPunchesForEmployee(employeeId);
  const nextType = getNextPunchType(todayPunches);

  // 5-minute cooldown: if same employee scans again within 5 min, do not record; show message
  if (todayPunches.length > 0) {
    const lastPunch = todayPunches[0];
    const lastTs = parsePunchTimestamp(lastPunch);
    if (!lastTs) {
      processingEmployeeId = null;
      showTickMark(false);
      showMessage("Unable to read last punch time. Please try again.", true);
      scheduleScannerReset();
      return { success: false, message: "Unable to read last punch time.", isError: true };
    }
    const diffMs = now.getTime() - lastTs.getTime();
    const diffMinutes = diffMs / (60 * 1000);
    if (diffMinutes < COOLDOWN_MINUTES) {
      processingEmployeeId = null;
      showTickMark(false);
      showMessage("Too soon. Punch not recorded. Try again after 5 minutes.", true);
      scheduleScannerReset();
      return { success: false, message: "Too soon. Punch not recorded. Try again after 5 minutes.", isError: true };
    }
  }

  const mergedTimeline = buildMergedTimeline(todayPunches, nextType, now.getTime());
  if (!validateAlternatingTimelineKiosk(mergedTimeline)) {
    processingEmployeeId = null;
    showTickMark(false);
    showMessage("Punch sequence conflict. Please contact admin.", true);
    scheduleScannerReset();
    return { success: false, message: "Punch sequence conflict.", isError: true };
  }
  const totalAfter = computeTotalMsInsideKiosk(mergedTimeline, attendanceDay);
  if (totalAfter > MAX_SHIFT_MS) {
    processingEmployeeId = null;
    showTickMark(false);
    showMessage(
      `Maximum shift is ${MAX_SHIFT_HOURS} hours in the building for this attendance day. Contact admin if you need changes.`,
      true
    );
    scheduleScannerReset();
    return {
      success: false,
      message: `Maximum ${MAX_SHIFT_HOURS}h shift`,
      isError: true,
    };
  }

  try {
    await addDoc(collection(db, COLLECTION_PUNCHES), {
      employeeId,
      employeeName,
      type: nextType,
      date: attendanceDay,
      timestamp: now,
    });

    const typeLabel = nextType === "in" ? "Employee is in the building" : "Employee is out of the building";
    const msg = `Punch of ${employeeName} accepted. ${typeLabel}`;
    showMessage(msg, false);
    showTickMark(true);
    lastPunchTime = Date.now();
    scheduleScannerReset();
    return { success: true, message: msg, isError: false };
  } catch (err) {
    console.error("Punch failed:", err);
    showTickMark(false);
    showMessage("Failed to record punch. Please try again.", true);
    scheduleScannerReset();
    return { success: false, message: "Failed to record punch. Please try again.", isError: true };
  } finally {
    processingEmployeeId = null;
  }
}

function onBarcodeSubmit(e) {
  e.preventDefault();
  const val = barcodeInput?.value?.trim();
  if (!val) return;
  barcodeInput.value = "";
  processPunch(val);
}

function init() {
  updateClock();
  setInterval(updateClock, 1000);

  loadEmployees();
  setInterval(loadEmployees, 60 * 1000);

  if (barcodeInput) {
    barcodeInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        onBarcodeSubmit(e);
      }
    });
    barcodeInput.addEventListener("input", () => {
      if (barcodeInput.value && barcodeInput.value.length > 3 && !barcodeInput.dataset.listening) {
        barcodeInput.dataset.listening = "1";
      }
    });
  }

  document.addEventListener("click", (e) => {
    if (!e.target.closest("#punch-modal-overlay") && !e.target.closest("#punch-manual-btn"))
      barcodeInput?.focus();
  });
  barcodeInput?.focus();

  const manualBtn = document.getElementById("punch-manual-btn");
  const modalOverlay = document.getElementById("punch-modal-overlay");
  const manualIdInput = document.getElementById("punch-manual-id");
  const modalCancel = document.getElementById("punch-modal-cancel");
  const modalPunch = document.getElementById("punch-modal-punch");

  if (manualBtn && modalOverlay) {
    const modalResultEl = document.getElementById("punch-modal-result");
    manualBtn.addEventListener("click", () => {
      modalOverlay.classList.add("show");
      if (manualIdInput) {
        manualIdInput.value = "";
        manualIdInput.focus();
      }
      if (modalResultEl) {
        modalResultEl.textContent = "";
        modalResultEl.classList.remove("success", "error");
      }
    });
  }

  if (modalCancel && modalOverlay) {
    modalCancel.addEventListener("click", () => {
      modalOverlay.classList.remove("show");
      barcodeInput?.focus();
    });
  }

  if (modalPunch && modalOverlay && manualIdInput) {
    const modalResult = document.getElementById("punch-modal-result");
    const doManualPunch = async () => {
      const val = manualIdInput.value.trim();
      if (!val) return;
      modalPunch.disabled = true;
      if (modalResult) {
        modalResult.textContent = "Processing...";
        modalResult.classList.remove("success", "error");
      }
      const result = await processPunch(val);
      if (modalResult && result) {
        modalResult.textContent = result.message;
        modalResult.classList.add(result.isError ? "error" : "success");
      }
      manualIdInput.value = "";
      modalPunch.disabled = false;
      setTimeout(() => {
        modalOverlay.classList.remove("show");
        if (modalResult) modalResult.textContent = "";
        barcodeInput?.focus();
      }, 1500);
    };
    modalPunch.addEventListener("click", doManualPunch);
    manualIdInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doManualPunch();
      }
    });
  }
}

init();
