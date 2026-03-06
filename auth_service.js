// auth_service.js
import { auth } from "./fire_prompt.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-auth.js";

export function initAuth(onUserAvailable) {
    onAuthStateChanged(auth, (user) => {
        if (!user) window.location.href = "/login";
        else {
            onUserAvailable(user);
        }
    });

    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
        logoutBtn.onclick = () => signOut(auth);
    }
}
