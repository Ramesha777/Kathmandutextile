// auth-guard.js – protects admin, employee, manager pages; redirects to login if not authenticated
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";
import { firebaseConfig } from "../backend/firebaseconfig.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

function getRequiredRole() {
  const role = document.body.getAttribute('data-required-role');
  return (role || '').trim();
}

async function getUserRole(uid) {
  const userRef = doc(db, 'users', uid);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return null;
  const data = userSnap.data();
  return (data.role || '').trim();
}

function redirectToLogin() {
  window.location.replace('login.html');
}

function redirectByRole(role) {
  if (role === 'admin') {
    window.location.replace('admin.html');
    return;
  }
  if (role === 'employee') {
    window.location.replace('employee.html');
    return;
  }
  if (role === 'Manager') {
    window.location.replace('manager.html');
    return;
  }
  redirectToLogin();
}

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    redirectToLogin();
    return;
  }

  const requiredRole = getRequiredRole();
  if (!requiredRole) return;

  const userRole = await getUserRole(user.uid);
  if (!userRole) {
    redirectToLogin();
    return;
  }

  if (userRole !== requiredRole) {
    redirectByRole(userRole);
  }
});
