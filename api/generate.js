import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Use POST." });

  const { prompt } = req.body;
  if (!prompt || typeof prompt !== "string") return res.status(400).json({ error: "Missing 'prompt'." });

  try {
    // 1️⃣ Fetch images from Pexels
    const pexelsRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(prompt)}&per_page=5`, {
      headers: { Authorization: process.env.PEXELS_API_KEY }
    });
    const pexelsData = await pexelsRes.json();
    const imageUrls = (pexelsData.photos || []).map(p => p.src.large);

    // 2️⃣ Build Gemini system prompt
    const systemInstruction = `
You are a world-class AI web developer. Generate a complete, single-file HTML website using Tailwind CSS based on the user's prompt.
Include the following real images in appropriate sections: ${imageUrls.join(", ")}.
HTML must be fully responsive, professional, aesthetically beautiful, mobile-friendly, and use Tailwind classes exclusively.
Return only the raw HTML code starting with <!DOCTYPE html>.
`;

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    // 3️⃣ Stream generation
    const streamResult = await model.generateContentStream(`${systemInstruction}\nUser prompt: ${prompt}`);
    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text();
      if (textChunk) res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err) {
    console.error(err);
    res.write(`data: ${JSON.stringify({ error: err.message || "Internal server error." })}\n\n`);
    res.end();
  }
}
