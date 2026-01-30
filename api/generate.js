import { GoogleGenerativeAI } from "@google/generative-ai";

// ---------------- VERCEL RUNTIME CONFIG ----------------
export const config = {
  runtime: 'edge',
};

// ---------------- CONFIG ----------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY;
const API_MODEL = "gemini-2.5-flash"; // Make sure to keep it as 2.5 i only have billing for 2.5 

const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT_ID = SERVICE_ACCOUNT.project_id;

const LIMITS = { free: 5, pro: 10 };

// ---------------- STACK PRESETS ----------------
const STACK_PRESETS = {
  "vanilla": {
    frontend: "HTML5, Tailwind CSS (CDN ONLY), Vanilla JS (INLINE ONLY)",
    backend: "None",
    structure: "Root-level index.html",
    requiredFiles: ["package.json", "vercel.json", "README.md", "index.html", "404.html"]
  },
  "react-vite": {
    frontend: "React 18+, Vite, Tailwind CSS",
    backend: "Vercel Serverless Functions",
    structure: "Vite Project Structure",
    requiredFiles: ["package.json", "vite.config.js", "index.html", "src/main.jsx", "src/App.jsx", "src/index.css", "vercel.json", "README.md"]
  },
  "nextjs": {
    frontend: "Next.js (App Router), Tailwind CSS",
    backend: "Next.js API Routes",
    structure: "Next.js Project Structure",
    requiredFiles: ["package.json", "next.config.js", "app/layout.jsx", "app/page.jsx", "app/globals.css", "vercel.json", "README.md"]
  },
  "react-node": {
    frontend: "React (Vite), Tailwind CSS (CDN ONLY, INLINE ONLY)",
    backend: "Node.js (Express Serverless)",
    structure: "Standard Vite + Express project",
    requiredFiles: ["package.json", "vercel.json", "src/main.jsx", "src/App.jsx", "api/index.js", "README.md"]
  }
};

// ---------------- PEXELS ASSET FETCHING ----------------
async function fetchPexelsAssets(prompt, genAI) {
  if (!PEXELS_API_KEY) return { images: [], videos: [] };
  
  try {
    // 1. Keyword Extraction Phase
    const extractionModel = genAI.getGenerativeModel({ model: API_MODEL });
    const extractionResult = await extractionModel.generateContent(
      `Extract exactly 3 highly descriptive search keywords from this prompt for a stock photo search. 
        Return ONLY the keywords separated by commas. Prompt: "${prompt}"`
    );
    const query = extractionResult.response.text().trim() || prompt;

    // 2. Fetch Assets
    const [imgRes, vidRes] = await Promise.all([
      fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=6`, {
        headers: { Authorization: PEXELS_API_KEY }
      }),
      fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=2`, {
        headers: { Authorization: PEXELS_API_KEY }
      })
    ]);

    const imgData = await imgRes.json();
    const vidData = await vidRes.json();

    return {
      images: imgData.photos?.map(p => p.src.large) || [],
      videos: vidData.videos?.map(v => v.video_files[0].link) || []
    };
  } catch (e) {
    console.error("Asset fetch error:", e);
    return { images: [], videos: [] };
  }
}

// ---------------- EDGE AUTH (WEB CRYPTO) ----------------
async function getAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    sub: SERVICE_ACCOUNT.client_email,
    aud: "https://firestore.googleapis.com/google.firestore.v1.Firestore",
    iat, exp,
    scope: "https://www.googleapis.com/auth/datastore"
  };

  const b64 = (obj) =>
    btoa(JSON.stringify(obj))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_");

  const unsignedToken = `${b64(header)}.${b64(payload)}`;

  const pemContents = SERVICE_ACCOUNT.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));

  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedToken)
  );

  const encodedSignature = btoa(
    String.fromCharCode(...new Uint8Array(signature))
  )
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");

  return `${unsignedToken}.${encodedSignature}`;
}

