// login.js
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  doc,
  setDoc,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { auth, db, googleProvider, githubProvider } from "./firebase.js";

/* ---------------- UTILITIES ---------------- */

function showMessage(message, isError = false) {
  const box = document.getElementById("message-box");
  if (!box) return;
  box.textContent = message;
  box.className =
    "fixed top-6 right-6 z-50 p-4 rounded-xl text-white font-semibold " +
    (isError ? "bg-red-500" : "bg-green-500");
}

function setLoading(btn, state) {
  if (!btn) return;
  btn.disabled = state;
  btn.style.opacity = state ? "0.7" : "1";
}

function redirectNext() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("redirect") || "/dashboard";
  window.location.href = path;
}

/* ---------------- FIRESTORE ---------------- */

async function createUserDoc(user) {
  await setDoc(
    doc(db, "users", user.uid),
    {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || null, // null if not set
      plan: "free",
      signupDate: serverTimestamp(),
    },
    { merge: true } // won't overwrite existing fields
  );
}

/* ---------------- AUTH ACTIONS ---------------- */

export async function login(email, password, btn) {
  setLoading(btn, true);
  try {
    await signInWithEmailAndPassword(auth, email, password);
    showMessage("Login successful", false);
    redirectNext();
  } catch (e) {
    console.error(e);
    showMessage("Invalid credentials", true);
    setLoading(btn, false);
  }
}

export async function signup(email, password, btn) {
  setLoading(btn, true);
  try {
    const res = await createUserWithEmailAndPassword(auth, email, password);
    await createUserDoc(res.user);
    showMessage("Account created", false);
    redirectNext();
  } catch (e) {
    console.error(e);
    showMessage("Email already in use", true);
    setLoading(btn, false);
  }
}

export async function googleLogin(btn) {
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, googleProvider);
    if (res.user) {
      // Save displayName from Google
      await createUserDoc(res.user);
    }
    redirectNext();
  } catch (e) {
    console.error(e);
    showMessage("Google login failed", true);
    setLoading(btn, false);
  }
}

export async function githubLogin(btn) {
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, githubProvider);
    if (res.user) {
      // Save displayName from GitHub (may be null)
      await createUserDoc(res.user);
    }
    redirectNext();
  } catch (e) {
    console.error(e);
    showMessage("GitHub login failed", true);
    setLoading(btn, false);
  }
}

/* ---------------- SESSION ---------------- */

// Automatically redirect logged-in users
onAuthStateChanged(auth, (user) => {
  if (user) redirectNext();
});
