import fetch from "node-fetch";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { deploymentId } = req.body;
  if (!deploymentId) {
    return res.status(400).json({ status: "ERROR", error: "Missing deploymentId" });
  }

  try {
    const statusRes = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ""}`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );

    const deployment = await statusRes.json();

    switch (deployment.readyState) {
      case "READY":
        return res.status(200).json({ status: "READY", url: `https://${deployment.url}`, deploymentId });
      case "QUEUED":
        return res.status(200).json({ status: "QUEUED", deploymentId });
      case "ERROR":
      case "CANCELED":
        return res.status(200).json({ status: "ERROR", error: deployment.errorMessage || "Deployment failed", deploymentId });
      default:
        return res.status(200).json({ status: "BUILDING", deploymentId });
    }

  } catch (err) {
    console.error("CHECK STATUS ERROR:", err);
    return res.status(500).json({
      status: "ERROR",
      error: "Failed to check deployment status",
      details: err.message,
      deploymentId
    });
  }
}
