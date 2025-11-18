// file: pages/api/media-generator.js
// Description: Generate Pexels queries with Gemini, fetch ranked images + videos, then stream a single-file HTML via SSE
// Requirements: set GEMINI_API_KEY and PEXELS_API_KEY in env
//
// Main fixes applied:
// - consistent variable names: hero, imageURLs, videos
// - highest-resolution video selection (sort by width)
// - safe stream iteration (stream.stream ?? [])
// - robust chunk text extraction (chunk.text?.() || "")
// - check fetch res.ok and fallback gracefully
// - improved alt/metadata scoring and word-boundary matching
// - stable SSE format and final [DONE] sentinel
//
// Developer TODOs at end of file.

import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const API_MODEL = "gemini-2.5-flash";

// -----------------------------
// HELPERS
// -----------------------------
function makePlaceholderArray(count, prefix = "Image") {
  return Array.from({ length: count }).map(
    (_, i) => `https://via.placeholder.com/1600x900.png?text=${encodeURIComponent(`${prefix}+${i + 1}`)}`
  );
}

function tokenize(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Count matches of any of the words in text using word-boundary matching.
 * This reduces false positives (e.g., "art" matching "cart").
 */
function countWordMatches(words = [], text = "") {
  if (!text) return 0;
  const t = text.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (!w) continue;
    const re = new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "g");
    const matches = t.match(re);
    if (matches) score += matches.length;
  }
  return score;
}

// -----------------------------
// SMART QUERY GENERATOR
// -----------------------------
async function generatePexelsQuery(prompt) {
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    const q = `
Based on this website description:
"${prompt}"

Generate a PHOTO-optimized Pexels search query.

RULES:
- Use real photography subjects
- Use nouns + photography terms
- No vague aesthetics
- 3–7 words only
- Extremely relevant to real-world objects
- No duplicates, no fluff
- Return ONLY the query text

Examples:
"gaming console controller"
"modern barbershop interior"
"luxury perfume bottle studio shot"
"coffee shop interior"
`.trim();

    const result = await model.generateContent(q);
    // result.response.text() is the expected accessor
    const text = (result?.response?.text?.() || "").trim();
    if (!text) throw new Error("Empty query from model");
    return text;
  } catch (err) {
    console.warn("❌ Gemini query failed — falling back:", err?.message || err);
    // Fallback: use the most descriptive 5 words from prompt (safe)
    return prompt.split(/\s+/).slice(0, 5).join(" ");
  }
}

// -----------------------------
// IMAGE FETCH + SMART RANKING
// -----------------------------
async function fetchRelevantImages(prompt, pexelsQuery, count) {
  const fallback = makePlaceholderArray(count, "Image");
  try {
    const res = await fetch(
      `https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${count}`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!res.ok) {
      console.warn("❌ Pexels image API non-ok:", res.status, await res.text().catch(() => ""));
      return fallback;
    }
    const data = await res.json();
    let photos = data.photos || [];
    if (!photos.length) return fallback;

    const promptTokens = tokenize(prompt);
    const queryTokens = tokenize(pexelsQuery);
    const weightedWords = [...new Set([...promptTokens, ...queryTokens])];

    // Map/filter + pick best url
    photos = photos
      .map((p) => {
        const url = p.src?.large2x || p.src?.large || p.src?.original || p.src?.medium || null;
        const alt = (p.alt || p.photographer || "").toString();
        return {
          url,
          alt,
          width: p.width || 0,
          height: p.height || 0
        };
      })
      .filter((p) => p.url);

    // Score by alt text & url & resolution
    photos = photos.map((p) => {
      const textScore = countWordMatches(weightedWords, p.alt);
      // small bonus if filename contains query words
      const urlLower = (p.url || "").toLowerCase();
      const filenameScore = weightedWords.reduce((acc, w) => acc + (urlLower.includes(w) ? 1 : 0), 0);
      const score = textScore * 3 + filenameScore;
      return { ...p, score };
    });

    photos.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.width !== a.width) return b.width - a.width;
      return b.height - a.height;
    });

    let urls = photos.map((p) => p.url);
    // ensure exact length
    if (urls.length < count) {
      urls = urls.concat(makePlaceholderArray(count - urls.length, "Image"));
    } else if (urls.length > count) {
      urls = urls.slice(0, count);
    }

    return urls;
  } catch (err) {
    console.warn("❌ Image fetch failed:", err);
    return fallback;
  }
}

