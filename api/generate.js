import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import admin from "firebase-admin";

// ---------------- FIREBASE ADMIN ----------------
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const auth = admin.auth();

/* ================== ADDED ================== */
const db = admin.firestore();

const LIMITS = {
  free: 5,
  pro: 10,
};

// Updated to 24 hours for true daily limits
const WINDOW_MS = 24 * 60 * 60 * 1000;

async function enforceDailyLimit(uid) {
  const userRef = db.collection("users").doc(uid);
  const snap = await userRef.get();

  const now = Date.now();
  const data = snap.exists ? snap.data() : {};
  const plan = data.plan === "pro" ? "pro" : "free";
  const limit = LIMITS[plan];

  let count = data.dailyCount || 0;
  let resetAt = data.dailyResetAt || 0;

  if (now > resetAt) {
    count = 0;
    resetAt = now + WINDOW_MS;
  }

  if (count >= limit) {
    return {
      allowed: false,
      plan,
      limit,
      resetAt,
      remaining: 0,
    };
  }

  await userRef.set(
    {
      plan,
      dailyCount: count + 1,
      dailyResetAt: resetAt,
    },
    { merge: true }
  );

  return {
    allowed: true,
    remaining: limit - (count + 1),
    plan,
  };
}
/* ================= END ADDED ================= */

// ---------------- CONFIG ----------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY;
const API_MODEL = "gemini-2.5-flash";

// ---------------- HELPERS ----------------
function extractKeywords(text = "") {
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function dataUriToInlineData(dataUri) {
  if (!dataUri?.startsWith("data:")) return null;

  const [meta, base64] = dataUri.split(",");
  if (!meta || !base64) return null;

  const mimeType = meta.replace("data:", "").split(";")[0];

  return {
    data: base64,
    mimeType: mimeType || "image/png",
  };
}

// ---------------- BRAND DETECTION ----------------
const BRAND_KEYWORDS = ["ferromat", "zbeda"];
function getBrandKeywords(prompt) {
  const promptLower = prompt.toLowerCase();
  return BRAND_KEYWORDS.filter((b) => promptLower.includes(b));
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Use POST." });
  }

  try {
    // ---------------- AUTH ----------------
    const authHeader = req.headers.authorization || "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!token) {
      return res.status(401).json({ error: "Missing auth token." });
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return res.status(401).json({ error: "Invalid auth token." });
    }

    const uid = decoded.uid;
    const email = decoded.email || null;

    /* ================== ADDED ================== */
    const rate = await enforceDailyLimit(uid);

    if (!rate.allowed) {
      return res.status(429).json({
        error: "Daily request limit reached",
        plan: rate.plan,
        limit: rate.limit,
        resetAt: rate.resetAt,
        remaining: rate.remaining,
      });
    }
    /* ================= END ADDED ================= */

    // ---------------- REQUEST BODY ----------------
    const {
      prompt,
      images = [],
      pexelsQuery: userQuery,
      imageCount = 8,
      videoCount = 2,
      projectId,
      pageName = "landing", // new: multi-page support
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }

    // ---------------- GEMINI INIT ----------------
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    // ---------------- IMAGE SEARCH ----------------
    let imageURLs = [];
    const brandKeywords = getBrandKeywords(prompt);
    let searchQuery = prompt;

    if (brandKeywords.length && GOOGLE_CX && GOOGLE_SEARCH_KEY) {
      searchQuery = `${brandKeywords[0]} logo Israel`;
      try {
        const gRes = await fetch(
          `https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(
            searchQuery
          )}&cx=${GOOGLE_CX}&key=${GOOGLE_SEARCH_KEY}&searchType=image&num=${imageCount}`
        );
        const gData = await gRes.json();
        imageURLs = (gData.items || []).map((i) => i.link).filter(Boolean);
      } catch {
        // fallback handled below
      }
    }

    // ---------------- FALLBACK PEXELS ----------------
    if (!imageURLs.length) {
      let pexelsQuery = userQuery;
      if (!pexelsQuery) {
        try {
          const queryPrompt = `
Given this website description:
"${prompt}"

Generate a short (1–5 words) Pexels search query
focused ONLY on real-world objects.
Return ONLY the query text.
          `.trim();

          const q = await model.generateContent(queryPrompt);
          pexelsQuery = q.response.text()?.trim();
        } catch {
          pexelsQuery = extractKeywords(prompt).slice(0, 4).join(" ");
        }
      }

      try {
        const r = await fetch(
          `https://api.pexels.com/v1/search?query=${encodeURIComponent(
            pexelsQuery
          )}&per_page=${imageCount}`,
          { headers: { Authorization: PEXELS_API_KEY } }
        );
        const data = await r.json();
        imageURLs = (data.photos || []).map((p) => p.src?.large).filter(Boolean);
      } catch {
        // fallback handled below
      }
    }

    // ---------------- ROBUST FALLBACK ----------------
    if (!imageURLs.length) {
      // Try 3 generic keyword sets
      const genericQueries = [
        "website hero",
        "business background",
        "modern design",
      ];

      for (const q of genericQueries) {
        try {
          const r = await fetch(
            `https://api.pexels.com/v1/search?query=${encodeURIComponent(
              q
            )}&per_page=2`,
            { headers: { Authorization: PEXELS_API_KEY } }
          );
          const results = (data.photos || []).map((p) => p.src?.large).filter(Boolean);
          if (results.length) {
            imageURLs.push(...results);
            break;
          }
        } catch {}
      }
    }

    // Final absolute fallback
    if (!imageURLs.length) {
      imageURLs = ["https://via.placeholder.com/1200x600?text=No+Image+Found"];
    }

    // ---------------- STEP 3: PEXELS VIDEOS ----------------
    let heroVideo = "";
    try {
      const r = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          prompt
        )}&per_page=${videoCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );
      const data = await r.json();
      heroVideo = data.videos?.[0]?.video_files?.[0]?.link || "";
    } catch {}

    // ---------------- STEP 4: SYSTEM INSTRUCTION ----------------
