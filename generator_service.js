// generator_service.js
export async function generateProjectStream(prompt, framework, projectId, idToken, onChunk, onStatus, onThinking) {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ prompt, framework, projectId })
        });

        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }

        if (!response.ok) throw new Error('Generation failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
            const { value, done } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const dataStr = line.slice(6).trim();
                    if (dataStr === '[DONE]') {
                        onStatus({ status: 'completed' });
                        continue;
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.status) onStatus(data);
                        else if (data.text) {
                            const fileMatch = data.text.match(/\[NEW_PAGE:\s*(.*?)\s*\]/);
                            if (fileMatch) onThinking(fileMatch[1]);
                            onChunk(data.text);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (error) { throw error; }
}
