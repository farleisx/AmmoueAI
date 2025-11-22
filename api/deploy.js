import fetch from 'node-fetch';
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "./firebase"; // your Firebase config file
import { Buffer } from 'buffer';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO;
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error("Missing GITHUB_TOKEN or GITHUB_REPO in environment.");
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { htmlContent, userId } = req.body;

  if (!htmlContent || !userId) {
    return res.status(400).json({ error: 'Missing htmlContent or userId.' });
  }

  try {
    // --- 1️⃣ Check user plan and available deployment slots ---
    const userRef = doc(db, "users", userId);
    const userSnap = await getDoc(userRef);

    if (!userSnap.exists()) {
      return res.status(400).json({ error: 'User not found in database.' });
    }

    const userData = userSnap.data();
    const maxDeployments = userData.plan === "pro" ? 5 : 1;

    // Find the first available deployment slot
    let slotKey = null;
    for (let i = 1; i <= maxDeployments; i++) {
      if (!userData.deployments[`project${i}`]?.used) {
        slotKey = `project${i}`;
        break;
      }
    }

    if (!slotKey) {
      return res.status(403).json({ error: 'You have reached your deployment limit for your plan.' });
    }

    // --- 2️⃣ Deploy to GitHub ---
    // Check if branch exists
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

    // Create a blob
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

    // Create a tree
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
        tree: [{ path: `users/${userId}/${slotKey}.html`, mode: '100644', type: 'blob', sha: blobData.sha }]
      })
    });

    if (!treeRes.ok) {
      const err = await treeRes.json();
      return res.status(treeRes.status).json({ error: 'Failed to create tree', details: err });
    }

    const treeData = await treeRes.json();

    // Create a commit
    const commitMessage = `Deploy ${slotKey} for user ${userId}`;
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: commitMessage,
        tree: treeData.sha,
        parents: baseSHA ? [baseSHA] : []
      })
    });

    if (!commitRes.ok) {
      const err = await commitRes.json();
      return res.status(commitRes.status).json({ error: 'Failed to create commit', details: err });
    }

    const commitData = await commitRes.json();

    // Update or create branch
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

    // --- 3️⃣ Mark deployment slot as used ---
    await setDoc(
      userRef,
      { [`deployments.${slotKey}`]: { used: true, url: `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/users/${userId}/${slotKey}.html` } },
      { merge: true }
    );

    const deploymentUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/users/${userId}/${slotKey}.html`;
    console.log('✅ GitHub Pages deployment URL:', deploymentUrl);

    return res.status(200).json({ deploymentUrl });

  } catch (error) {
    console.error('Deployment Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
