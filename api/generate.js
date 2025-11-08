import { GoogleGenerativeAI } from "@google/generative-ai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery, imageCount = 5 } = req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Fetch Pexels images using global fetch (Node 18+)
    let imageTags = "";
    if (pexelsQuery && PEXELS_API_KEY) {
      try {
        const pexelsRes = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(
            pexelsQuery
          )}&per_page=${imageCount}`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );

        if (!pexelsRes.ok) {
          console.warn("Pexels fetch failed:", pexelsRes.status, await pexelsRes.text());
        } else {
          const data = await pexelsRes.json();
          const urls = (data.photos || [])
            .map(p => p?.src?.large)
            .filter(url => typeof url === "string");

          imageTags = urls
            .map(
              url =>
                `<img src="${url}" alt="AI image" class="rounded-lg shadow-lg mx-auto my-4">`
            )
            .join("\n");
        }
      } catch (err) {
        console.warn("Pexels fetch error:", err);
      }
    }

    // ✅ Fallback images if Pexels fails
    if (!imageTags) {
      imageTags = [
        "https://via.placeholder.com/600x400?text=Image+1",
        "https://via.placeholder.com/600x400?text=Image+2",
        "https://via.placeholder.com/600x400?text=Image+3",
      ]
        .map(
          url => `<img src="${url}" alt="Fallback image" class="rounded-lg shadow-lg mx-auto my-4">`
        )
        .join("\n");
    }

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
