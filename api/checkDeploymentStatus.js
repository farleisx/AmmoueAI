import fetch from "node-fetch";

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { deploymentId } = req.body;
  if (!deploymentId) return res.status(400).json({ status: "ERROR", error: "Missing deploymentId" });

  try {
    const vercelRes = await fetch(
      `https://api.vercel.com/v13/deployments/${deploymentId}${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ""}`,
      { headers: { Authorization: `Bearer ${VERCEL_TOKEN}` } }
    );

    const data = await vercelRes.json();

    // Parse readyState
    const state = data.readyState;
    if (state === "READY") {
      return res.status(200).json({ status: "READY", url: `https://${data.url}` });
    } else if (state === "ERROR" || state === "CANCELED") {
      return res.status(200).json({ status: "ERROR", error: "Deployment failed on Vercel" });
    } else {
      // QUEUED or BUILDING
      return res.status(200).json({ status: state });
    }
  } catch (err) {
    console.error("CHECK STATUS ERROR:", err);
    return res.status(500).json({ status: "ERROR", error: "Failed to fetch deployment status" });
  }
}
