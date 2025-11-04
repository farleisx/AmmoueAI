import fetch from 'node-fetch'; 

// Get environment variables defined in your Vercel Project settings
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; 
// Removed VERCEL_TEAM_ID since you are not using a team

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { htmlContent, userId, type } = req.body;

    // --- Validation and Environment Check ---
    if (!htmlContent || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        if (!VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
            console.error('CRITICAL: Vercel Environment Variables are NOT loaded correctly.');
        } else {
            console.error('ERROR: Missing htmlContent in request body.');
        }

        return res.status(400).json({ 
            error: 'Missing data or environment variables.',
            details: 'Required: htmlContent, VERCEL_ACCESS_TOKEN, VERCEL_PROJECT_ID.'
        });
    }

    // --- Construct Simplified Deployment Payload ---
    // Removed 'target' and 'project' from the payload to simplify the request.
    const deploymentPayload = {
        files: [
            {
                file: 'index.html',
                data: htmlContent, 
            }
        ],
        name: `Ammoue-Deploy-${userId || 'User'}-${type || 'new'}`, 
    };

    try {
        // The Vercel URL no longer needs the team ID query parameter
        const vercelUrl = `https://api.vercel.com/v13/deployments`;

        // --- Execute Vercel API Call ---
        const deploymentResponse = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VERCEL_ACCESS_TOKEN}`, 
            },
            body: JSON.stringify(deploymentPayload),
        });

        const data = await deploymentResponse.json();

        // --- Handle Vercel API Errors ---
        if (!deploymentResponse.ok) {
            console.error('Vercel API Status:', deploymentResponse.status);
            console.error('Vercel API Error Response:', JSON.stringify(data, null, 2));

            return res.status(deploymentResponse.status).json({ 
                error: 'Deployment failed. Vercel API returned an error.', 
                details: data.error?.message || `Vercel Status Code: ${deploymentResponse.status}`,
                code: data.error?.code
            });
        }
        
        // --- Success Path ---
        const previewUrl = data.url; 
        return res.status(200).json({ previewUrl: `https://${previewUrl}` });

    } catch (error) {
        console.error('Deployment fetch/parse error:', error);
        return res.status(500).json({ error: 'Internal server error (Function crashed before Vercel response).' });
    }
}
