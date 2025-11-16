import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

export default async function handler(req, res) {
  if (req.method !== "POST")
    return res.status(405).json({ error: "Use POST." });

  try {
    const { prompt, pexelsQuery: userQuery, imageCount = 10, videoCount = 2 } =
      req.body;
    if (!prompt) return res.status(400).json({ error: "Missing 'prompt'." });

    // ✅ Step 1: Generate focused visual search query using Gemini
    let pexelsQuery = userQuery;
    if (!pexelsQuery) {
      try {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });

        const queryPrompt = `
Given this user website request:
"${prompt}"

Generate a short, vivid Pexels search query (1–5 words)
that captures the main visual theme for both images and videos.
Example: "luxury perfume bottles" or "modern coffee shop interior".
Only return the text query.
        `;

        const queryResult = await model.generateContent(queryPrompt);
        pexelsQuery = queryResult.response.text().trim();
        console.log("🔍 Generated Pexels query:", pexelsQuery);
      } catch (err) {
        console.warn("Gemini query generation failed:", err);
        pexelsQuery = prompt.split(" ").slice(0, 5).join(" ");
      }
    }

    // ✅ Step 2: Fetch Pexels Images
    let imageURLs = [];
    try {
      const pexelsRes = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${imageCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const data = await pexelsRes.json();

      const photos = (data.photos || [])
        .filter((p) => p.src?.large)
        .sort((a, b) => {
          const words = prompt.toLowerCase().split(/\s+/);
          const aScore = words.filter((w) =>
            a.alt?.toLowerCase().includes(w)
          ).length;
          const bScore = words.filter((w) =>
            b.alt?.toLowerCase().includes(w)
          ).length;
          return bScore - aScore;
        });

      imageURLs = photos.map((p) => p.src.large);
      console.log(`📸 Found ${imageURLs.length} Pexels images`);
    } catch (err) {
      console.warn("Pexels image fetch error:", err);
    }

    // ✅ Step 3: Fetch Pexels Videos
    let videoURLs = [];
    let heroVideo = "";
    try {
      const videoRes = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${videoCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const videoData = await videoRes.json();

      const videos = (videoData.videos || [])
        .map((v) => ({
          url: v.video_files?.[0]?.link,
          width: v.video_files?.[0]?.width || 0,
          height: v.video_files?.[0]?.height || 0,
          duration: v.duration || 0,
          tags: v.user?.name || "",
        }))
        .filter((v) => v.url);

      // Pick hero video based on prompt relevance
      const promptWords = prompt.toLowerCase().split(/\s+/);
      videos.sort((a, b) => {
        const aScore = promptWords.filter((w) =>
          (a.tags || "").toLowerCase().includes(w)
        ).length;
        const bScore = promptWords.filter((w) =>
          (b.tags || "").toLowerCase().includes(w)
        ).length;
        return bScore - aScore;
      });

      heroVideo = videos[0]?.url || "";
      videoURLs = videos.map((v) => v.url);
      console.log(`🎥 Found ${videoURLs.length} Pexels videos`);
      if (heroVideo) console.log("⭐ Selected hero video:", heroVideo);
    } catch (err) {
      console.warn("Pexels video fetch error:", err);
    }

    // ✅ Step 4: Build AI Instruction
   const systemInstruction = `
You are an elite, multi-disciplinary web development super-expert that should "act as if" you embody the combined knowledge and instincts of the best web engineers, UX designers, accessibility specialists, SEO experts, frontend performance engineers, and visual designers (imagine Gemini 2.5 Pro + GPT-5 level product engineering expertise). Your goal: produce the single best possible single-file HTML website for the user's prompt and the supplied media resources.

Tone & Result:
- Produce a single, self-contained HTML file only (begin with <!DOCTYPE html> and end with </html>).
- Use Tailwind CSS via CDN for all styling.
- Include clear inline comments so a real developer can understand & edit the file quickly.
- Prioritize modern best practices, pragmatic tradeoffs, and deliverability across real-world hosts (GitHub Pages, Vercel, Replit).
- Output must be valid HTML5 and mobile-first.

Media & Fallbacks:
- Use the hero video as a full-width, looping, muted background in the hero section when available.
- Use provided Pexels images/videos. NEVER call or reference Unsplash.
- If a media resource is missing, gracefully fallback to elegant placeholders, SVGs, or CSS-only hero with an accessible background color and a descriptive text block.
- Include alt text for every image (concise and descriptive) and captions where appropriate.
- Provide retina-ready handling where applicable (srcset or CSS techniques).
- Add license attribution comment block for Pexels media URLs.

Structure & Content:
- Create a clear site architecture: header/nav, hero, features/benefits, gallery/media section, pricing or CTA block, testimonials, FAQ, contact / booking form, footer with copyright and structured data.
- Use semantic HTML elements (header, main, nav, section, article, footer).
- Provide schema.org JSON-LD appropriate to the site (Organization, WebSite, LocalBusiness or Product depending on user prompt).
- Include meta tags for SEO and social cards (title, description, og:title, og:description, og:image, twitter:card).
- Auto-generate a succinct, compelling page title and description derived from the user's prompt.

UX, Accessibility & Internationalization:
- Make the design keyboard navigable and screen-reader friendly: focus states, aria-* attributes, landmark roles where helpful.
- Ensure color contrast meets WCAG AA for normal text.
- Provide language attribute on <html> and direction handling if the prompt suggests RTL languages.
- Use readable default type scale, sufficient touch targets for mobile, and clear microcopy for forms.

Performance & Best Practices:
- Minimize external requests (only Tailwind CDN allowed). Inline critical CSS patterns where needed using Tailwind classes and minimal inline <style> for tiny helpers.
- Use lazy loading for below-the-fold images (loading="lazy").
- Use modern HTML video attributes (playsinline, muted, loop, autoplay with fallback poster).
- Add preconnect or dns-prefetch hints for any critical external domains when applicable.
- Use lightweight, semantic icons (inline SVGs) rather than icon fonts.
- Where appropriate, use progressive enhancement: core functionality available without JS, then enhance with JS for interactions.

Responsiveness & Design:
- Mobile-first layout with graceful scaling to tablet/desktop.
- Cinematic, modern aesthetic: large hero, generous spacing, subtle shadows, rounded corners, tasteful gradients, and an elegant type hierarchy.
- Include a simple accessible nav that collapses to a hamburger on small screens (prefer no heavy JS frameworks).
- Provide examples of micro-interactions (hover/press) using CSS or minimal JS.

Forms, Validation & Privacy:
- Provide an embeddable contact/booking form that posts to a configurable endpoint (explain where user should update endpoint).
- Include client-side validation and friendly error/success UI.
- Add a small privacy note where form data is collected (simple line you can edit).

Developer Notes & Testing:
- Include a clear top-of-file comment block with:
  - Short description of the generated page
  - Media URLs used (hero video, images)
  - Where to change the copy, colors, and brand
  - Browser support notes and testing checklist
- Add quick manual accessibility & performance testing steps (axe or Lighthouse suggestions).

Security & Legal:
- Do not embed any secrets or API keys.
- When using external media, include a developer comment mentioning to verify licensing/usage for production.

Constraints & Hard Rules (must follow exactly):
- Use ONLY the media URLs supplied in the Media resources block. If none are supplied, use tasteful built-in fallbacks — do NOT reach out to any external random image sources like Unsplash.
- Output must be a single HTML file with all core markup and minimal inline scripts. Avoid external JS libraries unless absolutely necessary.
- At the end of the generated HTML, append a short "Edit Notes" comment describing how to replace hero media, change copy, and where to configure the contact form endpoint.
- Keep file size reasonable — avoid embedding huge base64 binaries.

User prompt:
- Read the user's prompt and the provided media block carefully. Use the prompt to:
  - Generate a short site title and tagline.
  - Create a hero headline + subheadline that match the prompt voice/tone.
  - Pick a visual layout and color palette that suits the prompt (describe the palette and why in a comment).
  - Produce copy for feature bullets, CTA buttons, and at least three short sections (features, testimonials, FAQ).

If asked to be "more creative" or "make it insane", escalate stylistic choices while maintaining accessibility and pragmatic performance. Be bold in layout and copy but remain production-sensible.

Finally: always append a short "Developer TODO" comment at the end listing 5 things the user should review before deploying (e.g., verify media licenses, set contact endpoint, replace placeholder text, test on mobile, run Lighthouse).

Now generate the single-file HTML website that follows every rule above, using the supplied media resources and the user's original prompt. Stay concise in code comments but thorough enough to guide edits.



Media resources:
🎥 Hero video (use as background in hero section): 
${heroVideo || "No video available."}

📸 Pexels images:
${imageURLs.join("\n") || "No images available."}

🎥 Additional Pexels videos:
${videoURLs.join("\n") || "No extra videos."}

Rules:
- Use the hero video as a full-width, looping, muted background in the hero section.
- Blend additional videos or images elegantly in later sections.
- Keep the design cinematic, modern, and responsive.
- Do NOT use Unsplash.
- Use only the provided media or fallback to public web sources (never blank sections).
User prompt: ${prompt}

Output must be a single, self-contained HTML file starting with <!DOCTYPE html>.
    `;

    // ✅ Step 5: Stream Gemini output
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });
    const streamResult = await model.generateContentStream(systemInstruction);

    for await (const chunk of streamResult.stream) {
      const textChunk = chunk.text?.() || chunk.delta?.content || "";
      if (textChunk)
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Generate error:", err);
    res.write(
      `data: ${JSON.stringify({
        error: err.message || "Internal server error.",
      })}\n\n`
    );
    res.end();
  }
}
