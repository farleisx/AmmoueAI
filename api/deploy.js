import fetch from 'node-fetch';
import { Buffer } from 'buffer';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: username/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'; // default main

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error("Missing GITHUB_TOKEN or GITHUB_REPO in environment.");
}

function encodeContent(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
  }

  const { htmlContent } = req.body;
  if (!htmlContent) return res.status(400).json({ error: 'Missing htmlContent.' });

  try {
    let baseSHA = null;
    let branchExists = true;

    // 1️⃣ Check branch
    let branchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${GITHUB_BRANCH}`, {
      headers: { Authorization: `token ${GITHUB_TOKEN}` }
    });

    if (!branchRes.ok) branchExists = false;
    else {
      const branchData = await branchRes.json();
      baseSHA = branchData.commit.sha;
    }

    // 2️⃣ Create blob
    const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: htmlContent, encoding: 'utf-8' })
    });

    if (!blobRes.ok) {
      const text = await blobRes.text();
      return res.status(blobRes.status).json({ error: 'Failed to create blob', details: text });
    }

    const blobData = await blobRes.json();

    // 3️⃣ Create tree
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
        tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: blobData.sha }]
      })
    });

    if (!treeRes.ok) {
      const text = await treeRes.text();
      return res.status(treeRes.status).json({ error: 'Failed to create tree', details: text });
    }

    const treeData = await treeRes.json();

    // 4️⃣ Create commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: `Deploy AI website`,
        tree: treeData.sha,
        parents: baseSHA ? [baseSHA] : []
      })
    });

    if (!commitRes.ok) {
      const text = await commitRes.text();
      return res.status(commitRes.status).json({ error: 'Failed to create commit', details: text });
    }

    const commitData = await commitRes.json();

    // 5️⃣ Create or update branch
    let refUrl, refMethod, refBody;
    if (branchExists) {
      refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
      refMethod = 'PATCH';
      refBody = { sha: commitData.sha, force: true };
    } else {
      // Create branch from base commit if exists, else from empty repo
      refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs`;
      refMethod = 'POST';
      const baseForNew = baseSHA || commitData.sha;
      refBody = { ref: `refs/heads/${GITHUB_BRANCH}`, sha: baseForNew };
    }

    const refRes = await fetch(refUrl, {
      method: refMethod,
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(refBody)
    });

    if (!refRes.ok) {
      const text = await refRes.text();
      return res.status(refRes.status).json({ error: 'Failed to update/create branch', details: text });
    }

    // 6️⃣ Return GitHub Pages URL
    const deploymentUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/`;
    console.log('✅ GitHub Pages deployment URL:', deploymentUrl);

    return res.status(200).json({ deploymentUrl });

  } catch (err) {
    console.error('Deployment Error:', err);
    return res.status(500).json({ error: 'Internal server error', details: err.message });
  }
}
