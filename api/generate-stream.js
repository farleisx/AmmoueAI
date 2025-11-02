// /api/generate-stream.js
// NOTE: This uses the older, deprecated SDK. Please consider migrating to @google/genai.
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // Set headers for live streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // 1. Initialize the client using the older class name
    // It should automatically use the GEMINI_API_KEY environment variable.
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 

    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }
    
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).end('Missing prompt');
    }

    // 2. Get the model instance
    const model = ai.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        config: {
            systemInstruction: "You are an expert web developer AI. Generate only the complete, single-file HTML code, including all necessary CSS (using Tailwind CSS classes where possible) and JavaScript. Do not include any introductory or concluding text, notes, or markdown formatting (e.g., ```html).",
        }
    });
    
    try {
        // 3. Call the streaming method on the model instance
        const responseStream = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
        });

        // Pipe the stream to the HTTP response
        for await (const chunk of responseStream) {
            if (chunk.text) {
                res.write(chunk.text);
            }
            res.flush(); 
        }

        res.end(); 

    } catch (error) {
        console.error('Gemini Generation Error:', error);
        res.status(500).end(`AI Generation Error: ${error.message}`);
    }
}
