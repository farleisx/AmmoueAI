// api/github/export.js
import { admin } from "../../fire_prompt_admin.js";

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { projectId, projectName, files } = req.body;
  const authHeader = req.headers.authorization;

  if (!authHeader) return res.status(401).json({ message: 'Missing Authorization Header' });
  const idToken = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await admin.auth().verifyIdToken(idToken);
    const uid = decodedToken.uid;

    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
    const GITHUB_REPO = process.env.GITHUB_REPO; 
    const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';

    // Added User-Agent which GitHub sometimes requires
    const headers = {
      'Authorization': `token ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
      'User-Agent': 'AmmoueAI-App' 
    };

    // 1. Initial Auth Check (Verify token works before doing work)
    const authCheck = await fetch(`https://api.github.com/user`, { headers });
    if (authCheck.status === 401) {
        throw new Error("GitHub Token is invalid or expired. Check Vercel Env Variables and Redeploy.");
    }

    // 2. Check Branch
    let latestCommitSha = null;
    const refRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}`, { headers });
    if (refRes.ok) {
        const refData = await refRes.json();
        latestCommitSha = refData.object.sha;
    }

    // 3. Create Tree
    const treeItems = Object.entries(files).map(([path, content]) => ({
      path: `exports/${uid}/${projectId}/${path}`,
      mode: '100644',
      type: 'blob',
      content: content
    }));

    const treeRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/trees`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        tree: treeItems,
        base_tree: latestCommitSha || undefined
      })
    });
    
    if (!treeRes.ok) {
        const treeErr = await treeRes.text();
        throw new Error(`GitHub rejected tree creation: ${treeErr}`);
    }
    const treeData = await treeRes.json();

    // 4. Create Commit
    const commitRes = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/commits`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        message: `Export: ${projectName}`,
        tree: treeData.sha,
        parents: latestCommitSha ? [latestCommitSha] : []
      })
    });
    const commitData = await commitRes.json();

    // 5. Update Ref
    const finalRes = await fetch(latestCommitSha ? `https://api.github.com/repos/${GITHUB_REPO}/git/refs/heads/${GITHUB_BRANCH}` : `https://api.github.com/repos/${GITHUB_REPO}/git/refs`, {
      method: latestCommitSha ? 'PATCH' : 'POST',
      headers,
      body: JSON.stringify(
        latestCommitSha 
          ? { sha: commitData.sha } 
          : { ref: `refs/heads/${GITHUB_BRANCH}`, sha: commitData.sha }
      )
    });

    res.status(200).json({ 
      success: true, 
      repoUrl: `https://github.com/${GITHUB_REPO}/tree/${GITHUB_BRANCH}/exports/${uid}/${projectId}`
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
}
