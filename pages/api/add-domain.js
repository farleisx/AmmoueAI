// file: pages/api/add-domain.js
import admin from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';

const APP_PROJECT_ID = 'ammoueai'; // same as your deploy logic

// Init Firebase Admin once
if (!getApps().length) {
  try {
    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!saJson) throw new Error('FIREBASE_SERVICE_ACCOUNT env missing');
    const sa = JSON.parse(saJson);
    initializeApp({
      credential: admin.credential.cert(sa),
      projectId: sa.project_id || APP_PROJECT_ID,
    });
  } catch (e) {
    console.error('Firebase Admin init error', e);
  }
}
const db = getFirestore();

/**
 * POST body expected:
 * { userId, projectId, domain }
 */
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, projectId, domain } = req.body;
    if (!userId || !projectId || !domain) return res.status(400).json({ error: 'Missing params' });

    // Normalize domain (lowercase, strip protocol)
    const normalized = domain.toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '');

    // Generate token used in TXT record
    const token = 'ammoue-verify-' + crypto.randomBytes(6).toString('hex');

    const domainDocRef = db
      .collection('artifacts')
      .doc(APP_PROJECT_ID)
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId);

    const domainEntry = {
      domain: normalized,
      status: 'pending', // pending | verified | active
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      verificationToken: token,
      verifiedAt: null,
    };

    // Save domain object inside project doc under field `domain`
    await domainDocRef.set({ domain: domainEntry }, { merge: true });

    // DNS instructions to show user
    const instructions = {
      txt: {
        type: 'TXT',
        host: '@',
        value: token,
        comment: 'Add this TXT record to prove ownership. Then click Verify.'
      },
      cnameSuggestion: {
        type: 'CNAME',
        host: 'www',
        value: `${process.env.GITHUB_REPO.split('/')[0]}.github.io`,
        comment: 'After TXT verifies, add this CNAME (or you can point apex A records to GitHub Pages IPs).'
      },
      githubPagesARecords: [
        '185.199.108.153',
        '185.199.109.153',
        '185.199.110.153',
        '185.199.111.153'
      ]
    };

    return res.status(200).json({ success: true, instructions, token });
  } catch (err) {
    console.error('add-domain error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
