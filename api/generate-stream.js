// /api/generate-stream.js
import { GoogleGenerativeAI } from '@google/generative-ai';

// IMPORTANT: Define this export configuration if you are NOT using Next.js 
// to ensure the body parser works correctly in a pure Vercel serverless environment.
export const config = {
  // If you are using Next.js API Routes, Vercel handles this automatically.
  // If you are using a bare Node.js Vercel Function, this explicitly enables
  // body parsing for JSON requests.
};

export default async function handler(req, res) {
    // 1. Method Check
    if (req.method !== 'POST') {
        // Return a clean 405 error if method is wrong
        return res.status(405).end('Method Not Allowed');
    }

    // Set headers for live streaming *before* any streaming or errors
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let prompt;

    // 2. Body Safety Check (CRITICAL)
    try {
        // Check for req.body existence and structure
        if (!req.body || typeof req.body !== 'object' || !req.body.prompt) {
            // Throw a specific error if the body or prompt is missing
            throw new Error('Request body is missing or formatted incorrectly. Expected: { prompt: "..." }');
        }
        prompt = req.body.prompt;
    } catch (e) {
        // Log the error and return a 400 response
        console.error('Body Parsing Error:', e.message);
        return res.status(400).end(`Bad Request: ${e.message}`);
    }

    // 3. Initialize AI Client
    try {
        const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 
        
        const model = ai.getGenerativeModel({ 
            model: 'gemini-1.5-flash', 
            config: {
                systemInstruction: "You are an expert web developer AI. Generate only the complete, single-file HTML code, including all necessary CSS (using Tailwind CSS classes where possible) and JavaScript. Do not include any introductory or concluding text, notes, or markdown formatting (e.g., ```html).",
            }
        });
        
        // 4. Start Streaming
        const responseStream = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // Pipe the stream to the HTTP response
        for await (const chunk of responseStream) {
            // Use optional chaining for safer access to chunk properties
            if (chunk?.text) {
                res.write(chunk.text);
            }
            res.flush(); 
        }

        res.end(); 

    } catch (error) {
        // 5. Catch API/Runtime Errors
        console.error('Gemini Generation Error:', error.message);
        // Return a 500 status with the error message
        res.status(500).end(`AI Streaming Error: ${error.message}`);
    }
}
