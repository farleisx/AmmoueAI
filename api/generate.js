import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = {
  runtime: 'edge',
};

// ---------------- CONFIG & ASSET DEFAULTS ----------------
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const PEXELS_API_KEY = process.env.PEXELS_API_KEY;
const GOOGLE_CX = process.env.GOOGLE_CX;
const GOOGLE_SEARCH_KEY = process.env.GOOGLE_SEARCH_KEY;
const API_MODEL = "gemini-2.5-flash";

const SERVICE_ACCOUNT = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
const PROJECT_ID = SERVICE_ACCOUNT.project_id;

const LIMITS = { free: 5, pro: 10 };

// ---------------- EDGE-COMPATIBLE GOOGLE AUTH (JWT) ----------------
// This replaces firebase-admin for the Edge Runtime
async function getAccessToken() {
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 3600;
  
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: SERVICE_ACCOUNT.client_email,
    sub: SERVICE_ACCOUNT.client_email,
    aud: "https://firestore.googleapis.com/google.firestore.v1.Firestore",
    iat,
    exp,
    scope: "https://www.googleapis.com/auth/datastore"
  };

  const encodedHeader = btoa(JSON.stringify(header)).replace(/=/g, "");
  const encodedPayload = btoa(JSON.stringify(payload)).replace(/=/g, "");
  const unsignedToken = `${encodedHeader}.${encodedPayload}`;

  // Convert PEM private key to CryptoKey
  const pemHeader = "-----BEGIN PRIVATE KEY-----";
  const pemFooter = "-----END PRIVATE KEY-----";
  const pemContents = SERVICE_ACCOUNT.private_key
    .replace(pemHeader, "")
    .replace(pemFooter, "")
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

  const encodedSignature = btoa(String.fromCharCode(...new Uint8Array(signature)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");

  return `${unsignedToken}.${encodedSignature}`;
}

// ---------------- FIRESTORE REST HELPER ----------------
async function fetchFirestore(path, method = "GET", body = null) {
  const token = await getAccessToken();
  const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  
  const res = await fetch(url, {
    method,
    headers: { 
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}` 
    },
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

// ---------------- HANDLER ----------------
export default async function handler(req) {
  if (req.method !== "POST") return new Response("Use POST", { status: 405 });

  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    
    if (!userToken) return new Response("Unauthorized", { status: 401 });

    // Extract UID from User JWT (Frontend Token)
    const payload = JSON.parse(atob(userToken.split('.')[1]));
    const uid = payload.user_id || payload.sub;

    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) return new Response(JSON.stringify({ error: "Limit reached" }), { status: 429 });

    const { prompt, images = [], pexelsQuery, projectId, framework = "vanilla" } = body;

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: API_MODEL, 
      systemInstruction: `You are an elite engineer for ${framework}. Output [BACKEND_MANIFEST] then [NEW_PAGE: filename] blocks.`
    });

    // Asset Fetching
    let imageURLs = [];
    try {
      const pRes = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(pexelsQuery || prompt)}&per_page=6`, {
        headers: { Authorization: PEXELS_API_KEY }
      });
      const pData = await pRes.json();
      imageURLs = (pData.photos || []).map(p => p.src.large);
    } catch (e) { imageURLs = ["https://via.placeholder.com/1200"]; }

    const imageParts = images.filter(i => i.startsWith("data:")).map(img => ({ inlineData: dataUriToInlineData(img) }));
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [...imageParts, { text: `PROMPT: ${prompt}\nIMAGES: ${imageURLs.join("\n")}` }] }]
    });

    let fullText = sanitizeOutput(result.response.text() || "");
    fullText = fullText.replace(/```[a-z]*\n/gi, "").replace(/```/g, "");

    // Stream Setup
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const chunkSize = 200;
        for (let i = 0; i < fullText.length; i += chunkSize) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text: fullText.slice(i, i + chunkSize) })}\n\n`));
          await new Promise(r => setTimeout(r, 5));
        }

        // Logic to parse pages and save to Firestore using fetchFirestore goes here...
        
        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });

  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
