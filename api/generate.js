import { GoogleGenerativeAI } from "@google/generative-ai";
import fetch from "node-fetch";
import admin from "firebase-admin";

// ---------------- VERCEL RUNTIME CONFIG ----------------
export const config = {
  runtime: 'edge',
};

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
const db = admin.firestore();

const LIMITS = {
  free: 5,
  pro: 10,
};

const WINDOW_MS = 24 * 60 * 60 * 1000;

// [FIX 1: RACE CONDITION PROTECTION VIA TRANSACTION]
async function enforceDailyLimit(uid) {
  const userRef = db.collection("users").doc(uid);
  
  return await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(userRef);
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
      return { allowed: false, plan, limit, resetAt, remaining: 0 };
    }

    const newCount = count + 1;
    transaction.set(userRef, {
      plan,
      dailyCount: newCount,
      dailyResetAt: resetAt,
    }, { merge: true });

    return { allowed: true, remaining: limit - newCount, plan };
  });
}

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
  return text.toLowerCase().replace(/[^\w\s]/g, " ").split(/\s+/).filter(Boolean);
}

function dataUriToInlineData(dataUri) {
  if (!dataUri?.startsWith("data:")) return null;
  const [meta, base64] = dataUri.split(",");
  if (!meta || !base64) return null;
  const mimeType = meta.replace("data:", "").split(";")[0];
  return { data: base64, mimeType: mimeType || "image/png" };
}

// [FIX 4: MANIFEST PARSING FRAGILITY - CLEANER]
function cleanJsonString(raw) {
  return raw
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .replace(/^\s+|\s+$/g, "")
    .replace(/,\s*([\]}])/g, "$1"); 
}

// [FIX 5: SECURITY SANITIZER]
function sanitizeOutput(text) {
  const secrets = [GEMINI_API_KEY, PEXELS_API_KEY, GOOGLE_SEARCH_KEY].filter(Boolean);
  let sanitized = text;
  secrets.forEach(s => {
    sanitized = sanitized.split(s).join("[REDACTED_SECRET]");
  });
  return sanitized;
}

/* ================== REFINEMENT HELPERS ================== */
function extractSectionHtml(fullHtml, sectionName) {
  const regex = new RegExp(`<[^>]+data-section="${sectionName}"[\\s\\S]*?<\\/[^>]+>`, "i");
  const match = fullHtml.match(regex);
  return match ? match[0] : null;
}

function replaceSection(fullHtml, sectionName, newSectionHtml) {
  const regex = new RegExp(`<[^>]+data-section="${sectionName}"[\\s\\S]*?<\\/[^>]+>`, "i");
  return fullHtml.replace(regex, newSectionHtml);
}

// ---------------- BRAND DETECTION ----------------
const BRAND_KEYWORDS = ["ferromat", "zbeda"];
function getBrandKeywords(prompt) {
  const promptLower = prompt.toLowerCase();
  return BRAND_KEYWORDS.filter((b) => promptLower.includes(b));
}

