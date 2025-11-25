// file: pages/api/deploy.js

import fetch from 'node-fetch';
import { Buffer } from 'buffer'; // Buffer is often needed but sometimes implicitly available in Next.js/Vercel
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { credential } from 'firebase-admin';

// --- CONFIG: GitHub + Firebase ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Add in Vercel Environment Variables
const GITHUB_REPO = process.env.GITHUB_REPO;    // format: username/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

// Define plan limits here
const PLAN_LIMITS = {
  free: 1,
  pro: 5
};

// --- Firebase Admin Initialization ---
// This uses Firebase Admin SDK to securely access Firestore from the server
// Requires service account JSON in Vercel environment variables as FIREBASE_SERVICE_ACCOUNT
if (!getApps().length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    initializeApp({
      credential: credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error("Firebase Admin initialization failed. Check FIREBASE_SERVICE_ACCOUNT environment variable.");
    console.error(error);
  }
}

const db = getFirestore();

// --- Firestore Helper Functions ---

/**
 * Gets the current deployment count for a user.
 */
async function getDeploymentCount(userId) {
  const docRef = db.collection('deployments').doc(userId);
  const doc = await docRef.get();
  
  // Return the count, defaulting to 0 if the document doesn't exist
  return doc.exists ? doc.data().count : 0;
}

/**
 * Increments the deployment count for a user.
 */
async function incrementDeploymentCount(userId) {
  const docRef = db.collection('deployments').doc(userId);
  
  await docRef.set({
    count: getDeploymentCount.name === 'incrementDeploymentCount' // This is a placeholder for a proper server-side increment
      ? db.FieldValue.increment(1) // Use FieldValue.increment if you set it up to avoid race conditions
      : await getDeploymentCount(userId) + 1 // Simple read-then-write for safety in this example
  }, { merge: true });
}

// ---------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { htmlContent, userId, plan, projectId } = req.body; // Added projectId

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: 'Missing required body parameters (htmlContent, userId, plan, or projectId).' });
  }

  try {
    // --- 1️⃣ Check plan limits using Firestore ---
    const maxDeployments = PLAN_LIMITS[plan] || 1;
    let currentDeployments = await getDeploymentCount(userId); // Fetch count from Firestore
    
    // Check if this project has already been deployed (i.e., this is an update)
    // We only count new deployments towards the limit. Updates to existing deployments are free.
    const projectDocRef = db.collection('artifacts').doc('ammoueai').collection('users').doc(userId).collection('projects').doc(projectId);
    const projectDoc = await projectDocRef.get();
    const isUpdate = projectDoc.exists && projectDoc.data().deploymentUrl; // Assume if it has a URL, it's deployed

    if (!isUpdate && currentDeployments >= maxDeployments) {
      return res.status(403).json({
        error: `${plan.toUpperCase()} plan limit reached. Max ${maxDeployments} deployments. Current: ${currentDeployments}.`,
      });
    }
    
    // --- 2️⃣ Check branch ---
    let baseSHA = null;
    let branchExists = true;
    const branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });

    if (!branchRes.ok) branchExists = false;
    else {
      const branchData = await branchRes.json();
      baseSHA = branchData.commit.sha;
    }

    // --- 3️⃣ Create blob ---
    // The rest of the GitHub deployment logic remains unchanged...
    const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: htmlContent, encoding: 'utf-8' })
    });

    if (!blobRes.ok) {
      const err = await blobRes.json();
      return res.status(blobRes.status).json({ error: 'Failed to create blob', details: err });
    }

    const blobData = await blobRes.json();

    // --- 4️⃣ Create tree ---
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
        // CRITICAL: Use the projectId as the folder name to get a unique URL path
        tree: [{ path: `users/${userId}/${projectId}/index.html`, mode: '100644', type: 'blob', sha: blobData.sha }] 
      })
    });

    if (!treeRes.ok) {
      const err = await treeRes.json();
      return res.status(treeRes.status).json({ error: 'Failed to create tree', details: err });
    }

    const treeData = await treeRes.json();

    // --- 5️⃣ Create commit ---
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Deploy site ${projectId} for user ${userId}`,
        tree: treeData.sha,
        parents: baseSHA ? [baseSHA] : []
      })
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return res.status(commitRes.status).json({ error: 'Failed to create commit', details: err });
    }

    const commitData = await commitRes.json();

    // --- 6️⃣ Update or create branch ---
    const refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
    const refMethod = branchExists ? 'PATCH' : 'POST';
    const refBody = branchExists
      ? { sha: commitData.sha, force: true }
      : { ref: `refs/heads/${GITHUB_BRANCH}`, sha: commitData.sha };

    const refRes = await fetch(refUrl, {
      method: refMethod,
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(refBody)
    });

    if (!refRes.ok) {
      const err = await refRes.json();
      return res.status(refRes.status).json({ error: 'Failed to update/create branch', details: err });
    }

    // --- 7️⃣ Finalize & Track deployment in Firestore ---
    
    // Construct the final deployment URL
    const deploymentUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/users/${userId}/${projectId}/index.html`;

    // A. Increment count ONLY IF this is a NEW deployment
    if (!isUpdate) {
        await incrementDeploymentCount(userId);
        currentDeployments++; // Update the local count for the response
    }

    // B. Update the project document with the new deployment URL
    await projectDocRef.update({
        deploymentUrl: deploymentUrl,
        lastDeployed: new Date() // Add a timestamp for the last deployment
    });

    // --- 8️⃣ Return URL ---
    return res.status(200).json({ deploymentUrl, currentDeployments, maxDeployments });

  } catch (error) {
    console.error("Deployment Error:", error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
