import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const htmlFiles = fs
  .readdirSync(".")
  .filter(f => f.endsWith(".html") && !f.endsWith(".prod.html"));

if (!htmlFiles.length) {
  console.log("⚠️ No HTML files found");
  process.exit(0);
}

htmlFiles.forEach(file => {
  const output = file.replace(".html", ".prod.html");
  let html = fs.readFileSync(file, "utf8");
  let count = 0;

  html = html.replace(
    /<script([^>]*)>([\s\S]*?)<\/script>/gi,
    (full, attrs, js) => {
      if (!js.trim()) return full;

      const isModule = /type\s*=\s*["']module["']/i.test(attrs);

      const options = isModule
        ? {
            // 🧠 MODULE‑SAFE
            compact: true,
            renameGlobals: false,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            rotateStringArray: true,

            controlFlowFlattening: false,
            deadCodeInjection: false,
            selfDefending: false,
          }
        : {
            // 🔥 CLASSIC SCRIPT (STRONGER)
            compact: true,
            controlFlowFlattening: true,
            deadCodeInjection: true,
            stringArray: true,
            stringArrayEncoding: ["base64"],
            rotateStringArray: true,

            renameGlobals: false,
            selfDefending: false,
          };

      const obfuscated = JavaScriptObfuscator
        .obfuscate(js, options)
        .getObfuscatedCode();

      count++;
      return `<script${attrs}>${obfuscated}</script>`;
    }
  );

  fs.writeFileSync(output, html, "utf8");
  console.log(`✅ ${file} → ${output} (${count} scripts)`);
});
