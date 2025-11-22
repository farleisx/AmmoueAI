import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // your Firebase config file

/**
 * Initialize a new user profile in Firestore.
 * @param {string} uid - User ID
 * @param {"free"|"pro"} plan - Optional plan type, defaults to "free"
 */
export async function initUser(uid, plan = "free") {
  const ref = doc(db, "users", uid);

  // Check if user already exists
  const snap = await getDoc(ref);
  if (snap.exists()) return; // do nothing if user already has data

  // Set default deployments based on plan
  let deployments = {};
  if (plan === "free") {
    deployments = {
      project1: { used: false, url: null } // only 1 slot
    };
  } else if (plan === "pro") {
    deployments = {
      project1: { used: false, url: null },
      project2: { used: false, url: null },
      project3: { used: false, url: null },
      project4: { used: false, url: null },
      project5: { used: false, url: null } // 5 slots for pro
    };
  }

  // Create user document
  await setDoc(ref, {
    plan,
    deployments
  });

  console.log(`🔥 Firebase: New user profile created for ${uid} with plan "${plan}"`);
}
