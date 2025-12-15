// /api/generate.js
import { json } from "stream/consumers"; // optional depending on runtime
import fetch from "node-fetch";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const { prompt, images } = req.body;

    if (!prompt || prompt.length < 5) {
      return res.status(400).json({ error: "Prompt is too short" });
    }

    // Only use images if explicitly requested in the prompt
    const useImages = images?.length > 0 && /use my uploaded image|use uploaded image|use my image/i.test(prompt);

    // Build Gemini input
    const geminiPrompt = `
You are a world-class web developer AI.
TASK: Generate ONE self-contained HTML file from the user prompt.
RULES:
- Output ONLY valid HTML
- NO markdown, NO explanations
- Ignore external images unless instructed
IMAGE USAGE:
${useImages
  ? `Use uploaded images as follows:
  - First image as hero if requested
  - Remaining images in gallery sections if requested`
  : `Do NOT use uploaded images unless explicitly asked.`}
USER PROMPT: ${prompt}
    `.trim();

    // Build request body for Gemini
    const body = {
      model: "gemini-2.5",
      prompt: geminiPrompt,
      max_output_tokens: 4000,
      // Include images as inlineData only if explicitly requested
      images: useImages
        ? images.map((b64, i) => ({
            name: `uploaded_image_${i + 1}.png`,
            mimeType: "image/png",
            data: b64.split(",")[1] // remove data:image/png;base64,
          }))
        : []
    };

    // Stream response from Gemini
    const response = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GOOGLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("Gemini Error:", err);
      return res.status(500).json({ error: "Failed to generate HTML" });
    }

    // Stream back to frontend as SSE
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");

    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      const chunks = buffer.split("data:");
      buffer = chunks.pop(); // last incomplete chunk

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed) continue;
        if (trimmed === "[DONE]") continue;

        try {
          const json = JSON.parse(trimmed);
          const text = json.text || "";
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        } catch (err) {
          console.error("Failed to parse chunk:", trimmed, err);
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (error) {
    console.error("Generation API Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
