import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  if (!API_KEY) {
    return res.status(500).json({ error: "Gemini API key not configured." });
  }

  try {
    const { prompt, multiFile } = req.body;

    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt'." });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    const systemInstruction = `
You are a world-class AI web developer. Your sole purpose is to create a complete, professional, ${
      multiFile
        ? "multi-page website (landing page, dashboard, and login page)"
        : "single-file HTML website"
    } based on the user's prompt.
Each HTML file must be self-contained and styled only with Tailwind CSS (loaded from CDN).
All pages must be responsive and modern.
Start each page with <!DOCTYPE html> and no extra explanations.
`;

    const finalPrompt = `${systemInstruction}\n\nUser prompt: ${prompt}`;

    // STREAM response to client
    const stream = await model.generateContentStream(finalPrompt);

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    for await (const chunk of stream.stream) {
      const chunkText = chunk.text();
      if (chunkText) {
        res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Gemini streaming error:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
