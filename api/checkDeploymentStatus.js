export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { deploymentUrl } = req.body;

    if (!deploymentUrl) {
      return res.status(400).json({ 
        status: "ERROR", 
        errorDetail: "Missing deploymentUrl" 
      });
    }

    // Try to fetch the deployed site
    const check = await fetch(deploymentUrl, { method: "GET" });

    if (check.ok) {
      return res.status(200).json({
        status: "READY",
        url: deploymentUrl
      });
    }

    return res.status(200).json({
      status: "BUILDING",
      url: deploymentUrl
    });

  } catch (err) {
    return res.status(200).json({
      status: "BUILDING",
      url: null
    });
  }
}