// ---------------- FIRESTORE REST ----------------
async function fetchFirestore(path, method = "GET", body = null) {
  const token = await getAccessToken();
  const isCommit = method === "COMMIT";

  const url = isCommit
    ? `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents:commit`
    : `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;

  const res = await fetch(url, {
    method: isCommit ? "POST" : method,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: body ? JSON.stringify(body) : null
  });

  return res.json();
}

// ---------------- DAILY LIMIT ----------------
async function enforceDailyLimit(uid) {
  const path = `users/${uid}`;
  const doc = await fetchFirestore(path);
  const fields = doc.fields || {};
  const now = Date.now();

  const plan = fields.plan?.stringValue === "pro" ? "pro" : "free";
  const limit = LIMITS[plan];

  let count = parseInt(fields.dailyCount?.integerValue || "0");
  let resetAt = parseInt(fields.dailyResetAt?.integerValue || "0");

  if (now > resetAt) {
    count = 0;
    resetAt = now + 86400000;
  }

  if (count >= limit) {
    return { allowed: false, plan, limit, resetAt };
  }

  const newCount = count + 1;

  await fetchFirestore(
    `${path}?updateMask.fieldPaths=dailyCount&updateMask.fieldPaths=dailyResetAt`,
    "PATCH",
    {
      fields: {
        dailyCount: { integerValue: newCount.toString() },
        dailyResetAt: { integerValue: resetAt.toString() }
      }
    }
  );

  return { allowed: true, plan, remaining: limit - newCount };
}

// ---------------- STRICT FILE PARSER (NO BLEED) ----------------
function extractFilesStrict(text) {
  const fileMap = {};
  const regex = /\/\*\s*\[NEW_PAGE:\s*(.*?)\s*\]\s*\*\/([\s\S]*?)\/\*\s*\[END_PAGE\]\s*\*\//g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const fileName = match[1].trim();
    let content = match[2].trim();
    content = content.replace(/^```[a-z]*\n?/gi, "").replace(/```$/g, "");
    fileMap[fileName] = content;
  }
  return fileMap;
}

// ---------------- RULE VALIDATION (HARD FAIL) ----------------
function validateGeneratedOutput(fullText) {
  const errors = [];

  if (!/\/\*\s*\[NEW_PAGE:/i.test(fullText)) {
    errors.push("Missing file boundary markers");
  }

  if (/<\/link>|<link\s+rel=|<script\s+src=|@import\s+/i.test(fullText)) {
    errors.push("External asset usage detected");
  }

  const illegalTextPattern = />[^<\n]+</g;
  if (illegalTextPattern.test(fullText)) {
    errors.push("Plain text detected outside comments");
  }

  if (!/\/\*\s*\[END_PAGE\]\s*\*\//i.test(fullText)) {
    errors.push("Missing END_PAGE markers");
  }

  return errors;
}

// ---------------- OUTPUT SANITIZER ----------------
function sanitizeOutput(text) {
  const secrets = [GEMINI_API_KEY, PEXELS_API_KEY, GOOGLE_SEARCH_KEY].filter(Boolean);
  let sanitized = text;
  secrets.forEach(s => {
    sanitized = sanitized.split(s).join("[REDACTED]");
  });
  return sanitized;
}

// ---------------- MAIN HANDLER ----------------
export default async function handler(req) {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7)
      : null;

    if (!userToken) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    const payload = JSON.parse(atob(userToken.split(".")[1]));
    const uid = payload.user_id || payload.sub;

    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) {
      return new Response(JSON.stringify({ error: "Daily limit reached" }), { status: 429 });
    }

    const { prompt, framework = "vanilla", projectId } = body;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const activeStack = STACK_PRESETS[framework] || STACK_PRESETS.vanilla;
    
    // Fetch precise Pexels assets
    const assets = await fetchPexelsAssets(prompt, genAI);

    const systemInstruction = `
ROLE: ELITE FULL-STACK SOFTWARE ARCHITECT & PRODUCT DESIGNER.

CORE OBJECTIVE:
Construct a production-ready, highly aesthetic, and fully functional multi-page application for the given prompt. Your output must be indistinguishable from code written by a Senior Engineer.

ENGINEERING LAWS:
- MULTI-FILE GENERATION: You MUST generate every file listed in this stack: ${activeStack.requiredFiles.join(", ")}. If the app needs more pages (e.g., about.html, contact.html), generate them too.
- CONFIGURATION: Always include a detailed package.json with appropriate dependencies and scripts, and a vercel.json for routing.
- ENCAPSULATION: Use [NEW_PAGE: filename] and [END_PAGE] markers for every file.
- ASSET USAGE: Use only the provided Pexels URLs for <img> and <video> tags to ensure visual brilliance.
- STYLING: Use Tailwind CSS extensively. Ensure high contrast, modern typography, and responsive layouts.
- NO EXTERNAL LINKS: No external JS/CSS except Tailwind CDN.
- NO NARRATIVE: No conversational text. Use [ACTION: task] tags to log your progress before code blocks.

AVAILABLE MEDIA ASSETS:
Images: ${JSON.stringify(assets.images)}
Videos: ${JSON.stringify(assets.videos)}

STACK SPECIFICATIONS:
${JSON.stringify(activeStack)}
`;

    const model = genAI.getGenerativeModel({
      model: API_MODEL,
      systemInstruction
    });

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "initializing" })}\n\n`));

        let finalText = "";
        let attempts = 0;
        let valid = false;

        while (!valid && attempts < 3) {
          attempts++;

          const result = await model.generateContentStream({
            contents: [{ role: "user", parts: [{ text: prompt }] }]
          });

          for await (const chunk of result.stream) {
            const text = chunk.text();
            finalText += text;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
          }

          const violations = validateGeneratedOutput(finalText);

          if (violations.length === 0) {
            valid = true;
          } else {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "rejecting", violations })}\n\n`));
            finalText = "";
            await model.generateContent(`Fix ALL violations strictly:\n${violations.join("\n")}`);
          }
        }

        if (!valid) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Validation failed" })}\n\n`));
          controller.close();
          return;
        }

        if (projectId) {
          const sanitized = sanitizeOutput(finalText);
          const files = extractFilesStrict(sanitized);
          
          const actionRegex = /\[ACTION:\s*(.*?)\s*\]/g;
          let logsHTML = "";
          let actionMatch;
          while ((actionMatch = actionRegex.exec(finalText)) !== null) {
            logsHTML += `<div class="text-[10px] text-slate-400 font-medium"><span class="text-emerald-500 mr-2">✔</span>${actionMatch[1]}</div>`;
          }

          const commitBody = {
            writes: [{
              update: {
                name: `projects/${PROJECT_ID}/databases/(default)/documents/artifacts/ammoueai/users/${uid}/projects/${projectId}`,
                fields: {
                  pages: {
                    mapValue: {
                      fields: Object.keys(files).reduce((acc, key) => {
                        acc[key] = { 
                          mapValue: { 
                            fields: { 
                              content: { stringValue: files[key] } 
                            } 
                          } 
                        };
                        return acc;
                      }, {})
                    }
                  },
                  framework: { stringValue: framework },
                  promptText: { stringValue: prompt },
                  logsContent: { stringValue: logsHTML },
                  lastUpdated: { integerValue: Date.now().toString() }
                }
              },
              updateMask: { fieldPaths: ["pages", "framework", "promptText", "logsContent", "lastUpdated"] }
            }]
          };
          await fetchFirestore(null, "COMMIT", commitBody);
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
