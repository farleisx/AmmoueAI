// file: api/checkDeploymentStatus.js
import pkg from '@vercel/node';
const { Vercel } = pkg; // destructure from default import

// If you just want to use fetch, you can also skip Vercel entirely
// since Vercel’s API can be called with fetch

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const deploymentId = req.query.id; // get deployment id from query params
    if (!deploymentId) {
      return res.status(400).json({ error: 'Missing deployment ID' });
    }

    // Example using Vercel SDK if needed
    // const client = new Vercel({ token: process.env.VERCEL_TOKEN });
    // const deployment = await client.getDeployment(deploymentId);

    // Or simpler: call Vercel API via fetch
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
    res.status(200).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
