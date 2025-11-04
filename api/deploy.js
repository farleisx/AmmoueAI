import fetch from 'node-fetch';

// Get environment variables defined in your Vercel Project settings
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; 
// No need for VERCEL_TEAM_ID unless you’re using a team account

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { htmlContent, userId, type } = req.body;

    // --- Validation ---
    if (!htmlContent || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        console.error('Missing data or environment variables:', {
            htmlContent: !!htmlContent,
            VERCEL_ACCESS_TOKEN: !!VERCEL_ACCESS_TOKEN,
            VERCEL_PROJECT_ID: !!VERCEL_PROJECT_ID
        });

        return res.status(400).json({ 
            error: 'Missing data or environment variables.',
            details: 'Required: htmlContent, VERCEL_ACCESS_TOKEN, VERCEL_PROJECT_ID.'
        });
    }

    // --- Deployment Payload ---
    const deploymentPayload = {
        name: `Ammoue-Deploy-${userId || 'User'}-${type || 'new'}`,
        files: [
            {
                file: 'index.html',
                data: htmlContent,
            }
        ],
        // 🔧 Required by Vercel for new projects
        projectSettings: {
            framework: null,          // Pure HTML site
            buildCommand: null,       // No build step
            outputDirectory: null,    // Root
            devCommand: null,         // No dev command
        },
    };

    try {
        // ✅ Skip auto framework detection (fixes missing_project_settings)
        const vercelUrl = `https://api.vercel.com/v13/deployments?skipAutoDetectionConfirmation=1`;

        const deploymentResponse = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VERCEL_ACCESS_TOKEN}`,
            },
            body: JSON.stringify(deploymentPayload),
        });

        const data = await deploymentResponse.json();

        // --- Handle Vercel Errors ---
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
        console.log(`✅ Deployment success: https://${previewUrl}`);
        return res.status(200).json({ deploymentUrl: `https://${previewUrl}` });

    } catch (error) {
        console.error('Deployment fetch/parse error:', error);
        return res.status(500).json({ error: 'Internal server error during deployment.' });
    }
}
