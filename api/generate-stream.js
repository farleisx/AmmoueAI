// /api/generate-stream.js

import { streamingAIAgent } from './ai-core-service'; // Assume this is your AI connection module

// Vercel/Next.js/Node.js Serverless Function Handler
export default async function handler(req, res) {
    // 1. Set necessary headers for streaming
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // In a real application, you'd add CORS headers and authentication checks here.

    if (req.method !== 'POST') {
        res.status(405).end('Method Not Allowed');
        return;
    }
    
    const { prompt } = req.body;
    
    if (!prompt) {
        res.status(400).end('Missing prompt');
        return;
    }

    try {
        // 2. Call your AI core service in STREAMING mode
        const stream = await streamingAIAgent.generateHtml({ prompt });

        // 3. Process and stream the response chunk by chunk
        for await (const chunk of stream) {
            // Write the text chunk directly to the response
            res.write(chunk.text); 
            // Flush the buffer to ensure the data is immediately sent to the client
            res.flush(); 
        }

        // 4. Close the connection when done
        res.end(); 

    } catch (error) {
        console.error('AI Streaming Error:', error);
        // Important: If an error occurs, send an error message and close the stream
        res.status(500).end(`AI Generation Error: ${error.message}`);
    }
}
