// /api/generate-stream.js
import { GoogleGenerativeAI } from '@google/generative-ai';

// 1. Vercel Configuration for Body Parsing Safety
// This ensures Vercel correctly parses the JSON body before it reaches your handler.
export const config = {
  api: {
    bodyParser: {
        sizeLimit: '1mb', 
    },
  },
};

export default async function handler(req, res) {
    // 2. Method and Header Setup
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    let prompt;

    // 3. Request Body Validation (Critical)
    try {
        // Safe access to req.body.prompt to prevent synchronous crashes
        prompt = req.body?.prompt;
        
        if (!prompt) {
            throw new Error('Missing "prompt" in request body. Ensure you send { "prompt": "..." }');
        }
    } catch (e) {
        // Distinguish a client error (400) from a server crash (500)
        return res.status(400).end(`Bad Request: ${e.message}`);
    }

    // 4. AI Execution and Streaming
    try {
        // Initialize the client with the API Key from Vercel Environment Variables
        const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 
        
        // **Model ID is explicitly set to gemini-2.5-flash**
        const model = ai.getGenerativeModel({ 
            model: 'gemini-2.5-flash', 
            config: {
                systemInstruction: "You are an expert web developer AI. Generate only the complete, single-file HTML code, including all necessary CSS (using Tailwind CSS classes where possible) and JavaScript. Do not include any introductory or concluding text, notes, or markdown formatting (e.g., ```html).",
            }
        });
        
        // Start the streaming request
        const responseStream = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // Write the stream chunk by chunk to the Vercel response
        for await (const chunk of responseStream) {
            if (chunk?.text) {
                res.write(chunk.text);
            }
            // Ensure the data is pushed immediately
            res.flush(); 
        }

        res.end(); 

    } catch (error) {
        // 5. Catch API and Runtime Errors
        console.error('Gemini Execution Error:', error.message, error.stack);
        // The 500 status will be returned, along with the error message for debugging (if you can ever access the logs)
        res.status(500).end(`AI Generation Error: An unexpected server error occurred. Check Vercel logs for "${error.message}"`);
    }
}
