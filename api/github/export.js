// api/github/export.js
import { admin, db } from "../../../fire_prompt_admin.js";

export default async function handler(req, res) {
  // Only allow POST requests
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
    // 1. Verify Firebase Identity
    await admin.auth().verifyIdToken(idToken);

    // 2. Load Config from Environment Variables
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO; // Expected format: "username/repo-name"
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    // 3. Get the latest commit SHA from the target branch
    const refRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, { headers });
    if (!refRes.ok) throw new Error(`Branch ${GITHUB_BRANCH} not found in ${GITHUB_REPO}`);
    const refData = await refRes.json();
    const latestCommitSha = refData.object.sha;

    // 4. Create the Git Tree structure
    // We map your projectFiles object into the GitHub Tree format
    const treeItems = Object.entries(files).map(([path, content]) => ({
      path: path,
      mode: '100644', // Normal file mode
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

    // 5. Create a new Commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `Update from AmmoueAI: ${projectName} (Project: ${projectId})`,
        tree: treeData.sha,
        parents: [latestCommitSha]
      })
    });
    const commitData = await commitRes.json();

    // 6. Update the Branch Reference to point to the new commit
    const finalRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({
        sha: commitData.sha,
        force: false
      })
    });

    if (!finalRes.ok) throw new Error('Failed to update branch reference');

    res.status(200).json({ 
      success: true, 
      repoUrl: `https://github.com/${GITHUB_REPO}`,
      branch: GITHUB_BRANCH
    });

  } catch (error) {
    console.error('GitHub Export Error:', error);
    res.status(500).json({ message: error.message });
  }
}
