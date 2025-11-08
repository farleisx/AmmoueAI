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

    // Combine system guidance and user request inside the "user" role message
    const prompt = `
You are an expert web developer specializing in Tailwind CSS and modern HTML.
Modify the provided HTML **only** based on the user's refinement prompt.
Return the **complete modified HTML**, no explanations or markdown fences.

Current HTML:
---
${currentHtml}
---

Refinement Request:
---
${refinePrompt}
---`;

    // ✅ CORRECT request structure (no "system" role!)
    const result = await model.generateContent({
      contents: [
        { role: "user", parts: [{ text: prompt }] },
      ],
    });

    const generatedText = result.response.text().trim();

    // Clean possible ```html fences
    const cleanedHtml = generatedText
      .replace(/^```(html)?/i, "")
      .replace(/```$/i, "")
      .trim();

    res.status(200).json({ htmlCode: cleanedHtml });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: `Failed to refine code. ${error.message || "Unknown error"}`,
    });
  }
}
