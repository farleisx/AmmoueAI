// file: pages/api/deploy.js

import fetch from 'node-fetch';
import { Buffer } from 'buffer'; 
import { initializeApp, getApps, getApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore'; // Import FieldValue for increment
import { credential } from 'firebase-admin';

// --- CONFIG: GitHub + Firebase ---
const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // Must be set in Vercel Environment Variables
const GITHUB_REPO = process.env.GITHUB_REPO;    // format: username/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const APP_PROJECT_ID = 'ammoueai'; // Hardcoded project ID for Firestore path

// Define plan limits here
const PLAN_LIMITS = {
  free: 1,
  pro: 5
};

// --- Firebase Admin Initialization (Diagnostic Version) ---
if (!getApps().length) {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    
    if (!serviceAccountJson) {
        // This logs to Vercel and is the likely cause of the 500 error if missing
        console.error("CRITICAL: FIREBASE_SERVICE_ACCOUNT environment variable is missing."); 
    } else {
        try {
            const serviceAccount = JSON.parse(serviceAccountJson);
            initializeApp({
                credential: credential.cert(serviceAccount)
            });
            console.log("Firebase Admin SDK successfully initialized.");
        } catch (error) {
            console.error("!!! CRITICAL FAILURE: Firebase Admin initialization failed. !!!");
            console.error("Parsing Error Details:", error.message);
            // Log the start of the malformed JSON for debugging in Vercel logs
            console.error("Start of ENV Variable:", serviceAccountJson.substring(0, 100)); 
        }
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
 * Increments the deployment count for a user using server-side increment.
 */
async function incrementDeploymentCount(userId) {
  const docRef = db.collection('deployments').doc(userId);
  
  // Use FieldValue.increment(1) for atomic updates
  await docRef.set({
    count: FieldValue.increment(1) 
  }, { merge: true });
}

// ---------------------------------

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { htmlContent, userId, plan, projectId } = req.body; 

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: 'Missing required body parameters (htmlContent, userId, plan, or projectId).' });
  }

  // Check if Firebase initialization failed earlier
  if (!getApps().length) {
      console.error("Deployment request blocked because Firebase Admin SDK failed to initialize.");
      // Return a 500 error that is guaranteed JSON
      return res.status(500).json({ 
          error: 'Server Initialization Failure', 
          details: 'The Firebase Admin SDK could not be initialized. Check Vercel logs for FIREBASE_SERVICE_ACCOUNT parsing errors.' 
      });
  }

  try {
    // --- 1️⃣ Check plan limits using Firestore ---
    const maxDeployments = PLAN_LIMITS[plan] || 1;
    let currentDeployments = await getDeploymentCount(userId); 
    
    // Path: artifacts/{appId}/users/{userId}/projects/{projectId}
    const projectDocRef = db.collection('artifacts').doc(APP_PROJECT_ID).collection('users').doc(userId).collection('projects').doc(projectId);
    const projectDoc = await projectDocRef.get();
    
    // Check if this project has a deployment URL (i.e., this is an update)
    const isUpdate = projectDoc.exists && projectDoc.data().deploymentUrl; 

    if (!isUpdate && currentDeployments >= maxDeployments) {
      return res.status(403).json({
        error: `${plan.toUpperCase()} plan limit reached. Max ${maxDeployments} deployments. Current: ${currentDeployments}.`,
      });
    }
    
    // --- 2️⃣ Check branch (GitHub API) ---
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
    // Path: users/{userId}/{projectId}/index.html
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
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
        lastDeployed: FieldValue.serverTimestamp() // Use server timestamp
    });

    // --- 8️⃣ Return URL ---
    return res.status(200).json({ deploymentUrl, currentDeployments, maxDeployments });

  } catch (error) {
    console.error("Deployment Error:", error);
    // Ensure we always return a JSON 500 error for client-side consumption
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
