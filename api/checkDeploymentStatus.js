// file: api/checkDeploymentStatus.js
export default async function handler(req, res) {
    // Accept only POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    try {
        const { deploymentId } = req.body; // get deploymentId from POST body
        if (!deploymentId) {
            return res.status(400).json({ error: 'Missing deployment ID' });
        }

        // Call Vercel API to get deployment status
        const response = await fetch(
            `https://api.vercel.com/v13/deployments/${deploymentId}`,
            {
                headers: {
                    Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
                },
            }
        );

        if (!response.ok) {
            const errorText = await response.text();
            return res.status(response.status).json({ error: errorText });
        }

        const data = await response.json();

        // Map Vercel states to frontend-friendly format
        const validStates = ['QUEUED', 'BUILDING', 'READY', 'ERROR'];
        const status = validStates.includes(data.state) ? data.state : 'ERROR';
        const url = data.url || null;

        res.status(200).json({
            status,
            url,
            // optional: send additional details for debugging
            createdAt: data.createdAt,
            errorDetail: data.error || null
        });

    } catch (err) {
        console.error("Check Deployment Error:", err);
        res.status(500).json({ error: 'Internal Server Error' });
    }
}