const systemInstruction = `
You are an elite, world-class, top 0.1% web development AI —
a principal-level engineer who builds award-winning, visually stunning,
ultra-polished, production-grade websites for high-end startups,
luxury brands, and Silicon Valley companies.

You think like a senior frontend architect, UI/UX perfectionist,
and performance-focused engineer combined.
Your HTML is clean, modern, semantic, responsive, animated,
beautifully styled, and engineered with extreme attention to detail.

TASK:
Generate a complete website based on the user prompt. If the user implies a multi-page site 
(e.g., "a landing page and a dashboard" or "add a login page"), you must generate them sequentially.

ARCHITECTURAL PROTOCOL:
1. BEFORE starting the code for ANY page, output this exact tag: [NEW_PAGE: page_name]
2. The first page must always be: [NEW_PAGE: landing]
3. Use lowercase snake_case for page names (e.g., [NEW_PAGE: member_portal]).
4. All internal <a> links must point to "page_name.html" (e.g., <a href="member_portal.html">).

REPLIT-STYLE NARRATION:
Before each major UI section within a page, output a single line:
[ACTION: ...] (3–5 words)

ABSOLUTE RULES:
- Output ONLY valid HTML, [NEW_PAGE:] tags, and [ACTION:] lines.
- DO NOT wrap the code in markdown backticks (\`\`\`html or \`\`\`).
- NEVER start a new <!DOCTYPE html> if you have already started one for the current page.
- DO NOT include conversational text like "Sure, here is your site".
- NO markdown explanations.
- NEVER invent URLs.

CRITICAL IMAGE RULES:
- NEVER output Base64 directly.
- ALWAYS use this placeholder EXACTLY:
<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-user-image="INDEX">
- This placeholder WILL be replaced later.
- NEVER omit src.
- NEVER place ACTION inside HTML.

HERO VIDEO:
${heroVideo || "None"}

STOCK IMAGES:
${imageURLs.join("\n") || "None"}

USER PROMPT:
${prompt}
`.trim();

    // ---------------- STEP 5: GEMINI INPUT ----------------
    const imageParts = images
      .filter((i) => typeof i === "string" && i.startsWith("data:"))
      .slice(0, 4)
      .map((img) => {
        const inline = dataUriToInlineData(img);
        return inline ? { inlineData: inline } : null;
      })
      .filter(Boolean);

    const parts = [...imageParts, { text: systemInstruction }];

    // ---------------- STEP 6: STREAM ----------------
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const stream = await model.generateContentStream({
      contents: [{ role: "user", parts }],
    });

    let fullHtml = "";

    for await (const chunk of stream.stream ?? []) {
      let text = chunk.text?.();
      if (text) {
        // Clean markdown hallucinations if they occur mid-stream
        text = text.replace(/```html/gi, "").replace(/```/g, "");

        // Safety: If the model restarts the document, strip the redundant headers
        if (fullHtml.length > 100) {
            text = text.replace(/<!DOCTYPE html>/gi, "")
                       .replace(/<html[^>]*>/gi, "")
                       .replace(/<head>/gi, "")
                       .replace(/<\/head>/gi, "")
                       .replace(/<body[^>]*>/gi, "")
                       .replace(/<\/body>/gi, "")
                       .replace(/<\/html>/gi, "");
        }

        fullHtml += text;
        res.write(`data: ${JSON.stringify({ text })}\n\n`);
      }
    }

    // ---------------- SAFETY NET + HYDRATION ----------------
    let finalHtml = fullHtml.replaceAll(
      /<img([^>]*?)data-user-image="(\d+)"([^>]*)>/g,
      '<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-user-image="$2" style="width:100%;height:auto;display:block;border-radius:12px;object-fit:cover;box-shadow:0 8px 24px rgba(0,0,0,0.2);transition:all 0.3s ease-in-out;">'
    );

    images.forEach((img, index) => {
      finalHtml = finalHtml.replaceAll(`data-user-image="${index}"`, `src="${img}"`);
    });

    finalHtml += `
<script>
(function(){
  const imgs = document.querySelectorAll("img[data-user-image]");
  imgs.forEach(img => {
    if (!img.complete) {
      img.style.background = "#f2f2f2";
      img.onload = () => { img.style.opacity = 1; };
      img.style.transition = "opacity 0.6s ease-in-out";
      img.style.opacity = 0;
    }
  });
})();
</script>
`;

    /* ================== ADDED: SAVE TO FIRESTORE PER PAGE ================== */
    if (projectId) {
      const projectRef = db.collection("projects").doc(projectId);
      await projectRef.set(
        {
          pages: {
            [pageName]: { html: finalHtml, updatedAt: admin.firestore.FieldValue.serverTimestamp() }
          }
        },
        { merge: true }
      );
    }
    /* ================= END ADDED ================= */

    // ---------------- FINAL STREAM END ----------------
    res.write(`data: ${JSON.stringify({ done: true, remaining: rate.remaining })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
