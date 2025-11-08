import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// Helper: fetch Pexels with retries
async function fetchPexelsImages(query, count = 5, retries = 3) {
  if (!PEXELS_API_KEY) return [];
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=${count}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );

      if (!res.ok) {
        console.warn(`Pexels fetch attempt ${attempt} failed:`, res.status);
        continue;
      }

      const data = await res.json();
      const urls = (data.photos || [])
        .map(p => p?.src?.large)
        .filter(url => typeof url === "string");

      if (urls.length > 0) return urls;
    } catch (err) {
      console.warn(`Pexels fetch attempt ${attempt} error:`, err);
    }
  }
  return [];
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery, imageCount = 5 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Fetch Pexels images with retries
    let imageURLs = [];
    if (pexelsQuery) {
      imageURLs = await fetchPexelsImages(pexelsQuery, imageCount);
    }

    // ✅ Fallback if no images found
    if (imageURLs.length === 0) {
      imageURLs = [
        "https://via.placeholder.com/600x400?text=Image+1",
        "https://via.placeholder.com/600x400?text=Image+2",
        "https://via.placeholder.com/600x400?text=Image+3",
      ];
    }

    // ✅ Convert URLs to <img> tags
    const imageTags = imageURLs
      .map(url => `<img src="${url}" alt="AI image" class="rounded-lg shadow-lg mx-auto my-4">`)
      .join("\n");

    // ✅ Prepare AI prompt
    const systemInstruction = `
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Use Tailwind CSS via CDN for all styling.
Embed the following images exactly as written into the website HTML:
${imageTags}

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
