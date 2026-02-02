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
    // 1. Verify Identity and get UID from Firebase
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    // 2. Load GitHub Config
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO; 
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json'
    };

    // 3. Check if the branch exists
    let latestCommitSha = null;
    const refRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, { headers });
    
    if (refRes.ok) {
        const refData = await refRes.json();
        latestCommitSha = refData.object.sha;
    }

    // 4. Create Git Tree (Saving into user-specific folders)
    const treeItems = Object.entries(files).map(([path, content]) => ({
      path: `exports/${uid}/${projectId}/${path}`, // Organized path
      mode: '100644',
      type: 'blob',
      content: content
    }));

    const treeBody = { tree: treeItems };
    if (latestCommitSha) treeBody.base_tree = latestCommitSha;

    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify(treeBody)
    });
    
    if (!treeRes.ok) {
        const treeErr = await treeRes.text();
        throw new Error(`Tree Creation Failed: ${treeErr}`);
    }
    const treeData = await treeRes.json();

    // 5. Create Commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `Export: ${projectName} by user ${uid}`,
        tree: treeData.sha,
        parents: latestCommitSha ? [latestCommitSha] : []
      })
    });
    const commitData = await commitRes.json();

    // 6. Update or Create Branch Ref
    const refUrl = `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`;
    const finalRes = await fetch(latestCommitSha ? refUrl : `https://api.github.com/repos/${GITHUB_REPO}/git/refs`, {
      method: latestCommitSha ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(
        latestCommitSha 
          ? { sha: commitData.sha } 
          : { ref: `refs/heads/${GITHUB_BRANCH}`, sha: commitData.sha }
      )
    });

    if (!finalRes.ok) {
        const errorDetail = await finalRes.text();
        throw new Error(`GitHub Ref Update Failed (Bad Credentials or Permission): ${errorDetail}`);
    }

    res.status(200).json({ 
      success: true, 
      repoUrl: `https://github.com/${GITHUB_REPO}/tree/${GITHUB_BRANCH}/exports/${uid}/${projectId}`
    });

  } catch (error) {
    console.error('Export Error:', error);
    res.status(500).json({ message: error.message });
  }
}
