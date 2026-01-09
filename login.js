// login.js
import { auth, db, googleProvider, githubProvider } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/* ===============================
   HELPER: CREATE OR UPDATE USER DOC
   =============================== */
async function createOrUpdateUserDoc(user) {
  if (!user || !db) return;

  try {
    const userDocRef = doc(db, "users", user.uid);
    await setDoc(
      userDocRef,
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName || null,
        plan: "free",
        signupDate: Timestamp.now(),
        lastLogin: Timestamp.now(),
      },
      { merge: true } // preserves existing fields
    );
    console.log("User document saved/updated:", user.uid);
  } catch (error) {
    console.error("Firestore error:", error);
    if (window.showMessage) window.showMessage("Warning: User document save failed.", true);
  }
}

/* ===============================
   EMAIL/PASSWORD LOGIN
   =============================== */
window.login = async function (email, password, btn) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    const user = userCredential.user;
    await setDoc(doc(db, "users", user.uid), { lastLogin: Timestamp.now() }, { merge: true });
    console.log("Logged in:", user.uid);
    if (window.showMessage) window.showMessage("Login successful!", false);
    setTimeout(() => { window.location.href = "/dashboard.html"; }, 1000);
  } catch (error) {
    console.error(error);
    if (window.showMessage) {
      let msg = "Login failed. Check credentials.";
      if (error.code === "auth/user-not-found") msg = "No account found with this email.";
      else if (error.code === "auth/wrong-password") msg = "Incorrect password.";
      window.showMessage(msg, true);
    }
  }
};

/* ===============================
   EMAIL/PASSWORD SIGNUP
   =============================== */
window.signup = async function (email, password, btn) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);
    await createOrUpdateUserDoc(userCredential.user);
    console.log("Signed up:", userCredential.user.uid);
    if (window.showMessage) window.showMessage("Account created successfully!", false);
    setTimeout(() => { window.location.href = "/dashboard.html"; }, 1000);
  } catch (error) {
    console.error(error);
    if (window.showMessage) {
      let msg = "Sign-up failed.";
      if (error.code === "auth/email-already-in-use") msg = "Email already in use.";
      else if (error.code === "auth/weak-password") msg = "Password too weak.";
      window.showMessage(msg, true);
    }
  }
};

/* ===============================
   GOOGLE LOGIN
   =============================== */
window.googleLogin = async function (btn) {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await createOrUpdateUserDoc(result.user);
    console.log("Google login:", result.user.uid);
    if (window.showMessage) window.showMessage("Logged in with Google!", false);
    setTimeout(() => { window.location.href = "/dashboard.html"; }, 1000);
  } catch (error) {
    console.error(error);
    if (window.showMessage) window.showMessage("Google login failed: " + error.message, true);
  }
};

/* ===============================
   GITHUB LOGIN
   =============================== */
window.githubLogin = async function (btn) {
  try {
    const result = await signInWithPopup(auth, githubProvider);
    await createOrUpdateUserDoc(result.user);
    console.log("GitHub login:", result.user.uid);
    if (window.showMessage) window.showMessage("Logged in with GitHub!", false);
    setTimeout(() => { window.location.href = "/dashboard.html"; }, 1000);
  } catch (error) {
    console.error(error);
    if (window.showMessage) window.showMessage("GitHub login failed: " + error.message, true);
  }
};
