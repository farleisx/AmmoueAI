import { GoogleGenerativeAI } from "@google/generative-ai";

// Use environment variables directly (assuming they are correctly configured in the runtime)
const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    // We now destructure imageUrls, which is an optional array of strings
    const { prompt, imageUrls } = req.body;
    
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
    }

    // Setup streaming headers (Server-Sent Events)
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    // Base System Instruction
    let systemInstruction = `
      You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt.
      The output MUST be a single, self-contained HTML file.
      The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
      The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
      All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
      Use modern, responsive design principles (flex/grid, responsive prefixes like sm:, md:, lg:). The design must be aesthetically beautiful, professional, and fully functional on mobile and desktop.
      The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>.
    `;
    
    // Check for and append image mandate if URLs are provided
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      const urlsList = imageUrls.map(url => ` - ${url}`).join('\n');
      systemInstruction += `\n\n**MANDATE: INCORPORATE THESE IMAGES**\nUse the following image URLs in the generated HTML. Assign them to appropriate sections based on the user's prompt:\n${urlsList}`;
    }


    // Start streaming the AI output
    const streamResult = await model.generateContentStream({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        systemInstruction: systemInstruction, // Using the updated instruction
      },
    });

    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text();
      if (textChunk) {
        // Send each chunk to the client
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
      }
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Gemini streaming failed:", err);
    // Ensure the error response is also sent as an SSE event before ending the stream
    res.write(`data: ${JSON.stringify({ error: err.message || "Internal server error." })}\n\n`);
    res.end();
  }
}
