// api/check-deployment.js
export default async function handler(req, res) {
  const { deploymentId } = req.query;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;

  try {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });

    const data = await response.json();
    
    // Statuses: INITIALIZING, ANALYZING, BUILDING, DEPLOYING, READY, or ERROR
    res.status(200).json({ 
      status: data.status, 
      url: data.url ? `https://${data.url}` : null 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
}
