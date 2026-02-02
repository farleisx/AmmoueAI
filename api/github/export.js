// api/github/export.js
import { admin } from "../../fire_prompt_admin.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ message: 'Method Not Allowed' });
  }

  const { projectId, projectName, files } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Missing Authorization Header' });
  }

  const idToken = authHeader.split('Bearer ')[1];

  try {
    // 1. Verify Identity using the Service Account
    await admin.auth().verifyIdToken(idToken);

    // 2. Load GitHub Config
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO; 
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    // 3. Get the latest commit SHA
    const refRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, { headers });
    if (!refRes.ok) throw new Error(`GitHub Branch ${GITHUB_BRANCH} not found.`);
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 4. Create Git Tree
    const treeItems = Object.entries(files).map(([path, content]) => ({
      path: path,
      mode: '100644',
      type: 'blob',
      content: content
    }));

    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        base_tree: latestCommitSha,
        tree: treeItems
      })
    });
    const treeData = await treeRes.json();

    // 5. Create Commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `Update: ${projectName} (${projectId})`,
        tree: treeData.sha,
        parents: [latestCommitSha]
      })
    });
    const commitData = await commitRes.json();

    // 6. Update Branch Ref
    await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ sha: commitData.sha })
    });

    res.status(200).json({ 
      success: true, 
      repoUrl: `https://github.com/${GITHUB_REPO}`
    });

  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ message: error.message });
  }
}
