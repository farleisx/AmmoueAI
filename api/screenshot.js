// api/screenshot.js
import fetch from "node-fetch";

const APIFLASH_KEY = process.env.APIFLASH_KEY; // Get a free key at https://apiflash.com

export default async function handler(req, res) {
    if (req.method !== "POST") {
        return res.status(405).json({ error: "Method Not Allowed" });
    }

    try {
        const { url, htmlContent } = req.body;

        let screenshotUrl;

        if (url) {
            // Use ApiFlash to take a screenshot of a live URL
            const apiUrl = `https://api.apiflash.com/v1/urltoimage?access_key=${APIFLASH_KEY}&url=${encodeURIComponent(
                url
            )}&format=png&full_page=true`;
            
            const response = await fetch(apiUrl);
            const buffer = await response.arrayBuffer();

            screenshotUrl = `data:image/png;base64,${Buffer.from(buffer).toString("base64")}`;
        } else if (htmlContent) {
            // For local HTML content, we need a simple temp page hosting solution.
            // Quick workaround: reject for now
            return res.status(400).json({
                error: "Local HTML screenshots are not supported with ApiFlash. Deploy your site first."
            });
        } else {
            return res.status(400).json({ error: "No URL or HTML content provided" });
        }

        return res.status(200).json({ screenshotUrl });
    } catch (err) {
        console.error("Screenshot API error:", err);
        return res.status(500).json({ error: "Failed to generate screenshot", details: err.message });
    }
}
