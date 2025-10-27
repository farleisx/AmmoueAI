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
    const { prompt } = req.body; // No longer checking for 'multiPage' flag, rely on prompt analysis
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    
    // Check if the user's prompt explicitly asks for multiple pages
    const isMultiPageRequest = 
        prompt.toLowerCase().includes('dashboard') || 
        prompt.toLowerCase().includes('two pages') ||
        prompt.toLowerCase().includes('multiple files');

    let systemInstruction;
    let responseKey;

    if (isMultiPageRequest) {
        // --- MULTI-FILE INSTRUCTION ---
        systemInstruction = `
You are a world-class AI web developer. Your goal is to create a complete, professional, multi-file web project based on the user's prompt.
The output MUST be a single JSON object.
This JSON object MUST have a single key called 'files'.
The 'files' value MUST be a JSON object mapping filenames to their full HTML content (e.g., {"index.html": "...", "dashboard.html": "..."}).
Each HTML file MUST be self-contained: include the necessary Tailwind CSS CDN and viewport meta tag.
All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files (e.g., style.css).
Use modern, responsive design principles. The design must be aesthetically beautiful, professional, and fully functional.
The entire output should contain NOTHING but the raw JSON object, starting with { and ending with }. Do not wrap it in markdown fences (e.g., \`\`\`json).
`;
        responseKey = 'files';
    } else {
        // --- SINGLE-FILE INSTRUCTION (Backward Compatibility) ---
        systemInstruction = `
You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt.
The output MUST be a single, self-contained HTML file, starting with <!DOCTYPE html>.
The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>.
`;
        responseKey = 'htmlCode';
    }

    const fullPrompt = `${systemInstruction}\n\nUser prompt: ${prompt}`;

    const result = await model.generateContent(fullPrompt);
    let text = result.response.text().trim();

    if (!text) {
      console.error("Gemini returned empty response:", result);
      return res.status(500).json({ error: "Gemini API returned empty response." });
    }

    // Clean markdown fences if the AI mistakenly added them
    if (responseKey === 'files') {
        text = text.replace(/^```(json)?/i, "").replace(/```$/i, "").trim();
        try {
            const filesObject = JSON.parse(text);
            return res.status(200).json({ files: filesObject });
        } catch (e) {
            console.error("Failed to parse AI JSON response for multi-file request:", e, text);
            // Fallback: if JSON parsing fails, return raw text as a single file 
            // to prevent complete failure, though the file names will be wrong on the client side.
            return res.status(200).json({ htmlCode: text }); 
        }
    } else {
        // Single file response
        return res.status(200).json({ htmlCode: text });
    }

  } catch (err) {
    console.error("Gemini generation failed:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
