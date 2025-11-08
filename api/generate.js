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

    // ✅ Fetch images from Pexels
    let imageSectionHTML = "<!-- no images -->";
    if (pexelsQuery && PEXELS_API_KEY) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${imageCount}`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        const data = await pexelsRes.json();

        if (Array.isArray(data.photos) && data.photos.length > 0) {
          const urls = data.photos
            .map(photo => photo?.src?.large)
            .filter(url => typeof url === "string" && url.length > 0);

          // ✅ Tailwind responsive grid
          imageSectionHTML = `
<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 my-6">
  ${urls
    .map(
      url =>
        `<img src="${url}" alt="AI image" class="rounded-lg shadow-lg w-full h-auto object-cover">`
    )
    .join("\n")}
</div>`;
        }
      } catch (err) {
        console.warn("Pexels fetch error:", err);
        imageSectionHTML = "<!-- image fetch failed -->";
      }
    }

    // ✅ Prepare AI prompt
    const systemInstruction = `
You are a world-class AI web developer. Create a complete, professional, single-file HTML website.
Embed the following image section exactly as written into the website HTML:
${imageSectionHTML}

User prompt: ${prompt}
The output must be a single, self-contained HTML file starting with <!DOCTYPE html>.
Use Tailwind CSS via CDN for all styling.
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