// ---------------- HANDLER ----------------
export default async function handler(req) {
  // Edge runtime uses standard Request/Response objects
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Use POST." }), { status: 405 });
  }

  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ error: "Missing auth token." }), { status: 401 });
    }

    let decoded;
    try {
      decoded = await auth.verifyIdToken(token);
    } catch {
      return new Response(JSON.stringify({ error: "Invalid auth token." }), { status: 401 });
    }

    const uid = decoded.uid;
    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Daily request limit reached" }), { status: 429 });
    }

    const {
      prompt, images = [], pexelsQuery: userQuery, imageCount = 8, videoCount = 2,
      projectId, pageName = "landing", targetSection = null, isRefinement = false,
      framework = "vanilla", mode = "standard", style = "default", deployment = "vercel"
    } = body;

    if (!prompt) {
      return new Response(JSON.stringify({ error: "Missing prompt." }), { status: 400 });
    }

    /* ================== PROJECT DATA & STACK LOCK ================== */
    const projectDocPath = `artifacts/ammoueai/users/${uid}/projects/${projectId}`;
    let projectData = {};
    let topicLock = "";
    
    if (projectId) {
      const snap = await db.doc(projectDocPath).get();
      projectData = snap.exists ? snap.data() : {};
      topicLock = projectData.topicLock || "";
      if (projectData.framework && projectData.framework !== framework) {
        return new Response(JSON.stringify({ error: "Stack Lock Violation" }), { status: 400 });
      }
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const activeStack = STACK_PRESETS[framework] || STACK_PRESETS.vanilla;
    const defaultImages = [
      "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg",
      "https://images.pexels.com/photos/3183132/pexels-photo-3183132.jpeg"
    ];

    const systemInstruction = `
You are an elite principal engineer at Vercel. 
DEPLOYMENT TARGET: VERCEL (STRICT)
CORE STACK: ${JSON.stringify(activeStack)}

BACKEND_MANIFEST OUTPUT RULE:
- Output MUST be STRICT JSON ONLY. NO comments, NO markdown.
FILE NAMING: Framework "${framework}" requires: ${activeStack.requiredFiles.join(", ")}.
FILE ISOLATION: Each [NEW_PAGE: filename] must be fully self-contained with its own <html>, <head>, <body>, <style>, and <script>.
OUTPUT ORDER: 1. [BACKEND_MANIFEST], 2. package.json, 3. vercel.json, 4. Remaining files.
`.trim();

    const model = genAI.getGenerativeModel({ 
      model: API_MODEL,
      systemInstruction: systemInstruction 
    });

    if (!topicLock && !isRefinement) {
      try {
        const result = await model.generateContent(`Summarize intent: "${prompt}"`);
        topicLock = result.response.text().trim();
      } catch (e) {
        topicLock = prompt.slice(0, 100);
      }
    }

    // ---------------- ASSET FETCHING ----------------
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
    if (!imageURLs.length) imageURLs = defaultImages;

    let heroVideo = "";
    try {
      const r = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(prompt)}&per_page=${videoCount}`, { headers: { Authorization: PEXELS_API_KEY } });
      const data = await r.json();
      heroVideo = data.videos?.[0]?.video_files?.[0]?.link || "";
    } catch {}

    // ---------------- GEMINI GENERATION ----------------
    const imageParts = images.filter(i => i.startsWith("data:")).map(img => ({ inlineData: dataUriToInlineData(img) }));
    const runtimeContext = `IMAGES: ${imageURLs.join("\n")}\nVIDEO: ${heroVideo}\nPROMPT: ${prompt}`;

    const result = await model.generateContent({ contents: [{ role: "user", parts: [...imageParts, { text: runtimeContext }] }] });
    
    let fullText = sanitizeOutput(result.response.text() || "");
    fullText = fullText.replace(/```[a-z]*\n/gi, "").replace(/```/g, "");

    /* ================== STEP 7: VALIDATION ================== */
    const BANNED_APIS = ["child_process", "fs.unlink", "eval(", "exec(", "spawn("];
    if (BANNED_APIS.some(p => fullText.includes(p))) throw new Error("SECURITY_ABORT_BANNED_API");

    let backendManifest = projectData.backendManifest || {};
    const manifestMatch = fullText.match(/\[BACKEND_MANIFEST\]([\s\S]*?)(?=\n\[NEW_PAGE:|$)/i);

    if (!manifestMatch && framework !== "vanilla") throw new Error("BACKEND_MANIFEST_REQUIRED");

    if (manifestMatch) {
      let raw = cleanJsonString(manifestMatch[1]);
      const jsonStart = raw.indexOf("{");
      const jsonEnd = raw.lastIndexOf("}");
      if (jsonStart !== -1 && jsonEnd !== -1) {
        raw = raw.slice(jsonStart, jsonEnd + 1);
        try { backendManifest = JSON.parse(raw); } catch (e) { throw new Error("BACKEND_MANIFEST_JSON_PARSE_FAILED"); }
      }
    }

    const pageBlocks = fullText.split(/\[NEW_PAGE:\s*(.*?)\s*\]/g).filter(Boolean);
    const pagesUpdate = {};
    for (let i = 0; i < pageBlocks.length; i += 2) {
      const fileName = pageBlocks[i].trim().toLowerCase().replace(/\s+/g, "-");
      const fileContent = (pageBlocks[i + 1] || "").trim();
      pagesUpdate[fileName] = { content: fileContent };
    }

    if (framework === "vanilla" && !pagesUpdate["index.html"]) {
      const fallbackKey = Object.keys(pagesUpdate).find(k => k.endsWith(".html") || k.includes("landing") || pagesUpdate[k].content.includes("<html"));
      if (fallbackKey) {
        pagesUpdate["index.html"] = pagesUpdate[fallbackKey];
        if (fallbackKey !== "index.html") delete pagesUpdate[fallbackKey];
      }
    }

    (STACK_REQUIREMENTS[framework] || []).forEach(f => {
      if (!pagesUpdate[f]) throw new Error(`STACK_FILE_MISSING:${f}`);
    });

    /* ================== STEP 8: STREAMING (WEB STANDARD) ================== */
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunkSize = 150;
        for (let i = 0; i < fullText.length; i += chunkSize) {
          const chunk = `data: ${JSON.stringify({ text: fullText.slice(i, i + chunkSize) })}\n\n`;
          controller.enqueue(encoder.encode(chunk));
          await new Promise(r => setTimeout(r, 5));
        }

        // SAVE TO DATABASE (Done at end of stream for Edge safety)
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
          await db.doc(projectDocPath).set({ topicLock, framework, backendManifest, pages: pagesUpdate, versions, capabilities: projectData.capabilities || { backend: framework !== "vanilla" } }, { merge: true });
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });

  } catch (err) {
    console.error("Generate error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), { status: 400 });
  }
}
