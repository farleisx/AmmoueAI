import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  if (!API_KEY) {
    console.error("GEMINI_API_KEY missing in environment variables.");
    return res.status(500).json({ error: "Gemini API key not configured." });
  }

  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    const systemInstruction = `
You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt.
The output MUST be a single, self-contained HTML file.
The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
Use modern, responsive design principles (flex/grid, responsive prefixes like sm:, md:, lg:). The design must be aesthetically beautiful, professional, and fully functional on mobile and desktop.
The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>.
`;

    const fullPrompt = `${systemInstruction}\n\nUser prompt: ${prompt}`;

    const result = await model.generateContent(fullPrompt);

    const text = result.response.text();

    if (!text) {
      console.error("Gemini returned empty response:", result);
      return res.status(500).json({ error: "Gemini API returned empty response." });
    }

    return res.status(200).json({ htmlCode: text.trim() });
  } catch (err) {
    console.error("Gemini generation failed:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
