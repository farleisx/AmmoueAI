import fetch from 'node-fetch'; // Required if not using Next.js framework

// Get environment variables defined in your Vercel Project settings
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; 
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; // Only needed if using a Vercel Team

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // FIX: Match the frontend key 'htmlContent'. userId and type are optional.
    const { htmlContent, userId, type } = req.body;

    // --- Validation and Environment Check ---
    if (!htmlContent || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        // Log critical failure details to Vercel logs for debugging
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

    // --- Construct Deployment Payload ---
    const deploymentPayload = {
        files: [
            {
                file: 'index.html',
                data: htmlContent, // Use the content received from the client
                // flags: { 'Content-Type': 'text/html; charset=utf-8' } // Removed flags as a potential source of Vercel error
            }
        ],
        // Construct a unique name for the deployment preview
        name: `Ammoue-Deploy-${userId || 'User'}-${type || 'new'}`, 
        target: 'preview',
        project: VERCEL_PROJECT_ID,
    };

    try {
        let vercelUrl = `https://api.vercel.com/v13/deployments`;
        if (VERCEL_TEAM_ID) {
            // Append teamId to the URL if a team is configured
            vercelUrl += `?teamId=${VERCEL_TEAM_ID}`; 
        }

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

        // --- Handle Vercel API Errors (e.g., Invalid Project ID, Token, Limits) ---
        if (!deploymentResponse.ok) {
            console.error('Vercel API Status:', deploymentResponse.status);
            console.error('Vercel API Error Response:', JSON.stringify(data, null, 2));

            // Return the Vercel error details to the client for better debugging
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
        // --- Handle Network or Parsing Errors ---
        console.error('Deployment fetch/parse error:', error);
        return res.status(500).json({ error: 'Internal server error (Function crashed before Vercel response).' });
    }
}
