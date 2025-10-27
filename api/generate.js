import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    const { currentHtml, refinePrompt } = req.body;
    if (!currentHtml || !refinePrompt) {
      return res
        .status(400)
        .json({ error: "Missing required fields: currentHtml or refinePrompt." });
    }

    const systemInstruction = `You are an expert web developer specializing in Tailwind CSS and modern HTML.
Only output the **final HTML code** — no explanations or markdown fences.`;

    const userInput = `
Current HTML to modify:
---
${currentHtml}
---

Refinement Request:
---
${refinePrompt}
---`;

    // ✅ Correct SDK usage
    const result = await model.generateContent({
      contents: [
        { role: "system", parts: [{ text: systemInstruction }] },
        { role: "user", parts: [{ text: userInput }] },
      ],
    });

    const generatedText = result.response.text().trim();

    // Remove ```html fences if present
    const cleanedHtml = generatedText
      .replace(/^```(html)?/i, "")
      .replace(/```$/i, "")
      .trim();

    res.status(200).json({ htmlCode: cleanedHtml });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res
      .status(500)
      .json({ error: `Failed to refine code. ${error.message || "Unknown error"}` });
  }
}
