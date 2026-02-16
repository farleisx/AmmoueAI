// generator_service.js
export async function generateProjectStream(prompt, framework, projectId, idToken, onChunk, onStatus, onThinking, onAction, signal) {
    try {
        const response = await fetch('/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify({ prompt, framework, projectId }),
            signal: signal
        });

        if (response.status === 429) {
            throw new Error('Rate limit exceeded. Please wait a moment before trying again.');
        }

        if (!response.ok) throw new Error('Generation failed');

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulatedText = "";
        let seenFiles = new Set();
        let processedActions = new Set();

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
                        // SELF-HEALING: Check for missing context files before completing
                        if (accumulatedText.includes("ThemeContext") && !seenFiles.has("src/context/ThemeContext.jsx")) {
                            const patch = `\n/* [NEW_PAGE: src/context/ThemeContext.jsx ] */\nimport React, { createContext, useContext, useState } from 'react';\nconst ThemeContext = createContext();\nexport const ThemeProvider = ({ children }) => {\n  const [theme, setTheme] = useState('dark');\n  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;\n};\nexport const useTheme = () => useContext(ThemeContext);\n/* [END_PAGE] */\n`;
                            onChunk(patch);
                        }
                        onStatus({ status: 'completed' });
                        continue;
                    }
                    try {
                        const data = JSON.parse(dataStr);
                        if (data.status) onStatus(data);
                        else if (data.text) {
                            accumulatedText += data.text;
                            
                            // Parse Actions from stream: [ACTION: Task Name]
                            const actionMatches = accumulatedText.matchAll(/\[ACTION:\s*([^\]]+)\]/g);
                            for (const match of actionMatches) {
                                const actionName = match[1].trim();
                                if (!processedActions.has(actionName)) {
                                    processedActions.add(actionName);
                                    onAction(actionName);
                                }
                            }

                            const fileMatch = data.text.match(/\/\*\s*\[NEW_PAGE:\s*(.*?)\s*\]\s*\*\//);
                            if (fileMatch) {
                                const fileName = fileMatch[1].trim();
                                seenFiles.add(fileName);
                                onThinking(fileName);
                            }
                            onChunk(data.text);
                        }
                    } catch (e) {}
                }
            }
        }
    } catch (error) { 
        if (error.name === 'AbortError') return;
        throw error; 
    }
}
