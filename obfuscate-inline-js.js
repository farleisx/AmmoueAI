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
    renameGlobals: false, // Set to false so your Firebase 'db' and 'app' exports remain reachable
    target: "browser"
};

// 1. OBFUSCATE ALL JS FILES IN ROOT
const jsFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".js") && 
    !f.endsWith(".prod.js") && 
    f !== "obfuscate.js" && 
    f !== "obfuscate-inline-js.js"
);

console.log(`🚀 Processing ${jsFiles.length} JS files...`);

jsFiles.forEach(file => {
    const output = file.replace(".js", ".prod.js");
    let code = fs.readFileSync(file, "utf8");

    // FIX IMPORTS INSIDE JS FILES (e.g., bridge.js importing fire_prompt.js)
    code = code.replace(/(from\s+["'])\.\/([^"']+\.js)(["'])/gi, (match, before, fileName, after) => {
        return `${before}./${fileName.replace(".js", ".prod.js")}${after}`;
    });

    try {
        const obfuscated = JavaScriptObfuscator.obfuscate(code, JS_OPTIONS).getObfuscatedCode();
        fs.writeFileSync(output, obfuscated, "utf8");
        console.log(`   ✅ JS: ${file} → ${output}`);
    } catch (err) {
        console.error(`   ❌ Failed JS ${file}:`, err);
    }
});

// 2. OBFUSCATE HTML & UPDATE ALL ENTRY POINTS
const htmlFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".html") && 
    !f.endsWith(".prod.html")
);

console.log(`🚀 Processing ${htmlFiles.length} HTML files...`);

htmlFiles.forEach(file => {
    const output = file.replace(".html", ".prod.html");
    let html = fs.readFileSync(file, "utf8");

    // A. UPDATE SRC LINKS (e.g., <script src="bridge.js">)
    // This catches src="file.js", src="./file.js", and src='file.js'
    html = html.replace(/(src=["'])\.?\/?([^"']+\.js)(["'])/gi, (match, before, src, after) => {
        if (src.includes("//") || src.startsWith("http")) return match; // Skip external CDN links
        return `${before}./${src.replace(".js", ".prod.js")}${after}`;
    });

    // B. UPDATE INLINE IMPORTS (e.g., import { x } from "./fire_prompt.js")
    html = html.replace(/(from\s+["'])\.\/([^"']+\.js)(["'])/gi, (match, before, fileName, after) => {
        return `${before}./${fileName.replace(".js", ".prod.js")}${after}`;
    });

    // C. OBFUSCATE INLINE JS CODE
    // This finds <script>...</script> blocks, ignores those with 'src', and scrambles the code inside
    html = html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, js) => {
        // Skip scripts that are just remote loaders (have a src) or are empty
        if (attrs.includes('src=') || !js.trim()) return full;
        
        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(js, JS_OPTIONS).getObfuscatedCode();
            return `<script${attrs}>${obfuscated}</script>`;
        } catch (err) {
            console.warn(`      ⚠️  Skipped inline JS in ${file} (likely 3rd party or template)`);
            return full;
        }
    });

    fs.writeFileSync(output, html, "utf8");
    console.log(`   ✅ HTML: ${file} → ${output}`);
});

console.log("\n✨ Production Build Ready. Use the .prod.html files to test.");
