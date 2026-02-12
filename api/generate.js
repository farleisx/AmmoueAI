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
const API_MODEL = "gemini-2.5-flash"; // keep 2.5 And keep this comment
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
    requiredFiles: ["package.json", "vite.config.js", "index.html", "src/main.jsx", "src/App.jsx", "src/index.css", "src/context/ThemeContext.jsx", "src/lib/utils.js", "vercel.json", "README.md"]
  },
  "nextjs": {
    frontend: "Next.js (App Router), Tailwind CSS",
    backend: "Next.js API Routes",
    structure: "Next.js Project Structure",
    requiredFiles: ["package.json", "next.config.js", "app/layout.jsx", "app/page.jsx", "app/globals.css", "lib/utils.js", "vercel.json", "README.md"]
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
    const extractionModel = genAI.getGenerativeModel({ model: API_MODEL });
    const extractionResult = await extractionModel.generateContent(
      `Extract exactly 3 highly descriptive search keywords from this prompt for a stock photo search. 
        Return ONLY the keywords separated by commas. Prompt: "${prompt}"`
    );
    const query = extractionResult.response.text().trim() || prompt;

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

  return { allowed: true, plan, remaining: limit - newCount, resetAt };
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
  if (!/\/\*\s*\[NEW_PAGE:/i.test(fullText)) errors.push("Missing file boundary markers");
  if (!/\/\*\s*\[END_PAGE\]\s*\*\//i.test(fullText)) errors.push("Missing END_PAGE markers");
  
  const files = extractFilesStrict(fullText);
  if (files['package.json']) {
    try {
      const pkg = JSON.parse(files['package.json']);
      const deps = pkg.dependencies || {};
      const allContent = Object.values(files).join("\n");
      const radixMatches = allContent.match(/@radix-ui\/react-[a-z-]+/g) || [];
      radixMatches.forEach(dep => {
        if (!deps[dep]) errors.push(`Dependency mismatch: ${dep} is imported but missing in package.json`);
      });
    } catch (e) {
      errors.push("Invalid package.json format");
    }
  }
  
  return errors;
}

// ---------------- OUTPUT SANITIZER ----------------
function sanitizeOutput(text) {
  const secrets = [GEMINI_API_KEY, PEXELS_API_KEY, GOOGLE_SEARCH_KEY].filter(Boolean);
  let sanitized = text;
  secrets.forEach(s => { sanitized = sanitized.split(s).join("[REDACTED]"); });
  return sanitized;
}

// ---------------- DYNAMIC SERVICE EXTRACTION ----------------
function extractServices(prompt) {
  const keywords = ["haircut", "beard trim", "coloring", "facial massage"];
  const found = keywords.filter(s => prompt.toLowerCase().includes(s));
  return found.map(s => ({ name: s.charAt(0).toUpperCase() + s.slice(1), duration: 30, price: 25 }));
}

// ---------------- MAIN HANDLER ----------------
export default async function handler(req) {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  try {
    const body = await req.json();
    const authHeader = req.headers.get("authorization") || "";
    const userToken = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!userToken) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });

    const payload = JSON.parse(atob(userToken.split(".")[1]));
    const uid = payload.user_id || payload.sub;

    const rate = await enforceDailyLimit(uid);
    if (!rate.allowed) return new Response(JSON.stringify({ error: "Daily limit reached", limit: rate.limit, resetAt: rate.resetAt }), { status: 429 });

    const { prompt, framework = "vanilla", projectId } = body;
    
    // ---------------- BOOKING / BUSINESS PREP ----------------
    let business_id = null;
    let services = [];
    if (prompt.toLowerCase().includes("booking") || prompt.toLowerCase().includes("appointment")) {
      business_id = "biz_" + Math.random().toString(36).substring(2, 10);
      
      services = extractServices(prompt);
      if (services.length === 0) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: API_MODEL });
        try {
          const result = await model.generateContent({
            contents: [{
              role: "user",
              parts: [{
                text: `The user wants a website for this business: "${prompt}". 
                       Generate 3-5 relevant services this business would realistically offer. 
                       Return the output as a JSON array of objects like:
                       [{ "id": "unique-slug", "name": "Service Name", "duration": 30, "price": 25 }, ...]`
              }]
            }]
          });
          try {
            const aiText = result.response.text();
            services = JSON.parse(aiText);
          } catch {
            services = [{ id: "general", name: "General Service", duration: 30, price: 25 }];
          }
        } catch (e) {
          services = [{ id: "general", name: "General Service", duration: 30, price: 25 }];
        }
      }
    }

    // Logic: Identify Framework from Prompt text if present, otherwise use selector value
    let targetFramework = framework;
    const lowerPrompt = prompt.toLowerCase();
    if (lowerPrompt.includes("react") || lowerPrompt.includes("vite")) targetFramework = "react-vite";
    else if (lowerPrompt.includes("nextjs") || lowerPrompt.includes("next.js")) targetFramework = "nextjs";
    else if (lowerPrompt.includes("node") || lowerPrompt.includes("express")) targetFramework = "react-node";

    // ---------------- HISTORY FETCHING FOR REFINEMENT ----------------
    let previousContext = "";
    let existingFiles = {};
    if (projectId) {
      const projectDoc = await fetchFirestore(`artifacts/ammoueai/users/${uid}/projects/${projectId}`);
      if (projectDoc && projectDoc.fields) {
        const historyPrompt = projectDoc.fields.promptText?.stringValue || "";
        const pagesMap = projectDoc.fields.pages?.mapValue?.fields || {};
        
        Object.keys(pagesMap).forEach(fileName => {
          existingFiles[fileName] = pagesMap[fileName].mapValue?.fields?.content?.stringValue || "";
        });

        if (historyPrompt) {
          previousContext = `
ORIGINAL PROJECT THEME: ${historyPrompt}
CURRENT EXISTING FILES ARCHITECTURE: ${Object.keys(existingFiles).join(", ")}
STRICT REFERENCE CODE FOR EXISTING COMPONENTS:
${Object.keys(existingFiles).map(f => `FILE: ${f}\nCONTENT_START:\n${existingFiles[f]}\nCONTENT_END`).join("\n")}
`;
        }
      }
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const activeStack = STACK_PRESETS[targetFramework] || STACK_PRESETS.vanilla;
    const assets = await fetchPexelsAssets(prompt, genAI);

    let systemInstruction = `
ROLE: WORLD-CLASS ELITE SOFTWARE ARCHITECT & AWARD-WINNING UI/UX DESIGNER.
GOAL: Create a website so visually stunning, technically perfect, and "insane" that it looks like the work of a 1M IQ god-tier developer. 
FRAMEWORK: ${targetFramework.toUpperCase()}
STACK SPEC: ${JSON.stringify(activeStack)}

${previousContext ? `REFINEMENT MODE ACTIVATED:
You are modifying an EXISTING project. 
${previousContext}

STRICT ARCHITECTURAL DIRECTIVES:
1. DO NOT change the existing UI style, color palette, or "vibe" unless explicitly requested.
2. If modifying an existing file, you MUST include the ENTIRE content of that file with your changes integrated. DO NOT truncate.
3. If adding a new feature, ensure it is seamlessly integrated into the existing layout (e.g., update the nav bar in App.jsx or index.html).
4. MAINTAIN THE SUBJECT: If the project is about "Coffee", every new page or component MUST strictly adhere to the "Coffee" theme.
5. PRESERVE LOGIC: Do not delete existing functional code from files unless it directly conflicts with the new request.` : ""}

DESIGN PHILOSOPHY:
- STYLE: $1M Dollar Tech Startup. Clean, ultra-modern, high-performance aesthetic.
- EFFECTS: Use "insane" glassmorphism, 3D transform hover effects, animated gradient borders, and bento-box layouts.
- ANIMATIONS: Implement advanced Tailwind-based micro-interactions.
- UX: Pro-level whitespace, massive high-impact typography, and seamless transitions.

STRICT TECHNICAL RULES:
1. Generate EVERY file required for the ${targetFramework} stack: ${activeStack.requiredFiles.join(", ")}.
2. You MUST include a "src/context/ThemeContext.jsx" file for ALL React projects to prevent build crashes.
3. For Next.js/React: Use JSX/TSX. DO NOT use plain HTML tags or CDN scripts in .jsx files.
4. DEPENDENCY GATEKEEPER:
   - NEVER use 'react-circular-progressbar' or 'recharts'.
   - Build charts and progress bars manually using pure Tailwind CSS and Framer Motion.
   - For icons, ONLY use 'lucide-react'. NEVER use 'Funnel'. Use 'Filter', 'BarChart', 'Zap', or 'TrendingUp'.
   - EVERY package imported in your code MUST be listed in 'dependencies' in package.json.
5. package.json MUST include: "framer-motion", "lucide-react", "clsx", "tailwind-merge", "class-variance-authority", "react-intersection-observer", "date-fns", "react-hook-form", "zod", "@radix-ui/react-slot", "@radix-ui/react-label", "@radix-ui/react-dialog", "@radix-ui/react-dropdown-menu", "@radix-ui/react-tabs", "@radix-ui/react-popover", "@radix-ui/react-accordion", "@radix-ui/react-scroll-area", "@radix-ui/react-select", "@radix-ui/react-separator", "@radix-ui/react-switch", "@radix-ui/react-tooltip", "@radix-ui/react-avatar", "@radix-ui/react-checkbox", "@radix-ui/react-slider", "@radix-ui/react-radio-group", "@radix-ui/react-progress", "@radix-ui/react-navigation-menu", "lucide-react".
6. CRITICAL BUILD SAFETY: 
   - You ARE WRITING JAVASCRIPT (.js/.jsx).
   - NEVER use the "type" keyword in imports (e.g., NO "import { type ... }").
   - NEVER use interface or type definitions.
   - For "src/lib/utils.js", use exactly this:
     import { clsx } from "clsx";
     import { twMerge } from "tailwind-merge";
     export function cn(...inputs) { return twMerge(clsx(inputs)); }
7. NEXT.js SECURITY & API RULES:
   - Use "next": "14.2.15" or higher in package.json.
   - NUCLEAR BAN: NEVER import from 'react-dom/server'. NO 'renderToStaticMarkup'.
   - If PDF/Export logic is needed, use CLIENT-SIDE libraries (jspdf, html2canvas) or pure data exports.
   - Route Handlers (app/api/...) MUST NOT import React components or rendering logic.
   - Route Handlers MUST include 'export const runtime = "edge";'.
8. You MUST use EXACTLY this marker format for EVERY file:
/* [NEW_PAGE: filename] */
Code goes here...
/* [END_PAGE] */
9. Output ONLY code inside markers. No conversation.
10. MEDIA: Use these URLs: Images: ${JSON.stringify(assets.images)}, Videos: ${JSON.stringify(assets.videos)}
11. LOGS: Use [ACTION: Task Name] before file blocks.
12. SYNTAX POLICE: Double check every bracket, brace, and parenthesis. Ensure every opening '{' has a closing '}' and every '[' has a ']'. A single syntax error is a total failure.
13. DIRECTORY ENFORCEMENT (NEXT.js): If framework is Next.js, all page components MUST be prefixed with 'app/' (e.g., 'app/page.jsx', 'app/layout.jsx').
`;

    // Include business info for booking/appointments
    if (business_id) {
      systemInstruction += `
BUSINESS CONFIGURATION:
- business_id: "${business_id}"
- default_services: ${JSON.stringify(services)}

INSTRUCTIONS FOR BOOKING FORMS:
1. Every booking form MUST have the attribute 'data-booking'.
2. The form MUST contain these input names: 'customer_name', 'customer_email', 'booking_date', 'booking_time', and 'service_id'.
3. Always include a hidden input: <input type="hidden" name="business_id" value="${business_id}">.
`;
    }

    const model = genAI.getGenerativeModel({ model: API_MODEL, systemInstruction });
    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ status: "initializing", remaining: rate.remaining, resetAt: rate.resetAt })}\n\n`));

        if (business_id) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ info: "Booking system pre-configured", business_id, services })}\n\n`));
        }

        try {
            const result = await model.generateContentStream({
              contents: [{ role: "user", parts: [{ text: `TASK: ${prompt}. 
              
              EXECUTION PLAN:
              1. Review the EXISTING code provided in context.
              2. Apply the requested changes while maintaining 100% style and theme consistency.
              3. If you add new pages, you MUST also output the modified version of existing navigation files (e.g. App.jsx, index.html) to include links to the new pages.
              4. You MUST output the FULL code for every file you touch or create. 
              5. Ensure all imports and package.json are in sync.
              6. NEVER use TypeScript syntax.
              7. FOR NEXT.js: ALL PAGES IN 'app/' DIRECTORY.` }] }]
            });

            let fullGeneratedText = "";
            try {
                for await (const chunk of result.stream) {
                  try {
                    const text = chunk.text();
                    fullGeneratedText += text;
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
                  } catch (chunkErr) {
                    console.error("Chunk parsing error:", chunkErr);
                    continue;
                  }
                }
            } catch (streamIterErr) {
                console.error("Stream iteration error:", streamIterErr);
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`));
            }

            if (projectId && fullGeneratedText) {
              const sanitized = sanitizeOutput(fullGeneratedText);
              const files = extractFilesStrict(sanitized);
              
              // REPAIRED: Clean injection for form submissions - NO MOCK LOGS
              if (business_id && files['index.html']) {
                  const bookingScript = `
<script>
document.addEventListener('DOMContentLoaded', () => {
    document.body.addEventListener('submit', async (e) => {
        if (e.target.matches('form[data-booking]')) {
            e.preventDefault();
            const f = e.target;
            const btn = f.querySelector('button[type="submit"]');
            const originalText = btn ? btn.innerText : 'Submit';
            
            if (btn) { btn.disabled = true; btn.innerText = 'Booking...'; }

            try {
                const formData = new FormData(f);
                const payload = Object.fromEntries(formData.entries());
                
                const res = await fetch('https://ammoue-ai.vercel.app/api/create-booking.js', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                
                const result = await res.json();
                if (res.ok) {
                    alert('Success! Your appointment is confirmed.');
                    f.reset();
                } else {
                    throw new Error(result.error || 'Failed to book');
                }
            } catch (err) {
                alert('Error: ' + err.message);
            } finally {
                if (btn) { btn.disabled = false; btn.innerText = originalText; }
            }
        }
    });
});
</script>
</body>`;
                  files['index.html'] = files['index.html'].replace('</body>', bookingScript);
              }

              // Merge Logic: New files overwrite old ones, missing files are preserved from history
              const mergedFiles = { ...existingFiles };
              Object.keys(files).forEach(f => {
                mergedFiles[f] = files[f];
              });

              const actionRegex = /\[ACTION:\s*(.*?)\s*\]/g;
              let logsHTML = "";
              let actionMatch;
              while ((actionMatch = actionRegex.exec(fullGeneratedText)) !== null) {
                logsHTML += `<div class="text-[10px] text-slate-400 font-medium"><span class="text-emerald-500 mr-2">✔</span>${actionMatch[1]}</div>`;
              }

              const commitBody = {
                writes: [{
                  update: {
                    name: `projects/${PROJECT_ID}/databases/(default)/documents/artifacts/ammoueai/users/${uid}/projects/${projectId}`,
                    fields: {
                      pages: {
                        mapValue: {
                          fields: Object.keys(mergedFiles).reduce((acc, key) => {
                            acc[key] = { mapValue: { fields: { content: { stringValue: mergedFiles[key] } } } };
                            return acc;
                          }, {})
                        }
                      },
                      framework: { stringValue: targetFramework },
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
        } catch (genErr) {
            console.error("Generation startup error:", genErr);
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: genErr.message })}\n\n`));
        }

        controller.enqueue(encoder.encode(`data: [DONE]\n\n`));
        controller.close();
      }
    });

    return new Response(stream, {
      headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" }
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
}
