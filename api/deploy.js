import fetch from "node-fetch";
import admin from "firebase-admin";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue, Timestamp } from "firebase-admin/firestore";
import crypto from "crypto";
import sanitizeHtml from "sanitize-html";

/* ================= CONFIG ================= */
const PLAN_LIMITS = { free: 1, pro: 5, enterprise: 10 };
const MAX_HTML_SIZE = 500_000; // 500KB
const DEPLOY_COOLDOWN_MS = 30_000;
const SLUG_TTL_MS = 5 * 60 * 1000;
const MAX_VER_CEL_RETRIES = 2;
const ALLOWED_ORIGINS = ["https://ammoue-ai.vercel.app", "null"]; 

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;
const VERCEL_PROJECT = "ammoueai-sites";

/* ================= FIREBASE INIT ================= */
if (!getApps().length) {
  initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}
const db = getFirestore();

/* ================= HELPERS ================= */
function normalizeSlug(slug) {
  return slug.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 32);
}

function randomInternalName(uid) {
  return `${uid}-${crypto.randomBytes(4).toString("hex")}`;
}

function sanitizeHtmlByPlan(html, plan) {
  return sanitizeHtml(html, {
    allowedTags:
      plan === "free"
        ? ["html","head","body","div","span","p","h1","h2","h3","ul","li","img","a"]
        : ["html","head","body","div","span","p","h1","h2","h3","ul","li","img","a","strong","em","b","i","table","tr","td","th"],
    allowedAttributes:
      plan === "free"
        ? { a: ["href","target"], img: ["src","alt"], "*": ["class"] }
        : { a: ["href","target"], img: ["src","alt"], "*": ["class","style"] },
    allowedSchemes: ["http","https"],
    allowProtocolRelative: false,
  });
}

function validateDomain(domain) {
  if (!/^[a-z0-9-]+\.[a-z]{2,}$/i.test(domain)) return false;
  if (domain.endsWith("vercel.app") || domain.endsWith("vercel.com")) return false;
  return true;
}

/* ================= HANDLER ================= */
export default async function handler(req, res) {
  try {
    if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
    const origin = req.headers.origin || "null";
    if (!ALLOWED_ORIGINS.includes(origin)) return res.status(403).json({ error: "CORS origin not allowed" });

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) return res.status(401).json({ error: "Missing auth token" });

    let decoded;
    try { decoded = await admin.auth().verifyIdToken(authHeader.split("Bearer ")[1]); }
    catch { return res.status(401).json({ error: "Invalid token" }); }

    const uid = decoded.uid;
    const { htmlContent, projectId, slug, customDomain } = req.body;
    if (!htmlContent || !projectId) return res.status(400).json({ error: "Missing parameters" });
    if (htmlContent.length > MAX_HTML_SIZE) return res.status(413).json({ error: "HTML too large" });

    const userRef = db.collection("users").doc(uid);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return res.status(404).json({ error: "User not found" });
    const plan = userSnap.data().plan || "free";

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(userRef);
      const lastDeploy = snap.data()?.lastDeployAt?.toMillis() || 0;
      if (Date.now() - lastDeploy < DEPLOY_COOLDOWN_MS) throw new Error("RATE_LIMIT");
      tx.update(userRef, { lastDeployAt: FieldValue.serverTimestamp() });
    }).catch(err => {
      if (err.message === "RATE_LIMIT") throw { status: 429, error: "Cooldown active" };
      throw err;
    });

    const liveDeploymentsSnap = await db.collection("deployments").where("uid","==",uid).where("status","==","live").get();
    if (liveDeploymentsSnap.size >= PLAN_LIMITS[plan]) return res.status(403).json({ error: "Deployment limit reached" });

    const projectRef = db.collection("artifacts").doc(VERCEL_PROJECT).collection("users").doc(uid).collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    if (!projectSnap.exists) return res.status(404).json({ error: "Project not found" });

    let finalSlug = null;
    let slugRef = null;
    if (slug) {
      finalSlug = normalizeSlug(slug);
      if (!finalSlug || finalSlug.length < 3) return res.status(400).json({ error: "Invalid slug" });
      slugRef = db.collection("slugReservations").doc(finalSlug);

      try {
        await db.runTransaction(async (tx) => {
          const snap = await tx.get(slugRef);
          if (snap.exists && snap.data().uid !== uid && snap.data().expiresAt.toMillis() > Date.now()) throw new Error("SLUG_TAKEN");
          tx.set(slugRef, { uid, projectId, expiresAt: Timestamp.fromMillis(Date.now()+SLUG_TTL_MS) });
        });
      } catch (err) {
        if (err.message === "SLUG_TAKEN") return res.status(409).json({ error: "Slug already taken" });
        throw err;
      }
    }

    if (customDomain) {
      if (plan === "free") return res.status(403).json({ error: "Custom domains are Pro-only" });
      if (!validateDomain(customDomain)) return res.status(400).json({ error: "Invalid domain" });
    }

    const safeHtml = sanitizeHtmlByPlan(htmlContent, plan);
    await projectRef.update({ status: "deploying" });

    let deployment;
    for (let attempt = 0; attempt <= MAX_VER_CEL_RETRIES; attempt++) {
      try {
        const deployRes = await fetch(`https://api.vercel.com/v13/deployments${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}`:""}`, {
          method:"POST",
          headers:{Authorization:`Bearer ${VERCEL_TOKEN}`, "Content-Type":"application/json"},
          body:JSON.stringify({
            name: randomInternalName(uid),
            project: VERCEL_PROJECT,
            target:"production",
            files:[{file:"index.html",data:safeHtml}]
          })
        });
        deployment = await deployRes.json();
        if (!deployRes.ok) throw new Error("Vercel deployment failed");
        
        // Assign the clean alias to this specific deployment
        if (finalSlug) {
            await fetch(`https://api.vercel.com/v2/deployments/${deployment.id}/aliases${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}`:""}`, {
                method: "POST",
                headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
                body: JSON.stringify({ alias: `${finalSlug}.vercel.app` })
            });
        }
        
        break;
      } catch (err) { if (attempt===MAX_VER_CEL_RETRIES) throw err; }
    }

    // Determine return URL: if slug exists, use it. Otherwise, use the random deployment URL.
    const publicUrl = finalSlug ? `https://${finalSlug}.vercel.app` : `https://${deployment.url}`;

    await db.collection("deployments").add({ uid, projectId, deploymentId: deployment.id, status: "live", createdAt: FieldValue.serverTimestamp() });
    await projectRef.update({ 
      deploymentId: deployment.id, 
      deploymentUrl: publicUrl, 
      slug: finalSlug || null, 
      status: "live", 
      updatedAt: FieldValue.serverTimestamp() 
    });

    if (slugRef) await slugRef.delete();

    return res.status(200).json({ deploymentId: deployment.id, deploymentUrl: publicUrl, slug: finalSlug });

  } catch (err) {
    console.error("Deploy error:", err);
    const status = err.status || 500;
    const errorMsg = status===500 ? "Internal server error" : err.error || "Error";
    return res.status(status).json({ error: errorMsg });
  }
}
