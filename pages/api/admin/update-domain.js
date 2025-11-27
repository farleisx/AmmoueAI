// file: pages/api/admin/update-domain.js
import admin from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

const APP_PROJECT_ID = 'ammoueai';
const ADMIN_KEY = process.env.ADMIN_KEY;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const SENDGRID_API_KEY = process.env.SENDGRID_API_KEY; // optional but recommended

if (!getApps().length) {
  const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT || '{}');
  initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id || APP_PROJECT_ID });
}
const db = getFirestore();

async function commitCNAME(userId, projectId, domain) {
  // similar helper flow used earlier: base SHA -> create blob -> create tree -> commit -> update ref
  async function getBranchBaseSHA() {
    const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` },
    });
    if (!branchRes.ok) throw new Error('Failed to get branch info');
    const branchData = await branchRes.json();
    return branchData.commit.sha;
  }
  async function createBlob(content) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content, encoding: 'utf-8' }),
    });
    if (!r.ok) throw new Error('Failed to create blob: ' + await r.text());
    return (await r.json()).sha;
  }
  async function createTree(baseTreeSha, treeArray) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeArray }),
    });
    if (!r.ok) throw new Error('Failed to create tree: ' + await r.text());
    return (await r.json()).sha;
  }
  async function createCommit(message, treeSha, parentSha) {
    const r = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] }),
    });
    if (!r.ok) throw new Error('Failed to create commit: ' + await r.text());
    return (await r.json()).sha;
  }
  async function updateRef(newSha) {
    const url = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
    const r = await fetch(url, {
      method: 'PATCH',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ sha: newSha, force: false }),
    });
    if (!r.ok) throw new Error('Failed to update ref: ' + await r.text());
  }

  const baseSHA = await getBranchBaseSHA();
  const cnameBlobSha = await createBlob(domain + '\n');
  const treeSha = await createTree(baseSHA, [
    { path: `users/${userId}/${projectId}/CNAME`, mode: '100644', type: 'blob', sha: cnameBlobSha }
  ]);
  const commitSha = await createCommit(`Admin: add CNAME ${domain} for ${projectId}`, treeSha, baseSHA);
  await updateRef(commitSha);
}

async function sendEmailNotification(toEmail, subject, text) {
  if (!SENDGRID_API_KEY) {
    console.warn('SendGrid not configured; skipping email notify.');
    return;
  }
  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: process.env.NOTIFY_FROM_EMAIL || 'noreply@ammoueai.com' },
    subject,
    content: [{ type: 'text/plain', value: text }]
  };
  await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}

export default async function handler(req, res) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ') || authHeader.split(' ')[1] !== ADMIN_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, projectId, action } = req.body; // action = 'approve' | 'reject'
    if (!userId || !projectId || !action) return res.status(400).json({ error: 'Missing params' });

    const projectDocRef = db
      .collection('artifacts')
      .doc(APP_PROJECT_ID)
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId);

    const projectSnap = await projectDocRef.get();
    if (!projectSnap.exists) return res.status(404).json({ error: 'Project not found' });

    const projectData = projectSnap.data();
    const domainObj = projectData.domain;
    if (!domainObj || !domainObj.domain) return res.status(400).json({ error: 'No domain found' });

    if (action === 'approve') {
      // commit CNAME
      await commitCNAME(userId, projectId, domainObj.domain);

      // update Firestore
      await projectDocRef.set({
        domain: {
          ...domainObj,
          status: 'active',
          verifiedAt: admin.firestore.FieldValue.serverTimestamp()
        }
      }, { merge: true });

      // optional: notify user by email (if you store user email)
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().email) {
        await sendEmailNotification(userDoc.data().email,
          'Your custom domain is active',
          `Your domain ${domainObj.domain} has been activated and GitHub Pages will provision HTTPS shortly.`);
      }

      return res.status(200).json({ success: true, message: 'Domain activated (CNAME committed).' });
    } else if (action === 'reject') {
      await projectDocRef.set({
        domain: {
          ...domainObj,
          status: 'rejected'
        }
      }, { merge: true });

      // notify
      const userDoc = await db.collection('users').doc(userId).get();
      if (userDoc.exists && userDoc.data().email) {
        await sendEmailNotification(userDoc.data().email,
          'Custom domain request rejected',
          `Your request to connect ${domainObj.domain} was rejected by the administrator.`);
      }

      return res.status(200).json({ success: true, message: 'Domain rejected.' });
    } else {
      return res.status(400).json({ error: 'Unknown action' });
    }
  } catch (err) {
    console.error('admin update error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
