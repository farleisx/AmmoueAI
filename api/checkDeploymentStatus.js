// /api/checkDeploymentStatus.js

import { Vercel } from '@vercel/node'; // Note: In a real Vercel environment, you might use 'node-fetch' or the built-in 'fetch' API

// Ensure you have your Vercel Token set as an environment variable
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

/**
 * Endpoint to poll the status of a Vercel deployment by ID.
 * Assumes this is running as a Vercel Serverless Function.
 */
export default async function handler(req, res) {
    // 1. Check for POST method
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    // 2. Authorization (Basic check, expand as needed)
    if (!VERCEL_TOKEN) {
        return res.status(500).json({ error: 'Server configuration error: VERCEL_TOKEN missing.' });
    }

    // 3. Extract deployment ID from request body
    const { deploymentId, userId } = req.body;

    if (!deploymentId) {
        return res.status(400).json({ error: 'Missing deploymentId in request body.' });
    }
    
    // 4. Construct Vercel API URL (using /v10 for robust deployment details)
    const deploymentApiUrl = `https://api.vercel.com/v10/deployments/${deploymentId}`;

    try {
        // 5. Fetch deployment status from Vercel
        const response = await fetch(deploymentApiUrl, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${VERCEL_TOKEN}`,
                'Content-Type': 'application/json',
            },
        });

        if (!response.ok) {
            // Log the error response from Vercel for debugging
            const vercelError = await response.json();
            console.error("Vercel API Error:", vercelError);
            return res.status(response.status).json({ 
                error: 'Failed to fetch deployment status from Vercel.', 
                details: vercelError.error?.message || response.statusText 
            });
        }

        const data = await response.json();
        
        // Vercel deployment status can be 'QUEUED', 'BUILDING', 'READY', 'ERROR', 'CANCELED'
        const status = data.state;
        
        let deploymentUrl = null;
        if (data.url) {
            // Construct the full URL using the Vercel protocol
            deploymentUrl = `https://${data.url}`;
        }

        // 6. Return the status and URL to the client
        return res.status(200).json({ 
            status: status, 
            url: deploymentUrl,
            // Include deploymentId for logging/tracing if necessary
            deploymentId: deploymentId
        });

    } catch (error) {
        console.error('API execution error:', error);
        return res.status(500).json({ error: 'Internal server error during deployment status check.' });
    }
}
