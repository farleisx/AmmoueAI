// This file is intended to run on a Vercel Serverless environment.

// Import the Google Gen AI SDK
import { GoogleGenAI } from "@google/genai";

// Ensure the API key is set in Vercel Environment Variables: GEMINI_API_KEY
// The variable is accessed securely via process.env.
const apiKey = process.env.GEMINI_API_KEY;

// Check if API key is available
if (!apiKey) {
    console.error("GEMINI_API_KEY is not set in Vercel environment variables.");
}

// Initialize the GoogleGenAI instance if the key is available
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null;

/**
 * The main handler for the Vercel serverless function.
 * @param {object} req - The incoming request object.
 * @param {object} res - The outgoing response object.
 */
export default async function handler(req, res) {
    // 1. CRITICAL: Check and enforce the POST method to fix the 405 error
    if (req.method !== 'POST') {
        // Return 405 Method Not Allowed if not a POST request
        return res.status(405).json({ error: 'Method Not Allowed. This endpoint only accepts POST requests.' });
    }

    // 2. Initial API Key Check
    if (!ai) {
        return res.status(500).json({ error: 'AI service not initialized. Check GEMINI_API_KEY environment variable.' });
    }

    try {
        // 3. Extract the prompt from the request body
        const { prompt } = req.body;
        
        if (!prompt) {
            return res.status(400).json({ error: 'Missing prompt in request body.' });
        }

        // 4. Define the system instruction for generating HTML
        const systemInstruction = "You are a world-class front-end developer. Your task is to generate a single, complete, beautiful, mobile-responsive HTML file, including all necessary CSS (using Tailwind classes) and JavaScript within the same file. Do NOT include any external script tags other than Tailwind CSS and Google Fonts. Do not include markdown headers (like ```html). Just provide the raw, complete HTML code.";

        // 5. Call the Gemini API
        const response = await ai.models.generateContent({
            model: "gemini-2.5-flash", 
            contents: [{ parts: [{ text: prompt }] }],
            config: {
                systemInstruction: { parts: [{ text: systemInstruction }] },
                // Set a high temperature to encourage creative, full website generation
                temperature: 0.8,
            }
        });

        // 6. Extract the generated text
        const generatedText = response.text.trim();

        // 7. Sanitize the output (in case the model wraps the HTML in markdown)
        let htmlCode = generatedText;
        if (htmlCode.startsWith('```html')) {
            htmlCode = htmlCode.substring(7);
        }
        if (htmlCode.endsWith('```')) {
            htmlCode = htmlCode.substring(0, htmlCode.length - 3);
        }
        htmlCode = htmlCode.trim();


        // 8. Return the generated HTML code in the expected JSON format
        res.status(200).json({ htmlCode });

    } catch (error) {
        console.error('Gemini API Error:', error);
        // Return a 500 status for any internal API errors
        res.status(500).json({ error: 'Failed to generate content from AI service.', details: error.message });
    }
}
