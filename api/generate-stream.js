// /api/generate-stream.js
import { GoogleGenAI } from '@google/genai';

export default async function handler(req, res) {
    // Set headers for live streaming to the client
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Initialize the client (automatically uses GEMINI_API_KEY from environment)
    const ai = new GoogleGenAI({}); 

    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }
    
    const { prompt } = req.body;
    if (!prompt) {
        return res.status(400).end('Missing prompt');
    }

    // ⭐ CRITICAL: System instruction for code generation ⭐
    const systemInstruction = "You are an expert web developer AI. Generate only the complete, single-file HTML code, including all necessary CSS (using Tailwind CSS classes where possible) and JavaScript. Do not include any introductory or concluding text, notes, or markdown formatting (e.g., ```html).";
    
    try {
        // Call the streaming method
        const responseStream = await ai.models.generateContentStream({
            model: 'gemini-2.5-flash', // Fast model for real-time streaming
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                systemInstruction: systemInstruction,
            },
        });

        // Pipe the stream to the HTTP response
        for await (const chunk of responseStream) {
            if (chunk.text) {
                res.write(chunk.text);
            }
            res.flush(); 
        }

        res.end(); // Close the response when the stream is done

    } catch (error) {
        console.error('Gemini Generation Error:', error);
        res.status(500).end(`AI Generation Error: ${error.message}`);
    }
}
