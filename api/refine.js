import { GoogleGenerativeAI } from "@google/generative-ai";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  try {
    // Destructure required fields and optional imageUrls
    const { currentHtml, refinePrompt, imageUrls } = req.body;
    
    if (!currentHtml || !refinePrompt) {
      return res
        .status(400)
        .json({ error: "Missing required fields: currentHtml or refinePrompt." });
    }

    // Base set of instructions for the model
    let promptInstruction = `
You are an expert web developer specializing in Tailwind CSS and modern HTML.
Modify the provided HTML **only** based on the user's refinement prompt.
Return the **complete modified HTML**, no explanations or markdown fences.
`;

    // Add image mandate if URLs are provided in the request
    if (Array.isArray(imageUrls) && imageUrls.length > 0) {
      const urlsList = imageUrls.map(url => ` - ${url}`).join('\n');
      promptInstruction += `\n\n**MANDATE: USE THESE NEW IMAGES**\nReplace any old or placeholder image URLs in the Current HTML with the following new ones:\n${urlsList}\n\n`;
    }

    // Combine all instructions, current HTML, and refinement request
    const prompt = `${promptInstruction}
Current HTML:
---
${currentHtml}
---

Refinement Request:
---
${refinePrompt}
---`;

    // Correct request structure for standard generation
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
      .replace(/```$/i, "") // Double-check just in case of multiple fences
      .trim();

    res.status(200).json({ htmlCode: cleanedHtml });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({
      error: `Failed to refine code. ${error.message || "Unknown error"}`,
    });
  }
}
