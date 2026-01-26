// api/generate.js
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
const API_MODEL = "gemini-2.5-flash"; 

const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT_ID = SERVICE_ACCOUNT.project_id;

const LIMITS = { free: 5, pro: 10 };

// ---------------- STACK PRESETS ----------------
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
  }
};

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

  const b64 = (obj) => btoa(JSON.stringify(obj)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  const unsignedToken = `${b64(header)}.${b64(payload)}`;

  const pemContents = SERVICE_ACCOUNT.private_key
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s/g, "");
  
  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryDer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );

  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", cryptoKey, new TextEncoder().encode(unsignedToken));
  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

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
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
    body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

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
    resetAt = now + (24 * 60 * 60 * 1000);
  }

  if (count >= limit) return { allowed: false, plan, limit, resetAt };

  const newCount = count + 1;
  await fetchFirestore(`${path}?updateMask.fieldPaths=dailyCount&updateMask.fieldPaths=dailyResetAt`, "PATCH", {
    fields: {
      dailyCount: { integerValue: newCount.toString() },
      dailyResetAt: { integerValue: resetAt.toString() }
    }
  });
  return { allowed: true, plan, remaining: limit - newCount };
}

// ---------------- CODE VALIDATION FALLBACK ----------------
function validateCodeCompleteness(code) {
  const tags = ["<html", "<head", "<body", "<script", "<style"];
  const closingTags = ["</html>", "</head>", "</body>", "</script>", "</style>"];
  
  let issues = [];
  tags.forEach((tag, index) => {
    const openingCount = (code.match(new RegExp(tag, "gi")) || []).length;
    const closingCount = (code.match(new RegExp(closingTags[index], "gi")) || []).length;
    if (openingCount > closingCount) {
        issues.push(`Unclosed ${tag} tag.`);
    }
  });

  if ((code.includes("export default") || code.includes("import")) && !code.trim().endsWith("}") && !code.trim().endsWith(";") && !code.trim().endsWith(">")) {
    issues.push("Truncated component structure.");
  }

  return issues;
}

// ---------------- HELPERS ----------------
function dataUriToInlineData(dataUri) {
  if (!dataUri?.startsWith("data:")) return null;
  const [meta, base64] = dataUri.split(",");
  const mimeType = meta.replace("data:", "").split(";")[0];
  return { data: base64, mimeType: mimeType || "image/png" };
}

function sanitizeOutput(text) {
  const secrets = [GEMINI_API_KEY, PEXELS_API_KEY, GOOGLE_SEARCH_KEY].filter(Boolean);
  let sanitized = text;
  secrets.forEach(s => sanitized = sanitized.split(s).join("[REDACTED]"));
  return sanitized;
}

