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

const WINDOW_MS = 60 * 1000;
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
      });
    }
    /* ================= END ADDED ================== */

    // ---------------- REQUEST BODY ----------------

    const {
      prompt,
      images = [],
      pexelsQuery: userQuery,
      imageCount = 8,
      videoCount = 2,
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }

    // ---------------- GEMINI INIT ----------------

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    // ---------------- STEP 1: PEXELS QUERY ----------------

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

    // ---------------- STEP 2: PEXELS IMAGES ----------------

    let imageURLs = [];
    try {
      const r = await fetch(
        `https://api.pexels.com/v1/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${imageCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );

      const data = await r.json();
      imageURLs = (data.photos || [])
        .map(p => p.src?.large)
        .filter(Boolean)
        .slice(0, 6);
    } catch {}

    // ---------------- STEP 3: PEXELS VIDEOS ----------------

    let heroVideo = "";
    try {
      const r = await fetch(
        `https://api.pexels.com/videos/search?query=${encodeURIComponent(
          pexelsQuery
        )}&per_page=${videoCount}`,
        { headers: { Authorization: PEXELS_API_KEY } }
      );

      const data = await r.json();
      heroVideo =
        data.videos?.[0]?.video_files?.[0]?.link || "";
    } catch {}

    // ---------------- STEP 4: SYSTEM INSTRUCTION (BEEFED UP) ----------------

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
Generate ONE self-contained HTML file.

REPLIT-STYLE NARRATION:
Before each major section, output a single line:
[ACTION: ...] (3–5 words)

ABSOLUTE RULES:
- Output ONLY valid HTML and ACTION lines
- NO markdown
- NO explanations
- NEVER invent URLs

CRITICAL IMAGE RULES:
- NEVER output Base64 directly
- ALWAYS use this placeholder EXACTLY:
<img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-user-image="INDEX">
- This placeholder WILL be replaced later
- NEVER omit src
- NEVER place ACTION inside HTML

HERO VIDEO:
${heroVideo || "None"}

STOCK IMAGES:
${imageURLs.join("\n") || "None"}

USER PROMPT:
${prompt}
`.trim();

    // ---------------- STEP 5: GEMINI INPUT ----------------

    const imageParts = images
      .filter(i => typeof i === "string" && i.startsWith("data:"))
      .slice(0, 4)
      .map(img => {
        const inline = dataUriToInlineData(img);
        return inline ? { inlineData: inline } : null;
      })
      .filter(Boolean);

    const parts = [
      ...imageParts,
      { text: systemInstruction },
    ];

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
      const text = chunk.text?.();
      if (text) {
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
      finalHtml = finalHtml.replaceAll(
        `data-user-image="${index}"`,
        `src="${img}"`
      );
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

    res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();

  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: "Internal server error" });
    }
  }
}
