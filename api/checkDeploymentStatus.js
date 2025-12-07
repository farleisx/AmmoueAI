// file: api/checkDeploymentStatus.js

export default async function handler(req, res) {
  try {
    // Accept both GET and POST
    const deploymentId = req.method === 'GET' ? req.query.id : req.body.id;

    if (!deploymentId) {
      return res.status(400).json({ error: 'Missing deployment ID' });
    }

    // Call Vercel API
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
    console.error("Deployment check failed:", err);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}
