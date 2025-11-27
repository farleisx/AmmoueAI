// file: pages/api/verify-domain.js
import admin from 'firebase-admin';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import dns from 'dns/promises';
import fetch from 'node-fetch';

const APP_PROJECT_ID = 'ammoueai';
const GITHUB_REPO = process.env.GITHUB_REPO; // format "owner/repo"
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

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

async function getBranchBaseSHA() {
  const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` },
  });
  if (!branchRes.ok) throw new Error('Failed to get branch info');
  const branchData = await branchRes.json();
  return branchData.commit.sha;
}

async function createBlob(content) {
  const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
    method: 'POST',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, encoding: 'utf-8' }),
  });
  if (!blobRes.ok) {
    const err = await blobRes.text();
    throw new Error('Failed to create blob: ' + err);
  }
  return (await blobRes.json()).sha;
}

async function createTree(baseTreeSha, treeArray) {
  const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
    method: 'POST',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ base_tree: baseTreeSha, tree: treeArray }),
  });
  if (!treeRes.ok) {
    const err = await treeRes.text();
    throw new Error('Failed to create tree: ' + err);
  }
  return (await treeRes.json()).sha;
}

async function createCommit(message, treeSha, parentSha) {
  const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
    method: 'POST',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, tree: treeSha, parents: parentSha ? [parentSha] : [] }),
  });
  if (!commitRes.ok) {
    const err = await commitRes.text();
    throw new Error('Failed to create commit: ' + err);
  }
  return (await commitRes.json()).sha;
}

async function updateRef(newSha) {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sha: newSha, force: false }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error('Failed to update ref: ' + txt);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const { userId, projectId } = req.body;
    if (!userId || !projectId) return res.status(400).json({ error: 'Missing params' });

    // Read project doc & domain
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
    if (!domainObj || !domainObj.domain || !domainObj.verificationToken) {
      return res.status(400).json({ error: 'No domain pending verification' });
    }

    // Enforce Pro plan: check users collection
    const userDoc = await db.collection('users').doc(userId).get();
    const userPlan = userDoc.exists ? (userDoc.data().plan || 'free') : 'free';
    if (userPlan !== 'pro') {
      return res.status(403).json({ error: 'Only Pro users can connect custom domains' });
    }

    const domain = domainObj.domain;
    const token = domainObj.verificationToken;

    // 1) Check TXT record exists on domain root
    let txtRecords = [];
    try {
      txtRecords = await dns.resolveTxt(domain);
    } catch (e) {
      // If DNS fails, return helpful info, not hard crash
      return res.status(400).json({ error: 'DNS lookup failed', details: e.message });
    }

    const flatTxt = txtRecords.flat().map(s => s.trim());
    const found = flatTxt.some(s => s === token || s.includes(token));
    if (!found) {
      return res.status(400).json({ error: 'TXT record not found. Make sure you added the token exactly and wait a few minutes for propagation.' });
    }

    // 2) TXT found -> commit CNAME file into repo at users/{userId}/{projectId}/CNAME
    // Prepare CNAME content (root domain)
    const cnameContent = domain + '\n';

    // GitHub commit flow
    const baseSHA = await getBranchBaseSHA();
    // create blob
    const cnameBlobSha = await createBlob(cnameContent);

    // create tree adding CNAME path
    const treeArray = [
      {
        path: `users/${userId}/${projectId}/CNAME`,
        mode: '100644',
        type: 'blob',
        sha: cnameBlobSha,
      },
    ];

    const treeSha = await createTree(baseSHA, treeArray);
    const commitMessage = `Add CNAME for ${domain} (project ${projectId} by ${userId})`;
    const commitSha = await createCommit(commitMessage, treeSha, baseSHA);

    // update branch to point to new commit
    await updateRef(commitSha);

    // 3) Update Firestore domain status
    await projectDocRef.set({
      domain: {
        ...domainObj,
        status: 'active',
        verifiedAt: admin.firestore.FieldValue.serverTimestamp()
      }
    }, { merge: true });

    // Return success and instructions about next step (point DNS CNAME / or A records)
    return res.status(200).json({
      success: true,
      message: 'Domain verified and CNAME committed. It may take a few minutes for GitHub Pages to activate HTTPS.'
    });

  } catch (err) {
    console.error('verify-domain error', err);
    return res.status(500).json({ error: 'Server error', details: err.message });
  }
}
