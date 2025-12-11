import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// helper: extract keywords from prompt
function extractKeywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });

  try {
    const { 
      prompt, 
      pexelsQuery: userQuery, 
      imageCount = 10, 
      videoCount = 2,
      // 🌟 NEW: Accept the uploaded image URL from the client
      uploadedImageUrl 
    } = req.body;

    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Step 1: Generate focused Pexels query
    let pexelsQuery = userQuery;
    if (!pexelsQuery) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });

        const queryPrompt = `
Given this website description:
"${prompt}"

Generate a short (1-5 words) Pexels search query focused ONLY on real-world objects mentioned in the prompt.
RULES:
- Focus on tangible items (e.g., PS4 console, Xbox controller, coffee shop interior)
- Ignore vague categories like "gaming" or "technology"
- Do NOT invent abstract terms
- Only return the query text
        `;

        const queryResult = await model.generateContent(queryPrompt);
        pexelsQuery = (queryResult.response.text?.() || "").trim();

        // fallback if Gemini returns empty or nonsense
        if (!pexelsQuery) {
          const keywords = extractKeywords(prompt).slice(0, 5);
          pexelsQuery = keywords.join(" ");
        }

        console.log("🔍 Generated Pexels query:", pexelsQuery);
      } catch (err) {
        console.warn("Gemini query generation failed:", err);
        const keywords = extractKeywords(prompt).slice(0, 5);
        pexelsQuery = keywords.join(" ");
      }
    }

    // ✅ Step 2: Fetch Pexels Images
    let imageURLs = [];
    try {
      const pexelsRes = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${imageCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const data = await pexelsRes.json();

      const photos = (data.photos || [])
        .filter((p) => p.src?.large)
        .sort((a, b) => {
          const words = extractKeywords(prompt);
          const aScore = words.filter((w) =>
            new RegExp(`\\b${w}\\b`, "i").test(a.alt || "")
          ).length;
          const bScore = words.filter((w) =>
            new RegExp(`\\b${w}\\b`, "i").test(b.alt || "")
          ).length;
          return bScore - aScore;
        });

      imageURLs = photos.map((p) => p.src.large);
      console.log(`📸 Found ${imageURLs.length} Pexels images`);
    } catch (err) {
      console.warn("Pexels image fetch error:", err);
    }

    // 🌟 NEW: Prioritize User Uploaded Image (Step 2.5)
    if (uploadedImageUrl) {
        imageURLs.unshift(uploadedImageUrl); // Add user image to the beginning of the list
        console.log("⬆️ User uploaded image prioritized:", uploadedImageUrl);
    }

    // ✅ Step 3: Fetch Pexels Videos
    let videoURLs = [];
    let heroVideo = "";
    try {
      const videoRes = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${videoCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const videoData = await videoRes.json();

      const videos = (videoData.videos || [])
        .map((v) => ({
          url: v.video_files?.[0]?.link,
          width: v.video_files?.[0]?.width || 0,
          height: v.video_files?.[0]?.height || 0,
          duration: v.duration || 0,
          tags: v.user?.name || "",
        }))
        .filter((v) => v.url);

      // Pick hero video based on prompt relevance
      const promptWords = extractKeywords(prompt);
      videos.sort((a, b) => {
        const aScore = promptWords.filter((w) =>
          (a.tags || "").toLowerCase().includes(w)
        ).length;
        const bScore = promptWords.filter((w) =>
          (b.tags || "").toLowerCase().includes(w)
        ).length;
        return bScore - aScore;
      });

      heroVideo = videos[0]?.url || "";
      videoURLs = videos.map((v) => v.url);
      console.log(`🎥 Found ${videoURLs.length} Pexels videos`);
      if (heroVideo) console.log("⭐ Selected hero video:", heroVideo);
    } catch (err) {
      console.warn("Pexels video fetch error:", err);
    }

    // ✅ Step 4: Build AI Instruction
    const systemInstruction = `
You are an elite web development super-expert. Generate a single self-contained HTML website based on the user's prompt and supplied media resources.

Hero video: ${heroVideo || "No video available."}
Pexels images: ${imageURLs.join("\n") || "No images available."}
Additional videos: ${videoURLs.join("\n") || "No extra videos."}

User prompt: ${prompt}
    `;

    // ✅ Step 5: Stream Gemini output
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    if (res.flushHeaders) res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const streamResult = await model.generateContentStream(systemInstruction);

    try {
      for await (const chunk of streamResult.stream ?? []) {
        const textChunk = chunk.text?.() || chunk.delta?.content || "";
        if (textChunk)
          res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamErr) {
      console.error("Stream error:", streamErr);
      res.write(
        `data: ${JSON.stringify({
          error: streamErr.message || "Stream error",
          done: true,
        })}\n\n`
      );
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) res.status(500).json({ error: err.message || "Internal server error." });
    else {
      res.write(
        `data: ${JSON.stringify({ error: err.message || "Internal server error.", done: true })}\n\n`
      );
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }
}
