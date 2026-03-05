// api/github-import.js
export default async function handler(req, res) {
    console.log("--- GitHub Import Started ---");
    console.log("Method:", req.method);

    if (req.method !== 'POST') {
        console.warn("Invalid method:", req.method);
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const { repoUrl } = req.body;
    const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

    console.log("Target Repo URL:", repoUrl);
    console.log("GitHub Token Present:", !!GITHUB_TOKEN);

    if (!repoUrl) {
        console.error("Missing repoUrl in request body");
        return res.status(400).json({ error: 'Repository URL is required' });
    }

    try {
        const url = new URL(repoUrl);
        const pathParts = url.pathname.split('/').filter(Boolean);
        
        if (pathParts.length < 2) {
            console.error("URL parsing failed. Path parts:", pathParts);
            throw new Error("Invalid GitHub URL. Format should be github.com/owner/repo");
        }
        
        const owner = pathParts[0];
        const repo = pathParts[1].replace(/\.git$/, ''); 
        
        const apiUrl = `https://api.github.com/repos/${owner}/${repo}/contents`;
        
        console.log(`Fetching repo structure from: ${apiUrl}`);
        
        const fetchHeaders = {
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'AmmoueAI-Importer'
        };

        if (GITHUB_TOKEN) {
            fetchHeaders['Authorization'] = `token ${GITHUB_TOKEN}`;
        }

        const response = await fetch(apiUrl, { headers: fetchHeaders });
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`GitHub API Error (${response.status}):`, errorText);
            throw new Error(`GitHub API returned ${response.status}: ${errorText}`);
        }
        
        const items = await response.json();
        console.log(`Found ${items.length} items in root directory.`);

        const projectData = {};

        // Flattening logic: Only grab files from root, ignore directories
        for (const item of items) {
            if (item.type === 'file') {
                const isWebFile = item.name.endsWith('.html') || 
                                 item.name.endsWith('.css') || 
                                 item.name.endsWith('.js');
                
                if (isWebFile) {
                    console.log(`Downloading file: ${item.name}...`);
                    const contentRes = await fetch(item.download_url, { headers: fetchHeaders });
                    
                    if (contentRes.ok) {
                        projectData[item.name] = await contentRes.text();
                    } else {
                        console.warn(`Failed to download ${item.name}: ${contentRes.status}`);
                    }
                }
            }
        }

        const fileCount = Object.keys(projectData).length;
        console.log(`Successfully processed ${fileCount} web files.`);

        if (fileCount === 0) {
            console.error("No valid web files found in root.");
            throw new Error("No compatible web files (.html, .css, .js) found in the root directory.");
        }

        console.log("--- GitHub Import Success ---");
        return res.status(200).json(projectData);

    } catch (error) {
        console.error("CRITICAL EXCEPTION during GitHub Import:");
        console.error("Message:", error.message);
        console.error("Stack:", error.stack);
        
        return res.status(500).json({ 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
        });
    }
}
