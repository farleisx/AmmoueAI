import fetch from 'node-fetch';
import { Buffer } from 'buffer';

// Environment variables
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO; // format: username/repo
const GITHUB_BRANCH = 'main'; // GitHub Pages branch

if (!GITHUB_TOKEN || !GITHUB_REPO) {
  console.error("Missing GITHUB_TOKEN or GITHUB_REPO in environment.");
}

function sanitizeFileContent(str) {
  return Buffer.from(str, 'utf-8').toString('base64');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const { htmlContent, userId, type } = req.body;

  if (!htmlContent) {
    return res.status(400).json({ error: 'Missing htmlContent.' });
  }

  try {
    // 1️⃣ Get the latest commit SHA of the gh-pages branch (if exists)
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

    // 2️⃣ Create a new blob with the HTML content
    const blobRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: htmlContent, encoding: 'utf-8' })
    });
    const blobData = await blobRes.json();

    // 3️⃣ Create a new tree
    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        base_tree: baseSHA,
        tree: [{ path: 'index.html', mode: '100644', type: 'blob', sha: blobData.sha }]
      })
    });
    const treeData = await treeRes.json();

    // 4️⃣ Create a commit
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
    const commitData = await commitRes.json();

    // 5️⃣ Update (or create) the branch
    const refRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
      method: branchExists ? 'PATCH' : 'POST',
      headers: { Authorization: `token ${GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sha: commitData.sha,
        force: true
      })
    });

    if (!refRes.ok) {
      const err = await refRes.json();
      return res.status(refRes.status).json({ error: 'Failed to update branch', details: err });
    }

    // 6️⃣ Return the public GitHub Pages URL
    const deploymentUrl = `https://${GITHUB_REPO.split('/')[0]}.github.io/${GITHUB_REPO.split('/')[1]}/`;
    console.log('✅ GitHub Pages deployment URL:', deploymentUrl);

    return res.status(200).json({ deploymentUrl });
  } catch (error) {
    console.error('Deployment Error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
