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

/* ---------------- HANDLER ---------------- */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { htmlContent, userId, plan, projectId, slug } = req.body;

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    /* -------- SLUG LOGIC -------- */

    let finalSlug = null;
    let publicAlias = null;

    if (slug) {
      if (plan !== "pro") {
        return res.status(403).json({
          error: "Custom domain names are Pro-only",
        });
      }

      finalSlug = normalizeSlug(slug);

      if (finalSlug.length < 3) {
        return res.status(400).json({ error: "Invalid site name" });
      }

      await reserveSlug(finalSlug, userId, projectId);
      publicAlias = `${finalSlug}.vercel.app`;
    }

    /* -------- INTERNAL PROJECT NAME -------- */
    const internalName = randomInternalName(userId);

    /* -------- DEPLOY -------- */
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
          target: "production",
          files: [{ file: "index.html", data: htmlContent }],
          ...(publicAlias && { alias: [publicAlias] }),
        }),
      }
    );

    const deployment = await deployRes.json();

    if (!deployRes.ok) {
      if (finalSlug) await releaseSlug(finalSlug);
      throw new Error(deployment.error?.message || "Vercel deploy failed");
    }

    const deploymentUrl = publicAlias
      ? `https://${publicAlias}`
      : `https://${deployment.url}`;

    /* -------- SAVE PROJECT -------- */
    await db
      .collection("artifacts")
      .doc("ammoueai")
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId)
      .set(
        {
          slug: finalSlug || null,
          deploymentId: deployment.id,
          deploymentUrl,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );

    return res.status(200).json({
      deploymentId: deployment.id,
      deploymentUrl,
      slug: finalSlug,
      status: deployment.readyState,
    });
  } catch (err) {
    if (err.message === "SLUG_TAKEN") {
      return res.status(409).json({ error: "Site name already taken" });
    }

    console.error("DEPLOY ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
