import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery: userQuery, imageCount = 5 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Step 1: Use Gemini to generate a *focused visual query* for Pexels
    let pexelsQuery = userQuery;
    if (!pexelsQuery) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });

        const queryPrompt = `
Given this user request for a website:
"${prompt}"

Generate a short, visually descriptive search query (1–5 words max)
that would produce relevant, professional, real-world images on Pexels.
Only return the query text, nothing else.
        `;

        const queryResult = await model.generateContent(queryPrompt);
        pexelsQuery = queryResult.response.text().trim();
        console.log("🔍 Generated Pexels query:", pexelsQuery);
      } catch (err) {
        console.warn("Gemini query generation failed:", err);
        // fallback: use first few words
        pexelsQuery = prompt.split(" ").slice(0, 5).join(" ");
      }
    }

    // ✅ Step 2: Fetch images from Pexels using improved query
    let imageURLs = [];
    if (PEXELS_API_KEY) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(
            pexelsQuery
          )}&per_page=${imageCount}`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        const data = await pexelsRes.json();

        // ✅ Rank images by how well alt text matches prompt
        const photos = (data.photos || [])
          .filter(p => p.src?.large)
          .sort((a, b) => {
            const promptWords = prompt.toLowerCase().split(/\s+/);
            const aScore = promptWords.filter(w =>
              a.alt?.toLowerCase().includes(w)
            ).length;
            const bScore = promptWords.filter(w =>
              b.alt?.toLowerCase().includes(w)
            ).length;
            return bScore - aScore;
          });

        imageURLs = photos.map(p => p.src.large);
        console.log(`📸 Found ${imageURLs.length} Pexels images`);
      } catch (err) {
        console.warn("Pexels fetch error:", err);
      }
    }

    // ✅ Step 3: Build system instruction for Gemini
    const systemInstruction = `
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Use Tailwind CSS via CDN for all styling.

Priority for embedding images:
1. Use the following Pexels images if available:
${imageURLs.join("\n") || "No Pexels images found."}

2. If Pexels images are not available or insufficient, automatically fetch real, visually relevant images from public web sources.
   Do NOT use Unsplash under any circumstances.

Ensure the website is modern, visually appealing, and integrates the images naturally with the design.
User prompt: ${prompt}

Output must be a single, self-contained HTML file starting with <!DOCTYPE html>.
    `;

    // ✅ Step 4: Stream Gemini’s output live
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
      `data: ${JSON.stringify({
        error: err.message || "Internal server error.",
      })}\n\n`
    );
    res.end();
  }
}
