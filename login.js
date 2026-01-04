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
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { auth, db, googleProvider, githubProvider } from "./firebase.js";

/* ---------------- UTILITIES ---------------- */

function showMessage(message, isError) {
  const box = document.getElementById("message-box");
  box.textContent = message;
  box.className =
    "fixed top-6 right-6 z-50 p-4 rounded-xl text-white font-semibold " +
    (isError ? "bg-red-500" : "bg-green-500");
}

function setLoading(btn, state) {
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
      plan: "free",
      createdAt: Timestamp.now(),
    },
    { merge: true }
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
    showMessage("Email already in use", true);
    setLoading(btn, false);
  }
}

export async function googleLogin(btn) {
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, googleProvider);
    if (res.additionalUserInfo?.isNewUser) {
      await createUserDoc(res.user);
    }
    redirectNext();
  } catch {
    showMessage("Google login failed", true);
    setLoading(btn, false);
  }
}

export async function githubLogin(btn) {
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, githubProvider);
    if (res.additionalUserInfo?.isNewUser) {
      await createUserDoc(res.user);
    }
    redirectNext();
  } catch {
    showMessage("GitHub login failed", true);
    setLoading(btn, false);
  }
}

/* ---------------- SESSION ---------------- */

onAuthStateChanged(auth, (user) => {
  if (user) redirectNext();
});
