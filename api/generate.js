import { GoogleGenerativeAI } from "@google/generative-ai";

const API_KEY = process.env.GEMINI_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed. Use POST." });
  }

  if (!API_KEY) {
    console.error("GEMINI_API_KEY missing in environment variables.");
    return res.status(500).json({ error: "Gemini API key not configured." });
  }

  try {
    const { prompt } = req.body;
    if (!prompt || typeof prompt !== "string") {
      return res.status(400).json({ error: "Missing or invalid 'prompt' in request body." });
    }

    const genAI = new GoogleGenerativeAI(API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    const systemInstruction = `
You are a world-class AI web developer. Your sole purpose is to create a complete, professional, single-file HTML website based on the user's prompt.
The output MUST be a single, self-contained HTML file.
The HTML MUST include the necessary viewport meta tag for responsiveness: <meta name="viewport" content="width=device-width, initial-scale=1.0">.
The HTML MUST load the latest Tailwind CSS via CDN: <script src="https://cdn.tailwindcss.com"></script>.
All styling MUST use Tailwind CSS classes. Do NOT use <style> tags or external CSS files.
Use modern, responsive design principles (flex/grid, responsive prefixes like sm:, md:, lg:). The design must be aesthetically beautiful, professional, and fully functional on mobile and desktop.
The output should contain NOTHING but the raw HTML code, starting with <!DOCTYPE html>.
`;

    const fullPrompt = `${systemInstruction}\n\nUser prompt: ${prompt}`;

    const result = await model.generateContent(fullPrompt);

    let text = result.response.text();

    if (!text) {
      console.error("Gemini returned empty response:", result);
      return res.status(500).json({ error: "Gemini API returned empty response." });
    }

    // ---- 👇 New Code: Auto Image Detection + Insertion ----

    // Detects mentions like "image of ...", "photo of ...", "background of ..."
    const imageRegex = /(image|photo|picture|background)\s+(of|showing|with)\s+([^.,\n]+)/gi;
    const matches = [];
    let match;

    while ((match = imageRegex.exec(prompt)) !== null) {
      matches.push(match[3].trim());
    }

    if (matches.length > 0) {
      console.log("Detected image requests:", matches);

      // Replace random spots with placeholders (if needed)
      matches.forEach((imgPrompt, i) => {
        text += `\n<!-- AI_IMAGE_${i} -->`;
      });

      // Generate each image via Hugging Face API route
      for (let i = 0; i < matches.length; i++) {
        const imgPrompt = matches[i];
        try {
          const imgRes = await fetch(`${process.env.VERCEL_URL || "http://localhost:3000"}/api/generateImage`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: imgPrompt }),
          });

          const data = await imgRes.json();

          if (data.image) {
            // Replace placeholder or append image
            text = text.replace(
              `<!-- AI_IMAGE_${i} -->`,
              `<div class="w-full flex justify-center my-4"><img src="${data.image}" alt="${imgPrompt}" class="rounded-xl shadow-lg w-full max-w-3xl" /></div>`
            );
          }
        } catch (err) {
          console.error(`Error generating image for prompt "${imgPrompt}":`, err);
        }
      }
    }

    // ---- 👆 End of New Code ----

    // ---- 👇 Added Cleanup: Fix broken <img> URLs that cause 404s ----
    text = text.replace(/<img[^>]+src=["']?(photo-|image-|pic-|https?:\/\/unsplash|https?:\/\/picsum)[^"']*["']?[^>]*>/gi, (match) => {
      if (matches.length > 0) {
        // Use the first AI-generated image as fallback
        return `<img src="${matches[0]}" alt="AI generated image" class="rounded-xl shadow-lg w-full max-w-3xl" />`;
      }
      // Remove broken image entirely if no AI image available
      return "";
    });
    // ---- 👆 End Cleanup ----

    return res.status(200).json({ htmlCode: text.trim() });
  } catch (err) {
    console.error("Gemini generation failed:", err);
    return res.status(500).json({ error: err.message || "Internal server error." });
  }
}
