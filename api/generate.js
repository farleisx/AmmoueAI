import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import admin from "firebase-admin";

// ---------------- FIREBASE ADMIN (FIXED INIT) ----------------
try {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(
        JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
      ),
    });
  }
} catch (e) {
  console.error("Firebase init failed: Check FIREBASE_SERVICE_ACCOUNT env var", e);
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

/* ================== STACK INTELLIGENCE LAYER ================== */
const STACK_PRESETS = {
  "vanilla": {
    frontend: "HTML5, Tailwind CSS, Vanilla JS",
    backend: "None",
    structure: "Root-level index.html",
    requiredFiles: ["package.json", "vercel.json", "README.md", "index.html"]
  },
  "react-node": {
    frontend: "React (Vite), Tailwind CSS",
    backend: "Node.js (Express Serverless)",
    database: "MongoDB/Firestore",
    auth: "Firebase Auth/JWT",
    requiredFiles: ["package.json", "vercel.json", "src/main.jsx", "src/App.jsx", "api/index.js", "README.md"]
  },
  "nextjs": {
    frontend: "Next.js 14+ (App Router)",
    backend: "Next.js Server Actions/API Routes",
    database: "PostgreSQL (Prisma/Drizzle)",
    auth: "NextAuth.js",
    requiredFiles: ["package.json", "next.config.js", "app/page.jsx", "app/layout.jsx", "vercel.json", "README.md"]
  },
  "python-serverless": {
    frontend: "Modern HTML/JS + Tailwind",
    backend: "Python (Vercel Serverless)",
    constraints: "Single api/index.py handler, NO uvicorn, NO app.run",
    requiredFiles: ["requirements.txt", "api/index.py", "vercel.json", "README.md"]
  }
};

const STACK_REQUIREMENTS = {
  "vanilla": ["index.html"],
  "react-node": ["src/main.jsx", "src/App.jsx", "api/index.js"],
  "nextjs": ["app/page.jsx", "app/layout.jsx"],
  "python-serverless": ["api/index.py"]
};

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

/* ================== REFINEMENT HELPERS ================== */
function extractSectionHtml(fullHtml, sectionName) {
  const regex = new RegExp(
    `<[^>]+data-section="${sectionName}"[\\s\\S]*?<\\/[^>]+>`,
    "i"
  );
  const match = fullHtml.match(regex);
  return match ? match[0] : null;
}

function replaceSection(fullHtml, sectionName, newSectionHtml) {
  const regex = new RegExp(
    `<[^>]+data-section="${sectionName}"[\\s\\S]*?<\\/[^>]+>`,
    "i"
  );
  return fullHtml.replace(regex, newSectionHtml);
}
/* ======================================================= */

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

    /* ================== LIMITS ================== */
    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) {
      return res.status(429).json({ error: "Daily request limit reached" });
    }

    // ---------------- REQUEST BODY ----------------
    const {
      prompt,
      images = [],
      pexelsQuery: userQuery,
      imageCount = 8,
      videoCount = 2,
      projectId,
      pageName = "landing", 
      targetSection = null, 
      isRefinement = false, 
      framework = "vanilla", 
      mode = "standard", 
      style = "default",
      deployment = "vercel"
    } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: "Missing prompt." });
    }

    // ---------------- GEMINI INIT ----------------
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: API_MODEL });

    /* ================== PROJECT DATA & STACK LOCK ================== */
    const projectDocPath = `artifacts/ammoueai/users/${uid}/projects/${projectId}`;
    let projectData = {};
    let topicLock = "";
    
    if (projectId) {
      const snap = await db.doc(projectDocPath).get();
      projectData = snap.exists ? snap.data() : {};
      topicLock = projectData.topicLock || "";

      if (projectData.framework && projectData.framework !== framework) {
        return res.status(400).json({ error: "Stack Lock Violation" });
      }
    }

    if (!topicLock && !isRefinement) {
      try {
        const result = await model.generateContent(`Summarize intent: "${prompt}"`);
        topicLock = result.response.text().trim();
      } catch (e) {
        topicLock = prompt.slice(0, 100);
      }
    }

    // ---------------- ASSET FETCHING (IMAGES/VIDEO) ----------------
    let imageURLs = [];
    const brandKeywords = getBrandKeywords(prompt);
    if (brandKeywords.length && GOOGLE_CX && GOOGLE_SEARCH_KEY) {
      try {
        const gRes = await fetch(`https://www.googleapis.com/customsearch/v1?q=${encodeURIComponent(brandKeywords[0])}&cx=${GOOGLE_CX}&key=${GOOGLE_SEARCH_KEY}&searchType=image&num=${imageCount}`);
        const gData = await gRes.json();
        imageURLs = (gData.items || []).map((i) => i.link);
      } catch {}
    }

    if (!imageURLs.length) {
      try {
        const r = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(userQuery || prompt)}&per_page=${imageCount}`, { headers: { Authorization: PEXELS_API_KEY } });
        const data = await r.json();
        imageURLs = (data.photos || []).map((p) => p.src?.large);
      } catch {}
    }
    if (!imageURLs.length) imageURLs = ["https://via.placeholder.com/1200x600?text=No+Image+Found"];

    let heroVideo = "";
    try {
      const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&per_page=${videoCount}`, { headers: { Authorization: PEXELS_API_KEY } });
      const data = await r.json();
      heroVideo = data.videos?.[0]?.video_files?.[0]?.link || "";
    } catch {}

    /* ================== SYSTEM INSTRUCTIONS (ROOT & DEPLOYMENT CONTRACT) ================== */
    const activeStack = STACK_PRESETS[framework] || STACK_PRESETS.vanilla;
    
    let systemInstruction = `
You are an elite principal engineer at Vercel, operating at the absolute pinnacle of web development. You architect full-stack applications that are blazing fast, infinitely scalable, and visually stunning. Every line of code you write is optimized for performance, security, and modern UX standards. You design rich, interactive landing pages with smooth animations, dynamic dashboards, real-time data updates, and seamless navigation across multiple views. Your work merges cutting-edge frontend frameworks with serverless backends, edge functions, and high-performance CDN delivery. Every component is meticulously crafted for modular reuse, responsive design, and pixel-perfect UI, while pushing boundaries of user experience, interactivity, and visual storytelling. Think beyond code: anticipate user behavior, elevate the brand experience, and innovate like the future of web apps depends on it — because it does.
DEPLOYMENT TARGET: VERCEL (STRICT)
CORE STACK: ${JSON.stringify(activeStack)}

ROOT FILE SYSTEM LAW:
- There is ONE project root.
- package.json, vercel.json, README.md MUST exist at ROOT ONLY.
- NO nested package.json files allowed.
- Backend files MUST rely on root-level package.json dependencies.
- If framework ≠ vanilla → package.json MUST be generated.

FILE ISOLATION ABSOLUTE RULE:
- NEVER merge files. NEVER reference “previous file”.
- Output MUST be reproducible from zero files.
- Each [NEW_PAGE: filename] must be fully self-contained.

OUTPUT ORDER (MANDATORY):
1. [BACKEND_MANIFEST]
2. package.json
3. vercel.json
4. Remaining files

INLINE-ONLY CSS & JS:
- NO external files. <style></style> and <script></script> are mandatory.
- Closure tags MUST be present.
- JS files: NO HTML tags.

ROOT & DEPLOYMENT CONTRACT:
- Vercel deployment ONLY. ONE root filesystem.
- Output must succeed on first Vercel deploy with ZERO manual edits.
- Use placeholders: <img src="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==" data-user-image="INDEX">

IMAGES: ${imageURLs.join("\n")}
VIDEO: ${heroVideo}
`.trim();

    /* --- ADDED: TARGETED SECTION LOGIC --- */
    if (isRefinement && targetSection !== null) {
      systemInstruction += `\n[TASK: TARGETED_REWRITE] Rewrite ONLY the element with data-sync-id="${targetSection}". Ensure the new content matches the existing style and framework.`;
    }

    // ---------------- GEMINI INPUT & GENERATION ----------------
    const imageParts = images.filter(i => i.startsWith("data:")).map(img => ({ inlineData: dataUriToInlineData(img) }));
    
    /* --- UPDATED: REAL-TIME STREAMING BLOCK --- */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const streamingResult = await model.generateContentStream({ 
      contents: [{ role: "user", parts: [...imageParts, { text: systemInstruction + "\n" + prompt }] }] 
    });

    let fullText = "";
    for await (const chunk of streamingResult.stream) {
      const chunkText = chunk.text();
      fullText += chunkText;
      // Send the chunk to frontend in real-time
      res.write(`data: ${JSON.stringify({ text: chunkText })}\n\n`);
    }

    // Clean markdown if present
    fullText = fullText.replace(/```[a-z]*\n/gi, "").replace(/```/g, "");

    /* ================== VALIDATION & SAVING (POST-STREAM) ================== */
    const BANNED_APIS = ["child_process", "fs.unlink", "eval(", "exec(", "spawn("];
    if (BANNED_APIS.some(p => fullText.includes(p))) throw new Error("SECURITY_ABORT_BANNED_API");

    // Extract Manifest
    let backendManifest = projectData.backendManifest || {};
    const manifestMatch = fullText.match(/\[BACKEND_MANIFEST\]\s*([\s\S]*?)(?=\[NEW_PAGE:|$)/i);
    
    if (!manifestMatch && framework !== "vanilla") {
        // Log locally but don't crash stream yet, or we'd have to handle mid-stream error UI
        console.error("BACKEND_MANIFEST_REQUIRED");
    }
    
    if (manifestMatch) {
      try {
        backendManifest = JSON.parse(manifestMatch[1].trim());
      } catch(e) { console.error("Manifest JSON error"); }
    }

    // Parse Pages
    const pageBlocks = fullText.split(/\[NEW_PAGE:\s*(.*?)\s*\]/g).filter(Boolean);
    const pagesUpdate = {};
    for (let i = 0; i < pageBlocks.length; i += 2) {
      const fileName = pageBlocks[i].trim().toLowerCase().replace(/\s+/g, "-");
      const fileContent = (pageBlocks[i + 1] || "").trim();
      pagesUpdate[fileName] = { content: fileContent };
    }

    if (projectId) {
      const mainPageKey = Object.keys(pagesUpdate).find(k => k.includes("index.html") || k.includes("landing")) || "index.html";
      if (pagesUpdate[mainPageKey]) {
        let content = pagesUpdate[mainPageKey].content;
        images.forEach((img, idx) => { content = content.replaceAll(`data-user-image="${idx}"`, `src="${img}"`); });
        pagesUpdate[mainPageKey].content = content;
        pagesUpdate[mainPageKey].updatedAt = admin.firestore.FieldValue.serverTimestamp();
      }

      const versions = (projectData.versions || []).slice(-9);
      versions.push({ timestamp: Date.now(), pages: projectData.pages || {}, manifest: projectData.backendManifest || {} });

      await db.doc(projectDocPath).set({ 
        topicLock, framework, backendManifest, pages: pagesUpdate, versions,
        capabilities: projectData.capabilities || { backend: framework !== "vanilla" } 
      }, { merge: true });
    }

    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (err) {
    console.error("Generate error:", err);
    if (!res.headersSent) {
      res.status(400).json({ error: err.message || "Internal server error" });
    }
  }
}
