const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID; 
// Only needed if you are using a Vercel Team
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID; 

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // Ensure we are handling the request body correctly
    const { html, userId, type } = req.body;

    if (!html || !userId || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        // This catches missing env vars *or* missing client data
        return res.status(400).json({ error: 'Missing data or environment variables. Check VERCEL_ACCESS_TOKEN/PROJECT_ID.' });
    }

    const deploymentPayload = {
        files: [
            {
                file: 'index.html',
                data: html,
                flags: { 'Content-Type': 'text/html; charset=utf-8' }
            }
        ],
        name: `Ammoue-Deploy-${userId}-${type || 'new'}`, // Use the user ID in the name for tracking
        target: 'preview',
        project: VERCEL_PROJECT_ID,
    };

    try {
        let vercelUrl = `https://api.vercel.com/v13/deployments`;
        if (VERCEL_TEAM_ID) {
            vercelUrl += `?teamId=${VERCEL_TEAM_ID}`; 
        }

        const deploymentResponse = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${VERCEL_ACCESS_TOKEN}`, 
            },
            body: JSON.stringify(deploymentPayload),
        });

        // Attempt to parse JSON regardless of deploymentResponse.ok status
        // This ensures we get the Vercel error message if it exists
        const data = await deploymentResponse.json();

        if (!deploymentResponse.ok) {
            console.error('Vercel API Status:', deploymentResponse.status);
            console.error('Vercel API Error Response:', JSON.stringify(data, null, 2));

            // Return the Vercel status code back to the client for better diagnosis
            return res.status(deploymentResponse.status).json({ 
                error: 'Deployment failed. Vercel API returned an error.', 
                details: data.error?.message || `Vercel Status Code: ${deploymentResponse.status}`,
                code: data.error?.code
            });
        }
        
        // Success path
        const previewUrl = data.url; 
        return res.status(200).json({ previewUrl: `https://${previewUrl}` });

    } catch (error) {
        console.error('Deployment fetch/parse error:', error);
        // This is the generic crash handler
        return res.status(500).json({ error: 'Internal server error (Function crashed before Vercel response).' });
    }
}
