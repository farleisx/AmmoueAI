import fetch from 'node-fetch';
import { Buffer } from 'buffer';

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: username/repo
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main'; // or 'gh-pages'

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error("Missing GITHUB_TOKEN or GITHUB_REPO in environment.");
}

function encodeBase64(str) {
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

    // 1️⃣ Check if branch exists
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

// If branch doesn’t exist, use default branch as base
if (!branchExists) {
  const repoRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  const repoData = await repoRes.json();
  const defaultBranch = repoData.default_branch; // usually 'main'
  
  const defaultBranchRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/branches/${defaultBranch}`, {
    headers: { Authorization: `token ${GITHUB_TOKEN}` }
  });
  const defaultBranchData = await defaultBranchRes.json();
  baseSHA = defaultBranchData.commit.sha;
}

    // 3️⃣ Create a tree
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
        tree: [
          { path: 'index.html', mode: '100644', type: 'blob', sha: blobData.sha }
        ]
      })
    });

    if (!treeRes.ok) {
      const err = await treeRes.json();
      return res.status(treeRes.status).json({ error: 'Failed to create tree', details: err });
    }
    const treeData = await treeRes.json();

    // 4️⃣ Create a commit
    const commitMessage = `Deploy AI site`;
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
    const [owner, repo] = GITHUB_REPO.split('/');
    const deploymentUrl = `https://${owner}.github.io/${repo}/`;

    console.log('✅ GitHub Pages URL:', deploymentUrl);
    return res.status(200).json({ deploymentUrl });

  } catch (error) {
    console.error('Deployment Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
