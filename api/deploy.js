import fetch from 'node-fetch';

// ✅ Environment variables (make sure they're set in your Vercel dashboard)
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { htmlContent, userId, type } = req.body;

    // --- Validation ---
    if (!htmlContent || !VERCEL_ACCESS_TOKEN || !VERCEL_PROJECT_ID) {
        console.error("Missing Environment or Content:", {
            hasAccessToken: !!VERCEL_ACCESS_TOKEN,
            hasProjectId: !!VERCEL_PROJECT_ID,
            hasHtml: !!htmlContent
        });

        return res.status(400).json({
            error: 'Missing data or environment variables.',
            details: 'Required: htmlContent, VERCEL_ACCESS_TOKEN, VERCEL_PROJECT_ID.'
        });
    }

    // --- Deployment Payload ---
    const deploymentPayload = {
        name: `ammoue-deploy-${userId || 'anon'}-${type || 'new'}`,
        files: [
            {
                file: 'index.html',
                data: htmlContent,
            }
        ]
    };

    try {
        const vercelUrl = 'https://api.vercel.com/v13/deployments';

        const deploymentResponse = await fetch(vercelUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${VERCEL_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(deploymentPayload),
        });

        const data = await deploymentResponse.json();

        if (!deploymentResponse.ok) {
            console.error('❌ Vercel API Error:', data);
            return res.status(deploymentResponse.status).json({
                error: 'Deployment failed. Vercel API returned an error.',
                details: data.error?.message || `Status: ${deploymentResponse.status}`,
                code: data.error?.code
            });
        }

        // ✅ Success
        const deploymentUrl = `https://${data.url}`;
        console.log('✅ Deployment Successful:', deploymentUrl);
        return res.status(200).json({ deploymentUrl });

    } catch (error) {
        console.error('⚠️ Deployment Crash:', error);
        return res.status(500).json({ error: 'Internal server error.' });
    }
}