// ---------------- MAIN HANDLER ----------------
export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!userToken) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const payload = JSON.parse(atob(userToken.split('.')[1]));
    const uid = payload.user_id || payload.sub;

    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) return new Response(JSON.stringify({ error: "Daily limit reached" }), { status: 429 });

    const { prompt, images = [], pexelsQuery, projectId, framework = "vanilla" } = body;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const activeStack = STACK_PRESETS[framework] || STACK_PRESETS.vanilla;
    
    const systemInstruction = `Role: Elite Principal Full-Stack Architect & Senior Software Engineer.

ARCHITECTURAL MANDATES:
1. FULL PROJECT DELIVERY: Deliver every required file. Each file MUST be isolated.
2. FILE ENCAPSULATION (CRITICAL): Start every single file block with the EXACT marker below. Do not mix code from different files.
   - For HTML: - For JS/JSON/REACT/NEXT.JS/CONFIG: /* [NEW_PAGE: filename.ext] */
   - Ensure you CLOSE the current file logic before starting a new marker.
3. NAVIGATION & UX: implement functional buttons/links between pages (e.g., index.html <-> dashboard.html). Use the generated filenames in href attributes.
4. ABSOLUTE ZERO PLAIN TEXT (STRICT): 
   - FORBIDDEN: Plain text notes outside of comments.
   - JS/JSON/REACT/NEXT.JS: Use // note or /* note */.
   - HTML: Use .
5. FRONTEND INLINE PHILOSOPHY: All pages are self-contained with Inline CSS, Tailwind (CDN), and Inline JS.
6. ASSET RELEVANCE: Use the provided 8 Pexels images and 2 videos strictly matching the prompt's niche. Never use Unsplash.

Stack Context: ${JSON.stringify(activeStack)}.`;
    
    const model = genAI.getGenerativeModel({ model: API_MODEL, systemInstruction });

    let assets = [];
    try {
      const searchQuery = encodeURIComponent(pexelsQuery || prompt.split(" ").slice(0, 3).join(" "));
      const imgRes = await fetch(`https://api.pexels.com/v1/search?query=${searchQuery}&per_page=8`, {
        headers: { Authorization: PEXELS_API_KEY }
      });
      const imgData = await imgRes.json();
      const imagesList = (imgData.photos || []).map(p => `IMAGE: ${p.src.large}`);

      const vidRes = await fetch(`https://api.pexels.com/videos/search?query=${searchQuery}&per_page=2`, {
        headers: { Authorization: PEXELS_API_KEY }
      });
      const vidData = await vidRes.json();
      const videosList = (vidData.videos || []).map(v => `VIDEO: ${v.video_files[0].link}`);
      
      assets = [...imagesList, ...videosList];
    } catch (e) { assets = ["IMAGE: https://via.placeholder.com/1200"]; }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "initializing", heartbeat: true })}\n\n`));

        try {
          const imageParts = images.filter(i => i.startsWith("data:")).map(img => ({ inlineData: dataUriToInlineData(img) }));
          const result = await model.generateContentStream({
            contents: [{ role: "user", parts: [...imageParts, { text: `PROMPT: ${prompt}\nASSETS:\n${assets.join("\n")}` }] }]
          });

          let fullContent = "";
          for await (const chunk of result.stream) {
            const chunkText = chunk.text();
            fullContent += chunkText;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: chunkText })}\n\n`));
          }

          let repairAttempts = 0;
          let currentIssues = validateCodeCompleteness(fullContent);

          while (currentIssues.length > 0 && repairAttempts < 3) {
            repairAttempts++;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "fixing", attempt: repairAttempts, issues: currentIssues })}\n\n`));
            const repairResult = await model.generateContent(`The code was incomplete: ${currentIssues.join(" ")}. Provide ONLY the exact missing code.`);
            const repairText = repairResult.response.text();
            fullContent += "\n" + repairText;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: repairText, healed: true })}\n\n`));
            currentIssues = validateCodeCompleteness(fullContent);
          }

          if (projectId) {
            const sanitized = sanitizeOutput(fullContent);
            const fileParts = sanitized.split(/(?:|\*\/)/i);
            const pagesUpdate = {};

            for (let i = 1; i < fileParts.length; i += 2) {
              let fileName = fileParts[i].trim();
              let content = fileParts[i+1]?.trim();
              if (content) {
                content = content.replace(/^```[a-z]*\n/gi, "").replace(/```$/g, "");
                if (!/\.(html|js|jsx|json|md|css|ts|tsx)$/i.test(fileName)) fileName = `${fileName}.html`;
                pagesUpdate[fileName] = { stringValue: content };
              }
            }

            const docPath = `projects/${PROJECT_ID}/databases/(default)/documents/artifacts/ammoueai/users/${uid}/projects/${projectId}`;
            const commitBody = {
              writes: [{
                update: {
                  name: `projects/${PROJECT_ID}/databases/(default)/documents/artifacts/ammoueai/users/${uid}/projects/${projectId}`,
                  fields: {
                    pages: {
                      mapValue: {
                        fields: Object.keys(pagesUpdate).reduce((acc, key) => {
                          acc[key] = { mapValue: { fields: { content: { stringValue: pagesUpdate[key].stringValue } } } };
                          return acc;
                        }, {})
                      }
                    },
                    framework: { stringValue: framework },
                    lastUpdated: { integerValue: Date.now().toString() }
                  }
                },
                updateMask: { fieldPaths: ["pages", "framework", "lastUpdated"] }
              }]
            };

            await fetchFirestore(null, "COMMIT", commitBody);
          }

          controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        } catch (err) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`));
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, { 
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" } 
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
