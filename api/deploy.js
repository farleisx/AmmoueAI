// file: pages/api/deploy.js

import fetch from 'node-fetch';
import { Buffer } from 'buffer';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import admin from 'firebase-admin';

const credential = admin.credential;
const FieldValue = admin.firestore.FieldValue;

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const APP_PROJECT_ID = 'ammoueai';

const PLAN_LIMITS = {
  free: 1,
  pro: 5
};

// ---- Firebase Init ----
if (!getApps().length) {
  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (serviceAccountJson) {
    initializeApp({
      credential: credential.cert(JSON.parse(serviceAccountJson)),
    });
  }
}

const db = getFirestore();

// ---- Helpers ----
async function getDeploymentCount(userId) {
  const doc = await db.collection('deployments').doc(userId).get();
  return doc.exists ? doc.data().count : 0;
}

async function incrementDeploymentCount(userId) {
  await db.collection('deployments').doc(userId).set({
    count: FieldValue.increment(1),
  }, { merge: true });
}

// ---- Main Handler ----
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { htmlContent, userId, plan, projectId } = req.body;

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: 'Missing required parameters' });
  }

  try {
    const maxDeployments = PLAN_LIMITS[plan] || 1;
    let currentDeployments = await getDeploymentCount(userId);

    const projectRef = db
      .collection('artifacts')
      .doc(APP_PROJECT_ID)
      .collection('users')
      .doc(userId)
      .collection('projects')
      .doc(projectId);

    const projectSnap = await projectRef.get();
    const isUpdate = projectSnap.exists && projectSnap.data()?.deploymentUrl;

    if (!isUpdate && currentDeployments >= maxDeployments) {
      return res.status(403).json({
        error: `Plan limit reached (${maxDeployments})`,
        maxDeployments
      });
    }

    // ---- GitHub Deployment ----
    let baseSHA = null;
    let branchExists = true;

    const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });

    if (branchRes.ok) {
      const branch = await branchRes.json();
      baseSHA = branch.commit.sha;
    } else {
      branchExists = false;
    }

    // Create Blob
    const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        content: htmlContent,
        encoding: 'utf-8'
      })
    });

    const blob = await blobRes.json();
    if (!blob.sha) {
      return res.status(500).json({ error: 'Failed to create blob' });
    }

    // Create Tree
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        base_tree: baseSHA,
        tree: [{
          path: `users/${userId}/${projectId}/index.html`,
          mode: '100644',
          type: 'blob',
          sha: blob.sha
        }]
      })
    });

    const tree = await treeRes.json();
    if (!tree.sha) {
      return res.status(500).json({ error: 'Failed to create tree' });
    }

    // Create Commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `Deploy ${projectId}`,
        tree: tree.sha,
        parents: baseSHA ? [baseSHA] : []
      })
    });

    const commit = await commitRes.json();
    if (!commit.sha) {
      return res.status(500).json({ error: 'Failed to create commit' });
    }

    // Update Branch
    const refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
    const refRes = await fetch(refUrl, {
      method: branchExists ? 'PATCH' : 'POST',
      headers: {
        Authorization: `token ${GITHUB_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(
        branchExists
          ? { sha: commit.sha, force: true }
          : { ref: `refs/heads/${GITHUB_BRANCH}`, sha: commit.sha }
      )
    });

    if (!refRes.ok) {
      return res.status(500).json({ error: 'Failed to update branch' });
    }

    const deploymentUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/users/${userId}/${projectId}/index.html`;

    if (!isUpdate) {
      await incrementDeploymentCount(userId);
      currentDeployments++;
    }

    // ✅ Fake polling-compatible response
    return res.status(200).json({
      deploymentId: `github-${Date.now()}`,
      deploymentUrl,
      status: "QUEUED",
      currentDeployments,
      maxDeployments
    });

  } catch (err) {
    console.error("Deploy error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message
    });
  }
}
