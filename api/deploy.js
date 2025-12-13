// pages/api/deploy.js
import fetch from "node-fetch";
import { initializeApp, getApps } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import admin from "firebase-admin";

const PLAN_LIMITS = { free: 1, pro: 5 };

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_PROJECT = process.env.VERCEL_PROJECT_NAME;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID || null;

const APP_PROJECT_ID = "ammoueai";

// ---------- Firebase ----------
if (!getApps().length) {
  initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

const db = getFirestore();

// ---------- Helpers ----------
async function getDeploymentCount(userId) {
  const snap = await db.collection("deployments").doc(userId).get();
  return snap.exists ? snap.data().count : 0;
}

async function incrementDeploymentCount(userId) {
  await db.collection("deployments").doc(userId).set(
    { count: admin.firestore.FieldValue.increment(1) },
    { merge: true }
  );
}

// ---------- Handler ----------
export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { htmlContent, userId, plan, projectId } = req.body;

  if (!htmlContent || !userId || !plan || !projectId) {
    return res.status(400).json({ error: "Missing parameters" });
  }

  try {
    // ----- Plan limits and project check -----
    const maxDeployments = PLAN_LIMITS[plan] || 1;
    let currentDeployments = await getDeploymentCount(userId);

    const projectRef = db
      .collection("artifacts")
      .doc(APP_PROJECT_ID)
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

    // ----- Vercel Deploy Request -----
    const files = [
      {
        file: `users/${userId}/${projectId}/index.html`,
        data: htmlContent,
      },
    ];

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
          name: VERCEL_PROJECT,
          files,
          projectSettings: {
            framework: null,
            outputDirectory: ".",
          },
        }),
      }
    );

    const deployment = await deployRes.json();

    if (!deployment.url || !deployment.uid) { // Check for UID (Deployment ID)
      return res.status(500).json({
        error: "Vercel deployment failed to start",
        details: deployment,
      });
    }

    const deploymentUrl = `https://${deployment.url}`;

    // ----- Save (initial status and ID) -----
    await projectRef.set(
      {
        deploymentUrl,
        deploymentId: deployment.uid, // Save the ID for polling
        deploymentStatus: deployment.readyState, // Save initial status (QUEUED/BUILDING)
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    if (!isUpdate) {
      await incrementDeploymentCount(userId);
      currentDeployments++;
    }

    // ⭐ CRITICAL FIX: Return the deployment ID and Vercel's initial status
    return res.status(200).json({
      deploymentId: deployment.uid,
      deploymentUrl,
      status: deployment.readyState || 'QUEUED', // Send back the initial Vercel status
      currentDeployments,
      maxDeployments,
    });
  } catch (err) {
    console.error("Vercel deploy error:", err);
    return res.status(500).json({
      error: "Internal server error",
      details: err.message,
    });
  }
}
