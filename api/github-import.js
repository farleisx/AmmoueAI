// api/github-import.js
export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { repoUrl } = req.body;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    if (!repoUrl) {
        return res.status(400).json({ error: 'Repository URL is required' });
    }

    try {
        const url = new URL(repoUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        if (pathParts.length < 2) throw new Error("Invalid GitHub URL");
        
        const [owner, repo] = pathParts;
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
        
        const fetchHeaders = {};
        if (GITHUB_TOKEN) {
            fetchHeaders['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const response = await fetch(apiUrl, { headers: fetchHeaders });
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || "Failed to fetch repository structure");
        }
        
        const items = await response.json();
        const projectData = {};

        // Flattening logic: Only grab files from root, ignore directories
        for (const item of items) {
            if (item.type === 'file') {
                const isWebFile = item.name.endsWith('.html') || 
                                 item.name.endsWith('.css') || 
                                 item.name.endsWith('.js');
                
                if (isWebFile) {
                    const contentRes = await fetch(item.download_url, { headers: fetchHeaders });
                    if (contentRes.ok) {
                        projectData[item.name] = await contentRes.text();
                    }
                }
            }
        }

        if (Object.keys(projectData).length === 0) {
            throw new Error("No compatible web files (.html, .css, .js) found in the root directory.");
        }

        return res.status(200).json(projectData);
    } catch (error) {
        return res.status(500).json({ error: error.message });
    }
}
