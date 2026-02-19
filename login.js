// login.js
import { auth, db, googleProvider, githubProvider, onAuthChange, sendPasswordResetEmail } from './firebase.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup, GithubAuthProvider } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";
import { doc, setDoc, Timestamp } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

let pendingCredential = null;
let conflictingEmail = null;

// ----------------- UI Utilities -----------------
export function showMessage(message, isError) {
    const msgBox = document.getElementById('message-box');
    msgBox.textContent = message;
    msgBox.classList.remove('bg-green-500', 'bg-red-500', 'opacity-0', 'translate-y-[-20px]');
    msgBox.classList.add(isError ? 'bg-red-500' : 'bg-green-500', 'opacity-100', 'translate-y-0');

    setTimeout(() => {
        msgBox.classList.add('opacity-0', 'translate-y-[-20px]');
    }, 4000);
}

export function setLoading(button, isLoading) {
    if (isLoading) {
        button.disabled = true;
        button.setAttribute('data-original-text', button.innerHTML);
        button.innerHTML = `<i data-lucide="loader-2" class="w-4 h-4 mr-2 animate-spin"></i> Authenticating...`;
    } else {
        button.disabled = false;
        button.innerHTML = button.getAttribute('data-original-text');
    }
}

function getRedirectPath() {
    const params = new URLSearchParams(window.location.search);
    const path = params.get('redirect') ? decodeURIComponent(params.get('redirect')) : '/dashboard';
    return path.startsWith('/') ? path.substring(1) : path;
}

function redirectToNextPage() {
    window.location.href = getRedirectPath();
}

// ----------------- Firestore -----------------
async function createUserDocument(user) {
    try {
        const userDocRef = doc(db, "users", user.uid);
        await setDoc(userDocRef, {
            uid: user.uid,
            email: user.email,
            displayName: user.displayName || null,
            plan: "free",
            signupDate: Timestamp.now(),
            lastLogin: Timestamp.now()
        }, { merge: true });
    } catch (error) {
        console.error("Firestore error:", error);
        showMessage("Warning: Account created, but profile save failed.", true);
    }
}

// ----------------- Auth Handlers -----------------
export async function handleLogin(event) {
    event.preventDefault();
    const loginBtn = document.getElementById('login-btn');
    setLoading(loginBtn, true);
    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;

    try {
        await signInWithEmailAndPassword(auth, email, password);
        showMessage("Login successful!", false);
        setTimeout(redirectToNextPage, 1000);
    } catch (error) {
        let msg = 'Login failed. Please check credentials.';
        if (error.code === 'auth/user-not-found') msg = 'No account found with this email.';
        showMessage(msg, true);
        setLoading(loginBtn, false);
    }
}

export async function handleSignup(event) {
    event.preventDefault();
    const signupBtn = document.getElementById('signup-btn');
    setLoading(signupBtn, true);
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;

    try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await createUserDocument(userCredential.user);
        showMessage("Account created successfully!", false);
        setTimeout(redirectToNextPage, 1000);
    } catch (error) {
        let msg = 'Sign-up failed.';
        if (error.code === 'auth/email-already-in-use') msg = 'Email already in use.';
        showMessage(msg, true);
        setLoading(signupBtn, false);
    }
}

export async function handleGoogleAuth(button) {
    setLoading(button, true);
    try {
        const result = await signInWithPopup(auth, googleProvider);
        if (result.additionalUserInfo?.isNewUser) await createUserDocument(result.user);
        showMessage(`Welcome, ${result.user.displayName || "User"}!`, false);
    } catch (error) {
        showMessage("Google sign-in failed.", true);
        setLoading(button, false);
    }
}

export async function handleGitHubAuth(button) {
    setLoading(button, true);
    try {
        const result = await signInWithPopup(auth, githubProvider);
        const credential = GithubAuthProvider.credentialFromResult(result);
        const token = credential.accessToken;
        if (token) {
            localStorage.setItem('gh_access_token', token);
        }
        if (result.additionalUserInfo?.isNewUser) await createUserDocument(result.user);
        showMessage(`Welcome!`, false);
    } catch (error) {
        showMessage("GitHub sign-in failed.", true);
        setLoading(button, false);
    }
}

export async function handleReset(event) {
    event.preventDefault();
    const resetBtn = document.getElementById('reset-btn');
    const email = document.getElementById('reset-email').value;

    setLoading(resetBtn, true);

    try {
        await sendPasswordResetEmail(auth, email);
        showMessage("Reset link sent! Check your inbox. (and spam folder)", false);
        setTimeout(() => toggleForm('login'), 3000);
    } catch (error) {
        let msg = "Could not send reset email.";
        if (error.code === 'auth/user-not-found') msg = "No account found with this email.";
        showMessage(msg, true);
    } finally {
        setLoading(resetBtn, false);
    }
}

// ----------------- Tab Switch -----------------
export function toggleForm(formType) {
    const loginForm = document.getElementById('login-form');
    const signupForm = document.getElementById('signup-form');
    const resetForm = document.getElementById('reset-form');
    const loginTab = document.getElementById('login-tab');
    const signupTab = document.getElementById('signup-tab');

    if (formType === 'login') {
        loginForm.classList.remove('hidden');
        signupForm.classList.add('hidden');
        resetForm.classList.add('hidden');
        loginTab.classList.add('bg-white', 'shadow-sm', 'tab-active');
        signupTab.classList.remove('bg-white', 'shadow-sm', 'tab-active');
        loginTab.classList.remove('text-gray-500');
        signupTab.classList.add('text-gray-500');
    } else if (formType === 'signup') {
        loginForm.classList.add('hidden');
        signupForm.classList.remove('hidden');
        resetForm.classList.add('hidden');
        signupTab.classList.add('bg-white', 'shadow-sm', 'tab-active');
        loginTab.classList.remove('bg-white', 'shadow-sm', 'tab-active');
        signupTab.classList.remove('text-gray-500');
        loginTab.classList.add('text-gray-500');
    } else if (formType === 'reset') {
        loginForm.classList.add('hidden');
        signupForm.classList.add('hidden');
        resetForm.classList.remove('hidden');
        loginTab.classList.remove('bg-white', 'shadow-sm', 'tab-active');
        signupTab.classList.remove('bg-white', 'shadow-sm', 'tab-active');
    }
}

// ----------------- Auth State Redirect -----------------
onAuthChange((user) => {
    if (user) {
        showMessage(`Welcome back! Redirecting...`, false);
        setTimeout(redirectToNextPage, 1000);
    }
});
