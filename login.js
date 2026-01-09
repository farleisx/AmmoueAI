// login.js
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
  getAuth,
  GoogleAuthProvider,
  GithubAuthProvider
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

import {
  doc,
  setDoc,
  Timestamp,
  serverTimestamp,
  getFirestore
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";

// ---------------- CONFIG ----------------
const firebaseConfig = {
  apiKey: "AIzaSyAmnZ69YDcEFcmuXIhmGxDUSPULxpI-Bmg",
  authDomain: "ammoueai.firebaseapp.com",
  projectId: "ammoueai",
  storageBucket: "ammoueai.firebasestorage.app",
  messagingSenderId: "135818868149",
  appId: "1:135818868149:web:db9280baf9540a3339d5fc",
};

let auth, db;
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

// ---------------- UTILITIES ----------------
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

function redirectToNextPage() {
  const params = new URLSearchParams(window.location.search);
  const path = params.get("redirect") || "/dashboard";
  window.location.href = path;
}

// ---------------- FIRESTORE ----------------
async function createUserDocument(user, isNewUser = false) {
  if (!db) return;
  try {
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(
      userDocRef,
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        plan: "free",
        createdAt: isNewUser ? serverTimestamp() : undefined, // only set once
        signupDate: isNewUser ? serverTimestamp() : undefined,
        lastLogin: serverTimestamp(),
      },
      { merge: true }
    );
  } catch (error) {
    console.error("Firestore error:", error);
    showMessage(
      "Warning: Account created, but profile save failed.",
      true
    );
  }
}

// ---------------- FIREBASE INIT ----------------
async function initializeAppAndAuth() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await createUserDocument(user, false); // update lastLogin on every login
        showMessage(`Welcome back! Redirecting...`, false);
        setTimeout(redirectToNextPage, 1000);
      }
    });
  } catch (error) {
    showMessage("Firebase initialization failed.", true);
    console.error(error);
  }
}

initializeAppAndAuth();

// ---------------- AUTH ACTIONS ----------------
window.handleLogin = async function (event) {
  event.preventDefault();
  if (!auth) return;
  const loginBtn = document.getElementById("login-btn");
  setLoading(loginBtn, true);

  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;

  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await createUserDocument(userCredential.user, false); // update lastLogin
    showMessage("Login successful!", false);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    let msg = "Login failed. Please check credentials.";
    if (error.code === "auth/user-not-found")
      msg = "No account found with this email.";
    showMessage(msg, true);
    setLoading(loginBtn, false);
  }
};

window.handleSignup = async function (event) {
  event.preventDefault();
  if (!auth) return;
  const signupBtn = document.getElementById("signup-btn");
  setLoading(signupBtn, true);

  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;

  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await createUserDocument(userCredential.user, true);
    showMessage("Account created successfully!", false);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    let msg = "Sign-up failed.";
    if (error.code === "auth/email-already-in-use") msg = "Email already in use.";
    showMessage(msg, true);
    setLoading(signupBtn, false);
  }
};

window.handleGoogleAuth = async function (btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, googleProvider);
    const isNew = res.additionalUserInfo?.isNewUser || false;
    await createUserDocument(res.user, isNew);
    redirectToNextPage();
  } catch (error) {
    showMessage("Google login failed.", true);
    setLoading(btn, false);
  }
};

window.handleGitHubAuth = async function (btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, githubProvider);
    const isNew = res.additionalUserInfo?.isNewUser || false;
    await createUserDocument(res.user, isNew);
    redirectToNextPage();
  } catch (error) {
    showMessage("GitHub login failed.", true);
    setLoading(btn, false);
  }
};