// -----------------------------
// VIDEO FETCH + HERO SELECTION
// -----------------------------
async function fetchRelevantVideos(prompt, pexelsQuery, count) {
  const fallback = makePlaceholderArray(count, "Video").map((u, i) =>
    // sample video fallback (not ideal for prod)
    `https://sample-videos.com/video123/mp4/720/big_buck_bunny_720p_${(i % 10) + 1}.mp4`
  );

  try {
    const res = await fetch(
      `https://api.pexels.com/videos/search?query=${encodeURIComponent(pexelsQuery)}&per_page=${count}`,
      { headers: { Authorization: PEXELS_API_KEY } }
    );
    if (!res.ok) {
      console.warn("❌ Pexels video API non-ok:", res.status, await res.text().catch(() => ""));
      return { hero: fallback[0], videos: fallback };
    }

    const data = await res.json();
    let vids = data.videos || [];
    if (!vids.length) return { hero: fallback[0], videos: fallback };

    const promptTokens = tokenize(prompt);

    vids = vids
      .map((v) => {
        // choose the highest-resolution video_file available
        const files = (v.video_files || []).slice();
        if (files.length) {
          files.sort((a, b) => (b.width || 0) - (a.width || 0));
        }
        const best = files[0] || {};
        const url = best.link || null;
        const width = best.width || 0;
        const height = best.height || 0;
        const user = (v.user?.name || "").toLowerCase();
        const description = (v.user?.name || v.url || v.tags || "").toString();
        return { url, width, height, user, description };
      })
      .filter((v) => v.url);

    // Score by whether uploader name or description matches prompt tokens
    vids = vids.map((v) => {
      const score = countWordMatches(promptTokens, `${v.user} ${v.description}`);
      return { ...v, score };
    });

    vids.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (b.width !== a.width) return b.width - a.width;
      return b.height - a.height;
    });

    const urls = vids.map((v) => v.url);
    const hero = urls[0] || fallback[0];

    // ensure length
    const videosOut = urls.length >= count ? urls.slice(0, count) : urls.concat(fallback.slice(0, Math.max(0, count - urls.length)));

    return { hero, videos: videosOut };
  } catch (err) {
    console.warn("❌ Video fetch failed:", err);
    return { hero: fallback[0], videos: fallback };
  }
}

// -----------------------------
// MAIN API HANDLER (SSE)
// -----------------------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Use POST." });
    return;
  }

  try {
    const { prompt, imageCount = 10, videoCount = 2 } = req.body || {};
    if (!prompt || typeof prompt !== "string") {
      res.status(400).json({ error: "Missing 'prompt' (string)." });
      return;
    }

    // 1) SMART QUERY
    const pexelsQuery = await generatePexelsQuery(prompt);
    console.log("🔍 Pexels search query:", pexelsQuery);

    // 2) FETCH IMAGES
    const imageURLs = await fetchRelevantImages(prompt, pexelsQuery, Number(imageCount || 10));
    console.log("📸 Images fetched:", imageURLs.length);

    // 3) FETCH VIDEOS
    const { hero, videos } = await fetchRelevantVideos(prompt, pexelsQuery, Number(videoCount || 2));
    console.log("🎥 Hero video selected:", hero);

    // 4) BUILD SYSTEM INSTRUCTION (we inject the media variables correctly)
    const systemInstruction = `
You are an elite, multi-disciplinary web development super-expert that should "act as if" you embody the combined knowledge and instincts of the best web engineers, UX designers, accessibility specialists, SEO experts, frontend performance engineers, and visual designers. Produce a single self-contained HTML file following the strict constraints in the original prompt.

Media resources:
Hero Video:
${hero || "None"}

Images:
${imageURLs.join("\n") || "None"}

Extra Videos:
${videos.join("\n") || "None"}

User prompt:
${prompt}
`.trim();

    // 5) STREAM HTML OUTPUT AS SSE
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    // Helpful for some proxies / Vercel
    res.setHeader("X-Accel-Buffering", "no");

    // flush headers early (some platforms)
    if (res.flushHeaders) res.flushHeaders();

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    // request streaming generation from the model
    const stream = await model.generateContentStream(systemInstruction);

    // guard: stream.stream might be undefined if API changes — iterate safely
    try {
      for await (const chunk of stream.stream ?? []) {
        // Extract text from chunk safely
        const textChunk = (typeof chunk?.text === "function" ? chunk.text() : "") || chunk?.delta?.content || "";
        if (!textChunk) continue;
        // SSE sends data lines prefixed by "data: "
        res.write(`data: ${JSON.stringify({ text: textChunk })}\n\n`);
        // optionally flush after each write
        if (typeof res.flush === "function") res.flush();
      }
      // Final sentinel
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (streamErr) {
      console.error("❌ Stream consumption error:", streamErr);
      // Communicate the error to the client cleanly and end stream
      res.write(`data: ${JSON.stringify({ error: streamErr?.message || "Stream error", done: true })}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  } catch (err) {
    console.error("❌ Server error:", err);
    // If headers already sent and SSE open, write SSE; otherwise send normal JSON
    try {
      if (!res.headersSent) {
        res.status(500).json({ error: err.message || "Server error" });
      } else {
        res.write(`data: ${JSON.stringify({ error: err.message || "Server error", done: true })}\n\n`);
        res.write(`data: [DONE]\n\n`);
        res.end();
      }
    } catch (writeErr) {
      console.error("❌ Failed to send error to client:", writeErr);
      res.end();
    }
  }
}

/*
Developer TODO (before deploying):
1) Verify GEMINI_API_KEY and PEXELS_API_KEY are set in your environment and NOT embedded in code.
2) Replace placeholder fallbacks with production assets or better error UI for end-users.
3) Confirm the Gemini streaming API shape (stream.stream + chunk.text()) — adapt if your SDK version differs.
4) Validate returned Pexels media licenses for your usage and add attribution where required.
5) Add rate-limiting / retries for production to handle Pexels/Gemini transient failures.

Optional enhancements:
- Add cache layer (in-memory or Redis) to avoid repeated Pexels calls for identical prompts.
- Add optional image quality selection (e.g., pick original vs large2x).
- Improve HTML generation prompt to include site title + SEO metadata in a structured way.
*/
