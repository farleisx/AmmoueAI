import { db } from "./fire_prompt.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/12.4.0/firebase-firestore.js";

export async function downloadProjectFiles(projectId, userId) {
    if (!projectId || !userId) throw new Error("Missing Project ID or User ID");

    // JSZip is loaded via CDN in HTML
    const zip = new JSZip();
    const projectRef = doc(db, "artifacts", "ammoueai", "users", userId, "projects", projectId);
    const projectSnap = await getDoc(projectRef);

    if (!projectSnap.exists()) throw new Error("Project not found");

    const data = projectSnap.data();
    const pages = data.pages || {};
    const projectName = data.projectName || "my-ammoue-project";

    Object.entries(pages).forEach(([name, content]) => {
        const fileName = name === "landing" ? "index.html" : name;
        const fileContent = typeof content === 'string' ? content : (content.content || "");
        zip.file(fileName, fileContent);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${projectName}.zip`;
    a.click();
    window.URL.revokeObjectURL(url);
}

export function listProjectFiles(pages) {
    return Object.keys(pages).map(name => {
        return name === "landing" ? "index.html" : name;
    });
}
