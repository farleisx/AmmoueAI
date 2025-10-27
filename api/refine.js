import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    // ⭐ CHANGE: Expect 'currentFiles' object instead of 'currentHtml' string
    const { currentFiles, refinePrompt } = req.body;
    
    if (!currentFiles || !refinePrompt) {
      return res
        // ⭐ CHANGE: Update the error message to reflect the new expected key
        .status(400)
        .json({ error: "Missing required fields: currentFiles or refinePrompt." });
    }

    // Convert the files object back into a string for the model prompt
    const filesString = JSON.stringify(currentFiles, null, 2);

    const prompt = `
You are an expert AI web developer specializing in Tailwind CSS and modern HTML.
Your task is to **modify the project files** based on the refinement request.

1.  **Analyze** the 'Current Project Files' (a JSON object mapping filenames to HTML).
2.  **Apply** the 'Refinement Request' to the appropriate file(s).
3.  **Return the COMPLETE UPDATED JSON OBJECT** containing ALL files, even those that were not modified.

Current Project Files:
---
${filesString}
---

Refinement Request:
---
${refinePrompt}
---

Your response MUST be the raw JSON object only, starting with { and ending with }. Do not include any surrounding text or markdown fences.
`;

    // ✅ CORRECT request structure 
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: prompt }] },
      ],
    });

    let generatedText = result.response.text().trim();

    // Clean possible ```json fences
    generatedText = generatedText
      .replace(/^```(json)?/i, "")
      .replace(/```$/i, "")
      .trim();
    
    try {
        const updatedFiles = JSON.parse(generatedText);
        // ⭐ CHANGE: Return the updated files object under the 'files' key
        res.status(200).json({ files: updatedFiles });
    } catch (e) {
        console.error("Failed to parse AI JSON response for refinement:", e, generatedText);
        res.status(500).json({ error: `AI returned unparsable JSON. The error was: ${e.message}` });
    }
    
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: `Failed to refine code. ${error.message || "Unknown error"}`,
    });
  }
}
