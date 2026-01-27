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
    frontend: "HTML5, Tailwind CSS (CDN ONLY), Vanilla JS (INLINE ONLY)",
    backend: "None",
    structure: "Root-level index.html",
    requiredFiles: ["package.json", "vercel.json", "README.md", "index.html"]
  },
  "react-node": {
    frontend: "React (Vite), Tailwind CSS (CDN ONLY, INLINE ONLY)",
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

    const { prompt, images = [], pexelsQuery, projectId, framework = "vanilla" } = body;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const activeStack = STACK_PRESETS[framework] || STACK_PRESETS.vanilla;

    const systemInstruction = `
ROLE: COMPILER-GRADE FULL STACK CODE GENERATOR.

ABSOLUTE LAWS:
- FILES MUST USE [NEW_PAGE] + [END_PAGE]
- INLINE CSS/JS ONLY
- NO EXTERNAL ASSETS
- NO PLAIN TEXT (COMMENTS ONLY)
- ZERO CONTENT OUTSIDE FILES

CREATIVE NARRATION:
- You MUST frequently output [ACTION: description] tags to explain what you are currently building (e.g., [ACTION: Designing glassmorphism header]). Output these actions BEFORE the code they describe.

STACK:
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
            controller.enqueue(
              encoder.encode(
                `data: ${JSON.stringify({ status: "rejecting", violations })}\n\n`
              )
            );

            finalText = "";
            await model.generateContent(
              `Fix ALL violations strictly:\n${violations.join("\n")}`
            );
          }
        }

        if (!valid) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: "Validation failed" })}\n\n`
            )
          );
          controller.close();
          return;
        }

        if (projectId) {
          const sanitized = sanitizeOutput(finalText);
          const files = extractFilesStrict(sanitized);

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
                  lastUpdated: { integerValue: Date.now().toString() }
                }
              },
              updateMask: { fieldPaths: ["pages", "framework", "lastUpdated"] }
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
