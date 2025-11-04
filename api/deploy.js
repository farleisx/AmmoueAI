import fetch from 'node-fetch';

// Vercel environment variables
const VERCEL_ACCESS_TOKEN = process.env.VERCEL_ACCESS_TOKEN;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

// Helper: sanitize string for Vercel project name
function sanitizeName(str) {
    return str
        .toLowerCase()
        .replace(/[^a-z0-9._-]/g, '-')   // replace invalid chars with '-'
        .replace(/-+/g, '-')             // collapse multiple '-' into one
        .replace(/^-+|-+$/g, '')         // trim leading/trailing '-'
        .slice(0, 80);                   // keep under 100 chars
}

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { htmlContent, userId, type } = req.body;

    // Validation
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

    // Sanitize project name
    const safeUserId = sanitizeName(userId || 'user');
    const safeType = sanitizeName(type || 'new');
    const projectName = `ammoue-deploy-${safeUserId}-${safeType}`;

    // Deployment payload (public)
    const deploymentPayload = {
        name: projectName,
        public: true, // ✅ make deployment public
        files: [
            {
                file: 'index.html',
                data: htmlContent,
            }
        ],
        projectSettings: {
            framework: null,
            buildCommand: null,
            outputDirectory: null,
            devCommand: null,
        },
    };

    try {
        // Skip auto framework detection
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

        // Handle errors
        if (!deploymentResponse.ok) {
            console.error('Vercel API Status:', deploymentResponse.status);
            console.error('Vercel API Error Response:', JSON.stringify(data, null, 2));

            return res.status(deploymentResponse.status).json({ 
                error: 'Deployment failed. Vercel API returned an error.', 
                details: data.error?.message || `Vercel Status Code: ${deploymentResponse.status}`,
                code: data.error?.code
            });
        }
        
        // Success
        const previewUrl = data.url;
        console.log(`✅ Deployment success: https://${previewUrl}`);
        return res.status(200).json({ deploymentUrl: `https://${previewUrl}` });

    } catch (error) {
        console.error('Deployment fetch/parse error:', error);
        return res.status(500).json({ error: 'Internal server error during deployment.' });
    }
}
