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
const API_MODEL = "gemini-2.0-flash"; 

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
You are an elite principal engineer building for VERCEL.
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

    // ---------------- GEMINI INPUT & GENERATION ----------------
    const imageParts = images.filter(i => i.startsWith("data:")).map(img => ({ inlineData: dataUriToInlineData(img) }));
    const result = await model.generateContent({ contents: [{ role: "user", parts: [...imageParts, { text: systemInstruction }] }] });
    
    let fullText = result.response.text() || "";
    fullText = fullText.replace(/```[a-z]*\n/gi, "").replace(/```/g, "");

    /* ================== STEP 7: VALIDATION BEFORE STREAMING ================== */
    const BANNED_APIS = ["child_process", "fs.unlink", "eval(", "exec(", "spawn("];
    if (BANNED_APIS.some(p => fullText.includes(p))) throw new Error("SECURITY_ABORT_BANNED_API");

    // Extract Manifest
    let backendManifest = projectData.backendManifest || {};
    const manifestMatch = fullText.match(/\[BACKEND_MANIFEST\]\s*([\s\S]*?)(?=\[NEW_PAGE:|$)/i);
    
    if (!manifestMatch && framework !== "vanilla") throw new Error("BACKEND_MANIFEST_REQUIRED");
    if (manifestMatch) {
      backendManifest = JSON.parse(manifestMatch[1].trim());
      ["runtime", "routes", "env", "dependencies"].forEach(k => { if (!(k in backendManifest)) throw new Error(`MANIFEST_MISSING_KEY:${k}`); });
    }

    // Parse Pages
    const pageBlocks = fullText.split(/\[NEW_PAGE:\s*(.*?)\s*\]/g).filter(Boolean);
    const pagesUpdate = {};
    for (let i = 0; i < pageBlocks.length; i += 2) {
      const fileName = pageBlocks[i].trim().toLowerCase().replace(/\s+/g, "-");
      const fileContent = (pageBlocks[i + 1] || "").trim();

      // INLINE CHECKS
      if (fileName.endsWith(".js") && (fileContent.includes("<style") || fileContent.includes("<script"))) {
        throw new Error("HTML_TAG_IN_JS_FILE");
      }
      if (fileContent.includes("<style") && !fileContent.includes("</style>")) throw new Error("STYLE_TAG_NOT_CLOSED");
      if (fileContent.includes("<script") && !fileContent.includes("</script>")) throw new Error("SCRIPT_TAG_NOT_CLOSED");
      if (fileContent.includes('<link rel="stylesheet"') || fileContent.includes('<script src=')) throw new Error("INLINE_ONLY_VIOLATION");
      if (fileContent.includes("<style></style>")) throw new Error("EMPTY_STYLE_BLOCK");
      if (fileContent.includes("<script></script>")) throw new Error("EMPTY_SCRIPT_BLOCK");

      pagesUpdate[fileName] = { content: fileContent };
    }

    // ROOT PACKAGE.JSON ENFORCEMENT
    const pkgPaths = Object.keys(pagesUpdate).filter(f => f.endsWith("package.json"));
    if (pkgPaths.length > 1) throw new Error("MULTIPLE_PACKAGE_JSON");
    if (pkgPaths.length === 0 && framework !== "vanilla") throw new Error("PACKAGE_JSON_REQUIRED");
    if (pkgPaths.length === 1 && pkgPaths[0] !== "package.json") throw new Error("PACKAGE_JSON_MUST_BE_ROOT");

    // BACKEND ↔ PACKAGE.JSON HARD BINDING
    if (pagesUpdate["package.json"] && backendManifest.runtime) {
      const pkg = JSON.parse(pagesUpdate["package.json"].content);
      if (!pkg.engines || !pkg.engines.node) throw new Error("NODE_ENGINE_REQUIRED");
      if (!pkg.scripts || !pkg.scripts.start) throw new Error("START_SCRIPT_REQUIRED");
      if (pkg.scripts.start.includes("nodemon")) throw new Error("DEV_ONLY_SCRIPT_USED");
      
      const deps = pkg.dependencies || {};
      const devDeps = pkg.devDependencies || {};
      Object.keys(backendManifest.dependencies).forEach(d => {
        if (!deps[d]) throw new Error(`DEPENDENCY_MISMATCH:${d}`);
        if (devDeps[d]) throw new Error(`RUNTIME_DEP_IN_DEV:${d}`);
      });
    }

    // VERCEL.JSON ROUTE GUARANTEE
    if (pagesUpdate["vercel.json"] && backendManifest.routes) {
      const vercel = JSON.parse(pagesUpdate["vercel.json"].content);
      const vRoutes = vercel.routes || [];
      backendManifest.routes.forEach(r => {
        const found = vRoutes.some(v => v.dest?.includes("api") || v.src?.includes("api"));
        if (!found) throw new Error("VERCEL_ROUTE_MISMATCH");
      });
    }

    // STACK-AWARE FILE EXPECTATIONS
    (STACK_REQUIREMENTS[framework] || []).forEach(f => {
      if (!pagesUpdate[f]) throw new Error(`STACK_FILE_MISSING:${f}`);
    });

    const backendFiles = Object.keys(pagesUpdate).filter(f => f.startsWith("api/"));
    if (backendFiles.length > 1) throw new Error("MULTIPLE_BACKEND_ENTRIES");

    /* ================== STEP 8: STREAMING & SAVING ================== */
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const chunkSize = 150;
    for (let i = 0; i < fullText.length; i += chunkSize) {
      res.write(`data: ${JSON.stringify({ text: fullText.slice(i, i + chunkSize) })}\n\n`);
      await new Promise(r => setTimeout(r, 5));
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
