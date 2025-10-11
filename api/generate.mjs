import { GoogleGenAI } from "@google/genai";

/**
 * Serverless function (e.g., Vercel) to handle website generation requests.
 * This file is executed on the server/edge function, securing the Gemini API key.
 * It expects a POST request with a 'prompt' in the request body.
 * NOTE: The API_KEY must be configured as an environment variable (GEMINI_API_KEY)
 * when deploying this serverless function.
 */

// Use an environment variable for the API Key in a production environment
const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash-preview-05-20";

// System instruction for the Gemini model
const systemInstruction = `You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt. 
    The output MUST be a single, self-contained HTML file.
    The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
    The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
    All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
    Use modern, responsive design principles (flex/grid, responsive prefixes like sm:, md:, lg:).
    The design must be aesthetically beautiful, professional, and fully functional on mobile and desktop.
    The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>. Do not wrap the code in markdown blocks or add any other explanatory text.
`;

// Initialize the GoogleGenAI instance using the secure environment variable
const ai = new GoogleGenAI({ apiKey: API_KEY });

/**
 * Handles the incoming request (Vercel's req/res pattern).
 * @param {Object} req - The request object.
 * @param {Object} res - The response object.
 */
export default async function handler(req, res) {
    // 1. Check for POST method
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method Not Allowed. Use POST.' });
        return;
    }

    // 2. Critical API Key check
    if (!API_KEY) {
        // Send JSON error for frontend to parse
        res.status(500).json({ error: 'Server configuration error: GEMINI_API_KEY is missing.' });
        return;
    }

    try {
        // 3. Parse request body for the user's prompt
        const { prompt } = req.body;

        if (!prompt || typeof prompt !== 'string') {
            res.status(400).json({ error: 'Missing or invalid "prompt" in request body.' });
            return;
        }

        const userQuery = `Generate a beautiful, single-file HTML website with Tailwind CSS based on this description: ${prompt}`;

        // 4. Call the Gemini API
        const response = await ai.models.generateContent({
            model: API_MODEL,
            contents: [{ role: "user", parts: [{ text: userQuery }] }],
            config: {
                systemInstruction: systemInstruction,
            }
        });
        
        const generatedText = response.text;

        if (!generatedText) {
            res.status(500).json({ error: 'AI generated no text content.' });
            return;
        }

        // 5. Respond with the generated HTML code
        // IMPORTANT: Send back Content-Type: application/json
        res.status(200).json({ htmlCode: generatedText.trim() });

    } catch (error) {
        console.error('Serverless function error:', error.message);
        // Send a generic 500 JSON error that the frontend can parse
        res.status(500).json({ error: 'Internal server error during AI generation.', details: error.message });
    }
}
