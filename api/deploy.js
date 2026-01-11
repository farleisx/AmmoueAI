// /api/deploy.js
import fetch from "node-fetch";
import admin from "firebase-admin";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

/* ================= CONFIG ================= */

const PLAN_LIMITS = {
  free: 1,
  pro: 5,
};

const DEPLOY_COOLDOWN_MS = 15_000; // 15 seconds
const MAX_HTML_SIZE = 5000_000; // 50KB

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
  return slug
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, 32);
}

function validateDomain(domain) {
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

async function reserveSlug(slug, userId, projectId) {
  const ref = db.collection("slugReservations").doc(slug);

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);

    if (snap.exists) {
      const data = snap.data();
      if (data.projectId !== projectId) {
        throw new Error("SLUG_TAKEN");
      }
      return;
    }

    tx.set(ref, {
      userId,
      projectId,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
}

/* ================= HANDLER ================= */

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    /* ---------- AUTH ---------- */

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const idToken = authHeader.split("Bearer ")[1];
    const decoded = await admin.auth().verifyIdToken(idToken);
    const userId = decoded.uid;

    /* ---------- INPUT ---------- */

    const { htmlContent, projectId, slug, customDomain } = req.body;

    if (!htmlContent || !projectId) {
      return res.status(400).json({ error: "Missing parameters" });
    }

    if (htmlContent.length > MAX_HTML_SIZE) {
      return res.status(413).json({ error: "HTML too large" });
    }

    /* ---------- USER + PLAN ---------- */

    const userRef = db.collection("users").doc(userId);
    const userSnap = await userRef.get();

    const plan = userSnap.exists ? userSnap.data().plan : "free";

    if (!PLAN_LIMITS[plan]) {
      return res.status(403).json({ error: "Invalid plan" });
    }

    /* ---------- PROJECT ---------- */

    const projectRef = db
      .collection("artifacts")
      .doc(VERCEL_PROJECT)
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);

    const projectSnap = await projectRef.get();

    if (!projectSnap.exists) {
      return res.status(404).json({ error: "Project not found" });
    }

    const projectData = projectSnap.data();

    /* ---------- OWNERSHIP ---------- */

    if (projectData.userId && projectData.userId !== userId) {
      return res.status(403).json({ error: "Forbidden" });
    }

    /* ---------- DEPLOY COOLDOWN ---------- */

    const lastDeploy = projectData.lastDeployAt?.toMillis?.() || 0;
    if (Date.now() - lastDeploy < DEPLOY_COOLDOWN_MS) {
      return res
        .status(429)
        .json({ error: "Deploy cooldown active (15s)" });
    }

    /* ---------- PLAN LIMIT ---------- */

    const projectsSnap = await projectRef.parent.get();
    if (projectsSnap.size > PLAN_LIMITS[plan]) {
      return res
        .status(403)
        .json({ error: "Plan deployment limit reached" });
    }

    /* ---------- INTERNAL NAME ---------- */

    const internalName =
      projectData.internalName || `site-${projectId}`;

    /* ---------- SLUG ---------- */

    let finalSlug = projectData.slug || null;
    let publicAlias = null;

    if (slug) {
      if (plan !== "free") {
        return res
          .status(403)
          .json({ error: "Custom site names are Pro-only" });
      }

      const normalized = normalizeSlug(slug);

      if (!normalized || normalized.length < 3) {
        return res.status(400).json({ error: "Invalid site name" });
      }

      if (normalized !== projectData.slug) {
        await reserveSlug(normalized, userId, projectId);
      }

      finalSlug = normalized;
    }

    if (finalSlug) {
      publicAlias = `${finalSlug}.vercel.app`;
    }

    /* ---------- CUSTOM DOMAIN ---------- */

    let customDomainUrl = projectData.customDomainUrl || null;
    const aliasList = [];

    if (publicAlias) aliasList.push(publicAlias);

    if (customDomain) {
      if (plan !== "pro") {
        return res
          .status(403)
          .json({ error: "Custom domains are Pro-only" });
      }

      if (!validateDomain(customDomain)) {
        return res.status(400).json({ error: "Invalid custom domain" });
      }

      aliasList.push(customDomain);
      customDomainUrl = `https://${customDomain}`;
    }

    /* ---------- DEPLOY ---------- */

    const deployRes = await fetch(
      `https://api.vercel.com/v13/deployments${
        VERCEL_TEAM_ID ? `?teamId=${VERCEL_TEAM_ID}` : ""
      }`,
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
          files: [
            {
              file: "index.html",
              data: htmlContent,
            },
          ],
          ...(aliasList.length && { alias: aliasList }),
        }),
      }
    );

    const deployment = await deployRes.json();

    if (!deployRes.ok) {
      throw new Error(deployment.error?.message || "Vercel deploy failed");
    }

    const deploymentUrl = publicAlias
      ? `https://${publicAlias}`
      : `https://${deployment.url}`;

    /* ---------- SAVE ---------- */

    await projectRef.set(
      {
        internalName,
        slug: finalSlug,
        deploymentId: deployment.id,
        deploymentUrl,
        customDomainUrl,
        lastDeployAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    return res.status(200).json({
      deploymentId: deployment.id,
      deploymentUrl,
      slug: finalSlug,
      customDomainUrl,
      status: deployment.readyState,
    });
  } catch (err) {
    if (err.message === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Site name already taken" });
    }

    console.error("DEPLOY ERROR:", err);
    return res.status(500).json({ error: "Deployment failed" });
  }
}
