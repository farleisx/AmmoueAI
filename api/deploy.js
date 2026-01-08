// pages/api/deploy.js
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
    if (snap.exists) throw new Error("SLUG_TAKEN");

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

/* ---------------- VALIDATION ---------------- */
function validateCustomDomain(domain) {
  // Simple regex to ensure it looks like a domain
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain);
}

/* ---------------- HANDLER ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { htmlContent, userId, plan, projectId, slug, customDomain } = req.body;

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  // Enforce plan deployment limits
  try {
    const userProjectsSnap = await db
      .collection("artifacts")
      .doc(VERCEL_PROJECT)
      .collection("users")
      .doc(userId)
      .collection("projects")
      .get();

    if (userProjectsSnap.size >= PLAN_LIMITS[plan]) {
      return res.status(403).json({ error: "Plan deployment limit reached" });
    }
  } catch (err) {
    console.error("PLAN CHECK ERROR:", err);
    return res.status(500).json({ error: "Failed to check plan limits" });
  }

  let finalSlug = null;
  let publicAlias = null;

  try {
    /* -------- SLUG LOGIC -------- */
    if (slug) {
      if (plan !== "pro") {
        return res.status(403).json({
          error: "Custom site names are Pro-only",
        });
      }

      finalSlug = normalizeSlug(slug);

      if (!finalSlug || finalSlug.length < 3) {
        return res.status(400).json({ error: "Invalid site name" });
      }

      await reserveSlug(finalSlug, userId, projectId);
      publicAlias = `${finalSlug}.vercel.app`;
    }

    /* -------- INTERNAL PROJECT NAME -------- */
    const internalName = randomInternalName(userId);

    /* -------- DEPLOY -------- */
    const aliasList = [];
    if (publicAlias) aliasList.push(publicAlias);

    // Add custom domain if provided and Pro user
    let customDomainUrl = null;
    if (customDomain) {
      if (plan !== "pro") {
        return res.status(403).json({ error: "Custom domains are Pro-only" });
      }

      if (!validateCustomDomain(customDomain)) {
        return res.status(400).json({ error: "Invalid custom domain" });
      }

      aliasList.push(customDomain);
      customDomainUrl = `https://${customDomain}`;
    }

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
          files: [{ file: "index.html", data: htmlContent }],
          ...(aliasList.length > 0 && { alias: aliasList }),
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

    /* -------- SAVE PROJECT -------- */
    await db
      .collection("artifacts")
      .doc(VERCEL_PROJECT)
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId)
      .set(
        {
          slug: finalSlug || null,
          deploymentId: deployment.id,
          deploymentUrl,
          customDomainUrl: customDomainUrl || null,
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
    // Release slug on any failure
    if (finalSlug) await releaseSlug(finalSlug);

    if (err.message === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Site name already taken" });
    }

    console.error("DEPLOY ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
