// api/deploy.js
import fetch from "node-fetch";
import admin from "firebase-admin";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import crypto from "crypto";

/* ---------------- CONFIG ---------------- */
const PLAN_LIMITS = { free: 1, pro: 5 };
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;
const VERCEL_PROJECT = "ammoueai-sites"; // ✅ Dedicated project for user deployments
const FIREBASE_PROJECT_ID = "ammoueai"; // ✅ Matches appId in fire_prompt.js

/* ---------------- FIREBASE INIT ---------------- */
if (!getApps().length) {
  initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = getFirestore();

/* ---------------- HELPERS ---------------- */
function normalizeSlug(slug) {
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function randomInternalName(userId) {
  return `${userId}-${crypto.randomBytes(4).toString("hex")}`;
}

async function reserveSlug(slug, userId, projectId) {
  const ref = db.collection("slugReservations").doc(slug);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    // Modified logic: If slug exists but belongs to the same user/project, allow re-deployment
    if (snap.exists && snap.data().userId !== userId) throw new Error("SLUG_TAKEN");

    tx.set(ref, {
      userId,
      projectId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

async function releaseSlug(slug) {
  await db.collection("slugReservations").doc(slug).delete();
}

/* ---------------- VALIDATION & AUDIT ---------------- */
function validateCustomDomain(domain) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

/**
 * 🛠️ SELF-HEALING AUDITOR
 * Checks for syntax errors that would break the site.
 */
function performAudit(files) {
  for (const file of files) {
    if (file.file.endsWith(".html")) {
      const content = file.data;
      
      // Check 1: Missing critical tags
      if (!content.includes("<body") && !content.includes("</div>")) {
        return { ok: false, error: `Critical structural tags missing in ${file.file}` };
      }

      // Check 2: Unclosed tag count (Basic Check)
      const openDivs = (content.match(/<div/g) || []).length;
      const closeDivs = (content.match(/<\/div>/g) || []).length;
      if (Math.abs(openDivs - closeDivs) > 2) {
        return { ok: false, error: `Detected ${Math.abs(openDivs - closeDivs)} unclosed <div> tags in ${file.file}` };
      }

      // Check 3: Truncated code (often happens if AI hits token limit)
      if (content.trim().endsWith("=") || content.trim().endsWith("<")) {
        return { ok: false, error: `Code appears to be truncated in ${file.file}` };
      }
    }
  }
  return { ok: true };
}

/* ---------------- HANDLER ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { htmlContent, projectId, slug, customDomain, framework = "vanilla", attempt = 1 } = req.body;

  if (!projectId) {
    return res.status(400).json({ error: "Missing parameters: projectId is required" });
  }

  /* ---------------- AUTH VERIFY ---------------- */
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: No token provided" });
  }

  let userId;
  try {
    const token = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(token);
    userId = decoded.uid;
  } catch (err) {
    return res.status(401).json({ error: "Invalid token: " + err.message });
  }

  /* ---------------- FETCH USER PLAN ---------------- */
  let plan = "free";
  try {
    const userDoc = await db.collection("users").doc(userId).get();
    if (userDoc.exists) {
      plan = userDoc.data().plan || "free";
    }
  } catch (err) {
    console.error("PLAN FETCH ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch plan: " + err.message });
  }

  const planLimit = PLAN_LIMITS[plan] ?? PLAN_LIMITS.free;

  /* ---------------- FETCH ALL PAGES FOR DEPLOYMENT ---------------- */
  let vercelFiles = [];
  try {
    const projectRef = db.collection("artifacts").doc(FIREBASE_PROJECT_ID).collection("users").doc(userId).collection("projects").doc(projectId);
    const projectSnap = await projectRef.get();
    
    if (projectSnap.exists) {
      const projectData = projectSnap.data();
      const pages = projectData.pages || {};

      Object.entries(pages).forEach(([name, data]) => {
        const fileData = typeof data === 'string' ? data : (data.content || "");
        let fileName = name;

        // Smart Mapping for Frameworks vs Vanilla
        if (fileName === "landing") {
          fileName = (framework === "vanilla" || !framework) ? "index.html" : "index.jsx";
        }

        // Support for nested structures (e.g., src/App.js) provided by editor tabs
        vercelFiles.push({ file: fileName, data: String(fileData || "") });
        
        // Ensure root index exists for vanilla deployments if specifically named index
        if (framework === "vanilla" && (name === "landing" || name === "index")) {
          vercelFiles.push({ file: "index.html", data: String(fileData || "") });
        }
      });
    } else if (htmlContent) {
      // Fallback for direct deployment from editor
      vercelFiles.push({ file: "index.html", data: String(htmlContent || "") });
    }
  } catch (err) {
    console.error("PROJECT FETCH ERROR:", err);
    return res.status(500).json({ error: "Failed to prepare deployment files: " + err.message });
  }

  if (vercelFiles.length === 0 || vercelFiles.every(f => !f.data || f.data.trim() === "")) {
    return res.status(400).json({ error: "No content found for deployment. Please save your project first." });
  }

  /* ---------------- 🛠️ AUDIT CHECK (NEW) ---------------- */
  const auditResult = performAudit(vercelFiles);
  if (!auditResult.ok) {
    return res.status(422).json({ 
      error: "CORRUPT_FILES_DETECTED", 
      details: auditResult.error,
      attempt: attempt
    });
  }

  /* ---------------- TOTAL DEPLOYMENT LIMIT ---------------- */
  try {
    const statsRef = db.collection("deploymentStats").doc(userId);
    const statsSnap = await statsRef.get();

    const totalDeployments = statsSnap.exists
      ? statsSnap.data().totalDeployments || 0
      : 0;

    const isNewDeployment = !statsSnap.exists;
    if (isNewDeployment && totalDeployments >= planLimit) {
      return res.status(403).json({
        error: "Plan deployment limit reached",
        upgradeRequired: true,
        currentPlan: plan,
        limit: planLimit,
      });
    }
  } catch (err) {
    console.error("DEPLOYMENT LIMIT ERROR:", err);
    return res.status(500).json({ error: "Failed to check deployment limits: " + err.message });
  }

  let finalSlug = null;
  let publicAlias = null;

  try {
    /* -------- SLUG LOGIC -------- */
    if (slug) {
      finalSlug = normalizeSlug(slug);

      if (!finalSlug || finalSlug.length < 3) {
        return res.status(400).json({ error: "Invalid site name: must be at least 3 characters" });
      }

      await reserveSlug(finalSlug, userId, projectId);
      publicAlias = `${finalSlug}.vercel.app`;
    }

    /* -------- INTERNAL PROJECT NAME -------- */
    const internalName = randomInternalName(userId);

    /* -------- DEPLOY -------- */
    const aliasList = [];
    if (publicAlias) aliasList.push(publicAlias);

    let customDomainUrl = null;

    if (customDomain) {
      if (plan !== "pro") {
        return res.status(403).json({
          error: "Custom domains are Pro-only",
          upgradeRequired: true,
          requiredPlan: "pro",
        });
      }

      if (!validateCustomDomain(customDomain)) {
        return res.status(400).json({ error: "Invalid custom domain format" });
      }

      try {
        const attachRes = await fetch(
          `https://api.vercel.com/v9/projects/${VERCEL_PROJECT}/domains`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${VERCEL_TOKEN}`,
              "Content-Type": "application/json",
              ...(VERCEL_TEAM_ID ? { "X-Vercel-Team-Id": VERCEL_TEAM_ID } : {}),
            },
            body: JSON.stringify({
              name: customDomain,
              project: VERCEL_PROJECT,
              ...(VERCEL_TEAM_ID ? { teamId: VERCEL_TEAM_ID } : {}),
            }),
          }
        );

        const attachData = await attachRes.json();
        if (!attachRes.ok) {
          throw new Error(attachData.error?.message || "Vercel domain attach failed");
        }

        customDomainUrl = `https://${customDomain}`;
        aliasList.push(customDomain);
      } catch (err) {
        return res.status(500).json({ error: "Failed to attach custom domain: " + err.message });
      }
    }

    // Advanced Framework Resolution
    const frameworkSettings = {
      vanilla: { framework: null, buildCommand: null, outputDirectory: null },
      "react-vite": { framework: "vite", buildCommand: "npm run build", outputDirectory: "dist" },
      nextjs: { framework: "nextjs", buildCommand: "npm run build", outputDirectory: ".next" },
      "react-node": { framework: null, buildCommand: "npm run build", outputDirectory: "dist" }
    }[framework] || { framework: null };

    const deployRes = await fetch(
      `https://api.vercel.com/v13/deployments${VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ""}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${VERCEL_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: internalName,
          project: VERCEL_PROJECT,
          target: "production",
          files: vercelFiles, 
          projectSettings: frameworkSettings,
          ...(aliasList.length > 0 && { alias: aliasList }),
        }),
      }
    );

    const deployment = await deployRes.json();

    if (!deployRes.ok) {
      throw new Error(deployment.error?.message || `Vercel deploy failed with status ${deployRes.status}`);
    }

    const deploymentUrl = publicAlias
      ? `https://${publicAlias}`
      : `https://${deployment.url}`;

    /* -------- SAVE PROJECT (DUAL SAVE) -------- */
    const updatePayload = {
      slug: finalSlug || null,
      deploymentId: deployment.id,
      deploymentUrl,
      customDomainUrl: customDomainUrl || null,
      framework: framework,
      updatedAt: FieldValue.serverTimestamp(),
    };

    const firebasePath = db.collection("artifacts").doc(FIREBASE_PROJECT_ID).collection("users").doc(userId).collection("projects").doc(projectId);
    const legacyPath = db.collection("artifacts").doc(VERCEL_PROJECT).collection("users").doc(userId).collection("projects").doc(projectId);

    await Promise.all([
      firebasePath.set(updatePayload, { merge: true }),
      legacyPath.set(updatePayload, { merge: true })
    ]);

    /* -------- DEPLOYMENT ANALYTICS -------- */
    await db.collection("deploymentStats").doc(userId).set(
      {
        plan,
        totalDeployments: FieldValue.increment(1),
        lastDeploymentAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection("deploymentAnalytics").add({
      userId,
      plan,
      projectId,
      deploymentId: deployment.id,
      createdAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({
      deploymentId: deployment.id,
      deploymentUrl,
      slug: finalSlug,
      customDomainUrl,
      status: deployment.readyState,
      plan,
      framework
    });
  } catch (err) {
    if (finalSlug) await releaseSlug(finalSlug);

    if (err.message === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Site name already taken" });
    }

    console.error("DEPLOY ERROR:", err);
    return res.status(500).json({ error: "Deployment Error: " + err.message });
  }
}
