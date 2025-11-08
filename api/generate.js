import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery, imageCount = 5 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Fetch images from Pexels if query provided
    let imageURLs = [];
    if (pexelsQuery && PEXELS_API_KEY) {
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

    // Convert URLs to <img> tags (if any)
    const imageTags = imageURLs
      .map(
        url =>
          `<img src="${url}" alt="AI image" class="rounded-lg shadow-lg mx-auto my-4">`
      )
      .join("\n");

    // ✅ Gemini system prompt
    const systemInstruction = `
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Use Tailwind CSS via CDN for all styling.

Embed the following images exactly as written into the website HTML:
${imageTags}

// Important instructions:
1. If the list above is empty, DO NOT use placeholders.
2. Instead, find real, publicly available images from Pexels, Unsplash, or relevant web sources related to the user prompt.
3. Only embed actual working image URLs — never invent fake URLs.
4. Ensure each image is embedded with proper <img> HTML tags and includes rounded corners and shadow styling.
5. The output must be a single, self-contained HTML file starting with <!DOCTYPE html>.

User prompt: ${prompt}
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
