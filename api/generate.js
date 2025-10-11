import { GoogleGenAI } from "@google/genai";

// Vercel automatically makes environment variables available via process.env
const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash-preview-05-20";

// System instruction to guide the AI to act as a web developer
const systemInstruction = `You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt. 
The output MUST be a single, self-contained HTML file.
The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
Use modern, responsive design principles (flex/grid, responsive prefixes like sm:, md:, lg:). The design must be aesthetically beautiful, professional, and fully functional on mobile and desktop.
The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>. Do not wrap the code in markdown blocks or add any other explanatory text.`;

/**
 * Handles the incoming request from the frontend (/api/generate).
 * This structure is the most stable for Vercel serverless functions with ES Modules.
 * @param {Object} req - The request object (should contain the prompt).
 * @param {Object} res - The response object.
 */
export default async function handler(req, res) {
    // 1. Basic checks
    if (req.method !== 'POST') {
        // This resolves the 405 error
        return res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
    }

    if (!API_KEY) {
        // This handles the most common 500 error cause (missing API key)
        console.error('API Key Error: GEMINI_API_KEY is not configured on the server.');
        return res.status(500).json({ error: 'Server configuration error: Gemini API Key is missing.' });
    }

    try {
        // 2. Parse request body for the user's prompt
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            return res.status(400).json({ error: 'Missing or invalid "prompt" in request body.' });
        }

        const userQuery = `Generate a beautiful, single-file HTML website with Tailwind CSS based on this description: ${prompt}`;

        // Initialize the AI client
        const ai = new GoogleGenAI({ apiKey: API_KEY });

        // 3. Call the Gemini API
        const geminiResponse = await ai.models.generateContent({
            model: API_MODEL,
            contents: [{ role: "user", parts: [{ text: userQuery }] }],
            config: {
                systemInstruction: systemInstruction,
            },
        });

        const generatedText = geminiResponse.text;

        if (!generatedText) {
            console.error('AI generated no text content.', geminiResponse);
            return res.status(500).json({ error: 'AI generated no text content.' });
        }

        // 4. Respond with the generated HTML code (Frontend expects 'htmlCode')
        return res.status(200).json({ htmlCode: generatedText.trim() });

    } catch (error) {
        // This catches any unexpected internal errors (like network timeouts)
        console.error('Serverless function execution error:', error.message);
        return res.status(500).json({ error: 'Internal server error during AI generation process.' });
    }
}
