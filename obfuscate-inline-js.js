import fs from "fs";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

// --- CONFIGURATION ---
const JS_OPTIONS = {
    compact: true,
    controlFlowFlattening: false, 
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    rotateStringArray: true,
    renameGlobals: false, // Must stay false so your exports (like 'db') stay reachable
    target: "browser"
};

// 1. GET ALL JS FILES IN ROOT
const jsFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".js") && 
    !f.endsWith(".prod.js") && 
    f !== "obfuscate.js" && 
    f !== "obfuscate-inline-js.js"
);

console.log(`🚀 Obfuscating ${jsFiles.length} JS files and updating internal links...`);

jsFiles.forEach(file => {
    const output = file.replace(".js", ".prod.js");
    let code = fs.readFileSync(file, "utf8");

    /**
     * INTERNAL LINKER LOGIC:
     * This finds: import { x } from "./fire_prompt.js"
     * And changes it to: import { x } from "./fire_prompt.prod.js"
     * This works for 'import' and 'export ... from'
     */
    code = code.replace(/(from\s+["'])\.\/([^"']+\.js)(["'])/gi, (match, before, fileName, after) => {
        const newLink = before + "./" + fileName.replace(".js", ".prod.js") + after;
        return newLink;
    });

    try {
        const obfuscated = JavaScriptObfuscator.obfuscate(code, JS_OPTIONS).getObfuscatedCode();
        fs.writeFileSync(output, obfuscated, "utf8");
        console.log(`   ✅ JS Linked & Obfuscated: ${file} → ${output}`);
    } catch (err) {
        console.error(`   ❌ Failed ${file}:`, err);
    }
});

// 2. OBFUSCATE HTML & UPDATE ENTRY POINTS
const htmlFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".html") && 
    !f.endsWith(".prod.html")
);

console.log(`🚀 Updating ${htmlFiles.length} HTML entry points...`);

htmlFiles.forEach(file => {
    const output = file.replace(".html", ".prod.html");
    let html = fs.readFileSync(file, "utf8");

    // Update <script src="bridge.js"> to <script src="bridge.prod.js">
    html = html.replace(/<script([^>]+)src=["']\.\/([^"']+\.js)["']([^>]*)>/gi, (match, before, src, after) => {
        return `<script${before}src="./${src.replace(".js", ".prod.js")}"${after}>`;
    });
    
    // Catch cases without the "./"
    html = html.replace(/<script([^>]+)src=["']([^"'\.\/]+\.js)["']([^>]*)>/gi, (match, before, src, after) => {
        return `<script${before}src="${src.replace(".js", ".prod.js")}"${after}>`;
    });

    // Handle Inline Scripts (if any)
    html = html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, js) => {
        if (attrs.includes('src=') || !js.trim()) return full;
        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(js, JS_OPTIONS).getObfuscatedCode();
            return `<script${attrs}>${obfuscated}</script>`;
        } catch (err) { return full; }
    });

    fs.writeFileSync(output, html, "utf8");
    console.log(`   ✅ HTML: ${file} → ${output}`);
});

console.log("\n✨ Build Complete. All root-level connections are now secure.");
