import fetch from 'node-fetch';
import { Buffer } from 'buffer';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN; // ghp_…
const GITHUB_REPO = process.env.GITHUB_REPO;   // farleisx/ammoue-preview
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const REPO_OWNER = process.env.REPO_OWNER;     // farleisx

if (!GITHUB_TOKEN || !GITHUB_REPO || !REPO_OWNER) {
  console.error("Missing required GitHub env variables!");
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { htmlContent, userId, type } = req.body;
  if (!htmlContent) return res.status(400).json({ error: 'Missing htmlContent' });

  try {
    // 1️⃣ Check if branch exists
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

    // 2️⃣ Create a blob (base64 encoding)
    const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        content: Buffer.from(htmlContent, 'utf-8').toString('base64'),
        encoding: 'base64'
      })
    });

    if (!blobRes.ok) {
      const err = await blobRes.json();
      return res.status(blobRes.status).json({ error: 'Failed to create blob', details: err });
    }
    const blobData = await blobRes.json();

    // 3️⃣ Create tree
    const treeBody = {
      tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: blobData.sha }]
    };
    if (baseSHA) treeBody.base_tree = baseSHA;

    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(treeBody)
    });

    if (!treeRes.ok) {
      const err = await treeRes.json();
      return res.status(treeRes.status).json({ error: 'Failed to create tree', details: err });
    }
    const treeData = await treeRes.json();

    // 4️⃣ Create commit
    const commitMessage = `Deploy AI website${userId ? ` for user ${userId}` : ''}${type ? ` (${type})` : ''}`;
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

    // 5️⃣ Update or create branch
    let refUrl, refMethod, refBody;
    if (branchExists) {
      refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
      refMethod = 'PATCH';
      refBody = { sha: commitData.sha, force: true };
    } else {
      refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs`;
      refMethod = 'POST';
      refBody = { ref: `refs/heads/${GITHUB_BRANCH}`, sha: commitData.sha };
    }

    const refRes = await fetch(refUrl, {
      method: refMethod,
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(refBody)
    });

    if (!refRes.ok) {
      const err = await refRes.json();
      return res.status(refRes.status).json({ error: 'Failed to update/create branch', details: err });
    }

    // 6️⃣ Return GitHub Pages URL
    const deploymentUrl = `https://${REPO_OWNER}.github.io/${GITHUB_REPO.split('/')[1]}/`;
    console.log('✅ GitHub Pages deployment URL:', deploymentUrl);
    return res.status(200).json({ deploymentUrl });

  } catch (error) {
    console.error('Deployment Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
