// /api/refine-stream.js

// Assume this module is configured to interface with a streaming AI model (e.g., Anthropic, OpenAI)
// The function signature would be designed to accept two distinct inputs for the refinement task.
import { streamingAIAgent } from './ai-core-service'; 

/**
 * Serverless function handler for streaming AI refinement.
 * * @param {object} req - The incoming HTTP request (Node.js style).
 * @param {object} res - The outgoing HTTP response (Node.js style).
 */
export default async function handler(req, res) {
    // 1. Set Streaming Headers
    // These headers are critical to prevent buffering and enable the stream to work.
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Basic request validation
    if (req.method !== 'POST') {
        res.status(405).end('Method Not Allowed');
        return;
    }
    
    const { currentHtml, refinePrompt } = req.body;
    
    if (!currentHtml || !refinePrompt) {
        res.status(400).end('Missing required fields: currentHtml or refinePrompt.');
        return;
    }

    try {
        // 2. Call the AI core service in STREAMING mode for refinement
        // The AI is instructed to modify the 'currentHtml' based on the 'refinePrompt'.
        const stream = await streamingAIAgent.refineHtml({ 
            currentHtml, 
            refinePrompt 
        });

        // 3. Process and stream the response chunk by chunk
        for await (const chunk of stream) {
            // Write the text chunk directly to the response buffer
            res.write(chunk.text); 
            
            // Flush the buffer to ensure the data is immediately sent to the client
            res.flush(); 
        }

        // 4. Close the connection when done
        res.end(); 

    } catch (error) {
        console.error('AI Refinement Streaming Error:', error);
        // If an error occurs, send a non-200 status and close the stream
        // The client-side will catch this error.
        res.status(500).end(`AI Refinement Error: ${error.message}`);
    }
}
