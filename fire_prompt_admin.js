// fire_prompt_admin.js
import admin from "firebase-admin";

if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      databaseURL: `https://${serviceAccount.project_id}.firebaseio.com`
    });
  } catch (error) {
    console.error('Firebase admin initialization error:', error.message);
  }
}

const db = admin.firestore();
const auth = admin.auth();

export { admin, db, auth };
