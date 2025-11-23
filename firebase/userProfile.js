// file: firebase/userProfile.js
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

/**
 * Ensures a user profile exists in Firestore.
 * If the user signs up or logs in with Google/GitHub for the first time, 
 * this creates a default profile with plan="free".
 */
export async function ensureUserProfile(db, user) {
    if (!user || !db) return;

    const userRef = doc(db, "users", user.uid);
    const snap = await getDoc(userRef);

    if (!snap.exists()) {
        // Create default profile
        await setDoc(userRef, {
            uid: user.uid,
            email: user.email || null,
            plan: "free",          // 🔥 default plan for everyone
            createdAt: Date.now(),
        });
        console.log("User profile created with free plan.");
    } else {
        console.log("User profile already exists.");
    }
}
