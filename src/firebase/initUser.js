import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // your firebase config file

export async function initUser(uid) {
  const ref = doc(db, "users", uid);

  // Check if user already exists
  const snap = await getDoc(ref);
  if (snap.exists()) return; // do nothing if user already has data

  // Set up the default free plan + 5 deployment slots
  await setDoc(ref, {
    plan: "free",
    deployments: {
      project1: { used: false, url: null },
      project2: { used: false, url: null },
      project3: { used: false, url: null },
      project4: { used: false, url: null },
      project5: { used: false, url: null }
    }
  });

  console.log(`🔥 Firebase: New user profile created for ${uid}`);
}
