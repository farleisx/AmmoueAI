// /api/deploy.js
// This file will run as a Vercel Serverless Function

const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; 
// Only needed if you are using a Vercel Team
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; 

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { html, userId } = req.body;

    if (!html || !userId || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        return res.status(400).json({ error: 'Missing data or environment variables.' });
    }

    const deploymentPayload = {
        // Vercel Deployment API requires files to be passed directly
        files: [
            {
                file: 'index.html', // The main file Vercel will serve
                data: html,
                flags: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        ],
        name: 'Ammoue-AI-Site', // A friendly name for the deployment
        target: 'preview',       // Ensures it's a temporary, fast preview deployment
        project: VERCEL_PROJECT_ID,
    };

    try {
        let vercelUrl = `https://api.vercel.com/v13/deployments`;
        if (VERCEL_TEAM_ID) {
             // Append the Team ID as a query parameter if it exists
             vercelUrl += `?teamId=${VERCEL_TEAM_ID}`; 
        }

        const deploymentResponse = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                // Authorization using the secret token
                'Authorization': `Bearer ${VERCEL_ACCESS_TOKEN}`, 
            },
            body: JSON.stringify(deploymentPayload),
        });

        const data = await deploymentResponse.json();

        if (!deploymentResponse.ok) {
            console.error('Vercel API Error:', data.error);
            return res.status(500).json({ 
                error: 'Deployment failed.', 
                details: data.error.message || 'Check logs.',
                code: data.error.code
            });
        }
        
        // The Vercel API returns the deployment URL in the 'url' property (e.g., my-site-abcd1234.vercel.app)
        const previewUrl = data.url; 

        // Return the full HTTPS URL back to the client
        return res.status(200).json({ previewUrl: `https://${previewUrl}` });

    } catch (error) {
        console.error('Deployment error:', error);
        return res.status(500).json({ error: 'Internal server error during deployment process.' });
    }
}
