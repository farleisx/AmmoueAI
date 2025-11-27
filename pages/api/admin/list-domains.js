// file: pages/api/admin/list-domains.js
import admin from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const APP_PROJECT_ID = 'ammoueai';
const ADMIN_KEY = process.env.ADMIN_KEY;

if (!getApps().length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || APP_PROJECT_ID });
}
const db = getFirestore();

export default async function handler(req, res) {
  // Simple auth
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Query all projects under artifacts/ammoueai/users/*/projects that have a domain object
    const usersCol = db.collection('artifacts').doc(APP_PROJECT_ID).collection('users');
    const usersSnap = await usersCol.get();
    const results = [];

    for (const userDoc of usersSnap.docs) {
      const userId = userDoc.id;
      const projectsCol = usersCol.doc(userId).collection('projects');
      const projSnap = await projectsCol.get();
      for (const p of projSnap.docs) {
        const pd = p.data();
        if (pd.domain && pd.domain.domain) {
          results.push({
            userId,
            projectId: p.id,
            domain: pd.domain.domain,
            status: pd.domain.status || 'pending',
            verificationToken: pd.domain.verificationToken || null,
            createdAt: pd.domain.createdAt || null,
            verifiedAt: pd.domain.verifiedAt || null
          });
        }
      }
    }

    return res.status(200).json({ domains: results });
  } catch (err) {
    console.error('admin list error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
