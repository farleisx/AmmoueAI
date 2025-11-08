import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery: userQuery, imageCount = 5 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Determine Pexels query automatically if not provided
    const pexelsQuery = userQuery || prompt.split(" ").slice(0, 3).join(" "); // first 3 words of prompt

    // ✅ Fetch Pexels images
    let imageURLs = [];
    if (PEXELS_API_KEY) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${imageCount}`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        const data = await pexelsRes.json();
        imageURLs = (data.photos || [])
          .map(p => p?.src?.large)
          .filter(url => typeof url === "string");
      } catch (err) {
        console.warn("Pexels fetch error:", err);
      }
    }

    // ✅ Prepare AI instructions with clear priority
    const systemInstruction = `
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Use Tailwind CSS via CDN for all styling.

Priority for embedding images:
1. First, use the following Pexels images if available:
${imageURLs.join("\n")}

2. If Pexels images are not available, automatically fetch real, visually relevant images from public web sources. 
Do NOT use Unsplash.

Make the website fully visually appealing and integrate the images naturally with the content.
User prompt: ${prompt}

Output must be a single, self-contained HTML file starting with <!DOCTYPE html>.
`;

    // ✅ Streaming headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const streamResult = await model.generateContentStream(systemInstruction);

    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text?.() || chunk.delta?.content || "";
      if (textChunk) res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Generate error:", err);
    res.write(
      `data: ${JSON.stringify({ error: err.message || "Internal server error." })}\n\n`
    );
    res.end();
  }
}
