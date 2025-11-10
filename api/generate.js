import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery: userQuery, imageCount = 10, videoCount = 2 } =
      req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Step 1: Generate focused visual search query using Gemini
    let pexelsQuery = userQuery;
    if (!pexelsQuery) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });

        const queryPrompt = `
Given this user website request:
"${prompt}"

Generate a short, vivid Pexels search query (1–5 words)
that captures the main visual theme for both images and videos.
Example: "luxury perfume bottles" or "modern coffee shop interior".
Only return the text query.
        `;

        const queryResult = await model.generateContent(queryPrompt);
        pexelsQuery = queryResult.response.text().trim();
        console.log("🔍 Generated Pexels query:", pexelsQuery);
      } catch (err) {
        console.warn("Gemini query generation failed:", err);
        pexelsQuery = prompt.split(" ").slice(0, 5).join(" ");
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
          const words = prompt.toLowerCase().split(/\s+/);
          const aScore = words.filter((w) =>
            a.alt?.toLowerCase().includes(w)
          ).length;
          const bScore = words.filter((w) =>
            b.alt?.toLowerCase().includes(w)
          ).length;
          return bScore - aScore;
        });

      imageURLs = photos.map((p) => p.src.large);
      console.log(`📸 Found ${imageURLs.length} Pexels images`);
    } catch (err) {
      console.warn("Pexels image fetch error:", err);
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
      const promptWords = prompt.toLowerCase().split(/\s+/);
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
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Use Tailwind CSS via CDN for all styling.

Media resources:
🎥 Hero video (use as background in hero section): 
${heroVideo || "No video available."}

📸 Pexels images:
${imageURLs.join("\n") || "No images available."}

🎥 Additional Pexels videos:
${videoURLs.join("\n") || "No extra videos."}

Rules:
- Use the hero video as a full-width, looping, muted background in the hero section.
- Blend additional videos or images elegantly in later sections.
- Keep the design cinematic, modern, and responsive.
- Do NOT use Unsplash.
- Use only the provided media or fallback to public web sources (never blank sections).
User prompt: ${prompt}

Output must be a single, self-contained HTML file starting with <!DOCTYPE html>.
    `;

    // ✅ Step 5: Stream Gemini output
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const streamResult = await model.generateContentStream(systemInstruction);

    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text?.() || chunk.delta?.content || "";
      if (textChunk)
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
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
