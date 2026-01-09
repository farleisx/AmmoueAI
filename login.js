// login.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-app.js";
import {
  getAuth,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  onAuthStateChanged,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  setDoc,
  serverTimestamp,
  Timestamp,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";
import { googleProvider, githubProvider, firebaseConfig } from "./firebase.js";

let auth = null;
let db = null;

/* ---------------- FIRESTORE ---------------- */
async function createUserDocument(user) {
  if (!db) return;
  try {
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(
      userDocRef,
      {
        uid: user.uid,
        email: user.email || null,
        displayName: user.displayName || null,
        plan: "free",
        signupDate: Timestamp.now(),
        lastLogin: Timestamp.now(),
        serverTimestamp: serverTimestamp(),
      },
      { merge: true } // merge ensures we don’t delete existing fields
    );
  } catch (error) {
    console.error("Firestore error:", error);
    showMessage("Warning: Account created, but profile save failed.", true);
  }
}

/* ---------------- INIT ---------------- */
export async function initializeAppAndAuth() {
  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    onAuthStateChanged(auth, async (user) => {
      if (user) {
        await createUserDocument(user); // update lastLogin for existing users
        showMessage(`Welcome back! Redirecting...`, false);
        setTimeout(redirectToNextPage, 1000);
      }
    });
  } catch (error) {
    console.error(error);
    showMessage("Firebase initialization failed.", true);
  }
}

/* ---------------- AUTH ACTIONS ---------------- */
export async function login(email, password, btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    await createUserDocument(userCredential.user);
    showMessage("Login successful!", false);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    let msg = "Login failed. Please check credentials.";
    if (error.code === "auth/user-not-found") msg = "No account found with this email.";
    if (error.code === "auth/wrong-password") msg = "Incorrect password.";
    showMessage(msg, true);
    setLoading(btn, false);
  }
}

export async function signup(email, password, btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await createUserDocument(userCredential.user);
    showMessage("Account created successfully!", false);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    let msg = "Sign-up failed.";
    if (error.code === "auth/email-already-in-use") msg = "Email already in use.";
    showMessage(msg, true);
    setLoading(btn, false);
  }
}

export async function googleLogin(btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, googleProvider);
    await createUserDocument(res.user);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    console.error(error);
    showMessage("Google login failed", true);
    setLoading(btn, false);
  }
}

export async function githubLogin(btn) {
  if (!auth) return;
  setLoading(btn, true);
  try {
    const res = await signInWithPopup(auth, githubProvider);
    await createUserDocument(res.user);
    setTimeout(redirectToNextPage, 1000);
  } catch (error) {
    console.error(error);
    showMessage("GitHub login failed", true);
    setLoading(btn, false);
  }
}

/* ---------------- WINDOW BINDINGS ---------------- */
window.handleLogin = (e) => {
  e.preventDefault();
  const btn = document.getElementById("login-btn");
  const email = document.getElementById("login-email").value;
  const password = document.getElementById("login-password").value;
  login(email, password, btn);
};

window.handleSignup = (e) => {
  e.preventDefault();
  const btn = document.getElementById("signup-btn");
  const email = document.getElementById("signup-email").value;
  const password = document.getElementById("signup-password").value;
  signup(email, password, btn);
};

window.handleGoogleAuth = (btn) => googleLogin(btn);
window.handleGitHubAuth = (btn) => githubLogin(btn);
