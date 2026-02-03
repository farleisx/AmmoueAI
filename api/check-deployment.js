// api/check-deployment.js
export default async function handler(req, res) {
  const { deploymentId } = req.query;
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

  try {
    const response = await fetch(`https://api.vercel.com/v13/deployments/${deploymentId}${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ""}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });

    const data = await response.json();
    
    // Check for alias first to avoid random deployment URLs
    let finalUrl = data.url;
    if (data.alias && data.alias.length > 0) {
      finalUrl = data.alias[0];
    }

    // Statuses: INITIALIZING, ANALYZING, BUILDING, DEPLOYING, READY, or ERROR
    res.status(200).json({ 
      status: data.readyState || data.status, 
      url: finalUrl ? `https://${finalUrl}` : null 
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch status" });
  }
}
