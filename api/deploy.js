// pages/api/deploy.js
import fetch from "node-fetch";
import admin from "firebase-admin";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import crypto from "crypto";

// ---------------- CONFIG ----------------
const PLAN_LIMITS = { free: 1, pro: 5 };
const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = "ammoueai-sites"; // Dedicated project
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

// ---------------- FIREBASE INIT ----------------
if (!getApps().length) {
  initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = getFirestore();

// ---------------- HELPERS ----------------
async function getDeploymentCount(userId) {
  const snap = await db.collection("deployments").doc(userId).get();
  return snap.exists ? snap.data().count || 0 : 0;
}

async function incrementDeploymentCount(userId) {
  await db.collection("deployments").doc(userId).set(
    { count: admin.firestore.FieldValue.increment(1) },
    { merge: true }
  );
}

// Clean AI-generated HTML before deployment
function cleanHtml(html) {
  if (!html) return "";
  let cleaned = html.trim();

  // Remove Markdown code fences
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-z]*\n?/, ""); // opening ```
    cleaned = cleaned.replace(/```$/, "");          // closing ```
  }

  return cleaned;
}

// ---------------- HANDLER ----------------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { htmlContent, userId, plan, projectId } = req.body;

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    // -------- PLAN LIMIT CHECK --------
    const maxDeployments = PLAN_LIMITS[plan] || 1;
    const currentDeployments = await getDeploymentCount(userId);

    const projectRef = db
      .collection("artifacts")
      .doc("ammoueai")
      .collection("users")
      .doc(userId)
      .collection("projects")
      .doc(projectId);

    const projectSnap = await projectRef.get();
    const isUpdate = !!projectSnap.data()?.deploymentUrl;

    if (!isUpdate && currentDeployments >= maxDeployments) {
      return res.status(403).json({
        error: "Plan limit reached",
        maxDeployments,
      });
    }

    // -------- CLEAN HTML --------
    const htmlToDeploy = cleanHtml(htmlContent);

    // -------- UNIQUE SLUG FOR THIS DEPLOYMENT --------
    const uniqueSlug = `${userId}-${crypto.randomBytes(3).toString("hex")}`;

    // -------- VERCEL DEPLOY --------
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
          name: uniqueSlug,
          project: VERCEL_PROJECT,
          target: "production",
          files: [
            {
              file: "index.html",
              data: htmlToDeploy, // ✅ deploy cleaned HTML
            },
          ],
          alias: [`${uniqueSlug}.ammoueai-sites.vercel.app`], // ensures unique URL
        }),
      }
    );

    const raw = await deployRes.text();
    console.log("VERCEL RAW RESPONSE:", raw);

    let deployment;
    try {
      deployment = JSON.parse(raw);
    } catch {
      return res.status(500).json({
        error: "Invalid Vercel response",
        raw,
      });
    }

    if (!deployRes.ok || !deployment.id || !deployment.url) {
      return res.status(500).json({
        error: "Vercel deployment failed to start",
        details: deployment,
      });
    }

    const deploymentUrl = `https://${deployment.url}`;

    // -------- SAVE TO FIRESTORE --------
    await projectRef.set(
      {
        deploymentUrl,
        deploymentId: deployment.id,
        deploymentStatus: deployment.readyState || "QUEUED",
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!isUpdate) {
      await incrementDeploymentCount(userId);
    }

    // -------- RESPONSE --------
    return res.status(200).json({
      deploymentId: deployment.id,
      deploymentUrl,
      status: deployment.readyState || "QUEUED",
      currentDeployments: isUpdate
        ? currentDeployments
        : currentDeployments + 1,
      maxDeployments,
    });
  } catch (err) {
    console.error("DEPLOY API ERROR:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
}
