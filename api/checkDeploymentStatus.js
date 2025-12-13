// pages/api/checkDeploymentStatus.js
import fetch from "node-fetch";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { deploymentUrl } = req.body;

  if (!deploymentUrl) {
    return res.status(400).json({ error: "Missing deploymentUrl" });
  }

  // Extract Deployment ID from the URL (Vercel deployment URLs often contain the ID)
  // In a real-world scenario, the frontend should pass the deploymentId from the previous step.
  // We'll rely on the Vercel Deployments API to fetch the latest status by its name/URL.
  // A simpler, safer approach is to check the latest deployment for the specific project.
  // For this implementation, we will assume the frontend is polling for the latest deployment status.

  // ⭐ IMPROVEMENT: We will assume the frontend actually sends the ID:
  // We need to retrieve the deployment ID, either from the frontend or from Firestore (if we passed the projectId).
  // Since the frontend is sending the URL, we'll fetch the deployment list and find the matching one.
  
  // To avoid complexity, let's assume the frontend should pass the Vercel ID in the polling request.
  // However, based on the frontend's original JS, it passes deploymentUrl:
  // body: JSON.stringify({ deploymentUrl: latestDeploymentUrl, userId: currentUserId })
  
  // Let's use the standard Vercel API to look up a deployment by its name (which is the VERCEL_PROJECT):
  
  try {
    // 1. Get the list of deployments for the project
    const url = `https://api.vercel.com/v6/deployments?projectId=${VERCEL_PROJECT}${
      VERCEL_TEAM_ID ? `&teamId=${VERCEL_TEAM_ID}` : ""
    }&meta-url=${deploymentUrl}`; // Filter by the specific URL
    
    const vercelRes = await fetch(url, {
      headers: {
        Authorization: `Bearer ${VERCEL_TOKEN}`,
      },
    });

    const data = await vercelRes.json();
    
    if (!vercelRes.ok || !data.deployments || data.deployments.length === 0) {
      // If the specific deployment is not found yet, return building/queued
      // A more robust system would need the Vercel UID, but this approach is simpler for a quick fix.
      return res.status(200).json({ status: "BUILDING", url: deploymentUrl }); 
    }
    
    // 2. Find the deployment that matches the URL
    // Vercel returns a list, find the one with the correct URL/state
    const deployment = data.deployments.find(d => 
        (d.url && d.url.includes(new URL(deploymentUrl).hostname))
    );

    if (!deployment) {
        // If not found yet, treat as still building
        return res.status(200).json({ status: "QUEUED", url: deploymentUrl }); 
    }

    // 3. Return the status
    const status = deployment.readyState; // Expected: QUEUED, BUILDING, READY, ERROR
    const finalUrl = `https://${deployment.url}`;

    return res.status(200).json({
      status: status,
      url: finalUrl,
      errorDetail: deployment.error?.message,
    });
    
  } catch (err) {
    console.error("Vercel status check error:", err);
    return res.status(500).json({
      error: "Internal server error during status check",
      details: err.message,
    });
  }
}
