import fs from "fs";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

// --- CONFIGURATION ---
const JS_OPTIONS = {
    compact: true,
    controlFlowFlattening: false, // Set to true for higher protection but slower performance
    deadCodeInjection: false,
    debugProtection: false,
    selfDefending: false,
    stringArray: true,
    stringArrayEncoding: ["base64"],
    rotateStringArray: true,
    renameGlobals: false, // Keep false to prevent breaking Firebase/Library exports
    target: "browser"
};

// 1. OBFUSCATE ALL STANDALONE JS FILES
const jsFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".js") && 
    !f.endsWith(".prod.js") && 
    f !== "obfuscate.js" // Don't obfuscate the build script itself
);

console.log(`🚀 Processing ${jsFiles.length} JS files...`);

jsFiles.forEach(file => {
    const output = file.replace(".js", ".prod.js");
    const code = fs.readFileSync(file, "utf8");
    
    try {
        const obfuscated = JavaScriptObfuscator.obfuscate(code, JS_OPTIONS).getObfuscatedCode();
        fs.writeFileSync(output, obfuscated, "utf8");
        console.log(`   ✅ JS: ${file} → ${output}`);
    } catch (err) {
        console.error(`   ❌ Failed to obfuscate ${file}:`, err);
    }
});

// 2. OBFUSCATE HTML (INLINE SCRIPTS + SRC MAPPING)
const htmlFiles = fs.readdirSync(".").filter(f => 
    f.endsWith(".html") && 
    !f.endsWith(".prod.html")
);

console.log(`🚀 Processing ${htmlFiles.length} HTML files...`);

htmlFiles.forEach(file => {
    const output = file.replace(".html", ".prod.html");
    let html = fs.readFileSync(file, "utf8");
    let inlineCount = 0;
    let srcCount = 0;

    // Handle <script src="..."> tags (Update references to .prod.js)
    html = html.replace(/<script([^>]+)src=["']([^"']+)["']([^>]*)>/gi, (full, before, src, after) => {
        if (src.endsWith(".js") && !src.startsWith("http") && !src.startsWith("//") && !src.includes("https://")) {
            const newSrc = src.replace(".js", ".prod.js");
            srcCount++;
            return `<script${before}src="${newSrc}"${after}>`;
        }
        return full;
    });

    // Handle Inline Scripts
    html = html.replace(/<script([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, js) => {
        // Skip if it's a script tag with a src (already handled above)
        if (attrs.includes('src=')) return full;
        if (!js.trim()) return full;

        try {
            const obfuscated = JavaScriptObfuscator.obfuscate(js, JS_OPTIONS).getObfuscatedCode();
            inlineCount++;
            return `<script${attrs}>${obfuscated}</script>`;
        } catch (err) {
            return full; 
        }
    });

    fs.writeFileSync(output, html, "utf8");
    console.log(`   ✅ HTML: ${file} → ${output} (${inlineCount} inline, ${srcCount} refs updated)`);
});

console.log("\n✨ Build Complete. Use the .prod.html files for deployment.");
