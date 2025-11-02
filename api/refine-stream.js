// /api/refine-stream.js
// NOTE: This uses the older, deprecated SDK. Please consider migrating to @google/genai.
import { GoogleGenerativeAI } from '@google/generative-ai';

export default async function handler(req, res) {
    // Set headers for live streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY); 

    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    const { currentHtml, refinePrompt } = req.body;
    if (!currentHtml || !refinePrompt) {
        return res.status(400).end('Missing required fields.');
    }

    const systemInstruction = "You are an expert web developer AI dedicated to refining code. You MUST modify the provided HTML code exactly as requested by the user. You must return only the complete, single-file, modified HTML code. Do not include any notes or markdown formatting.";

    // Combine the existing code and the new instruction into a single prompt
    const combinedPrompt = `CURRENT HTML CODE:\n---\n${currentHtml}\n---\n\nREFINEMENT INSTRUCTION: ${refinePrompt}`;
    
    // 2. Get the model instance
    const model = ai.getGenerativeModel({ 
        model: 'gemini-1.5-flash', 
        config: {
            systemInstruction: systemInstruction,
        }
    });

    try {
        // 3. Call the streaming method on the model instance
        const responseStream = await model.generateContentStream({
            contents: [{ role: 'user', parts: [{ text: combinedPrompt }] }],
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
        console.error('Gemini Refinement Streaming Error:', error);
        res.status(500).end(`AI Refinement Error: ${error.message}`);
    }
}
