import fs from "fs";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

const files = fs
  .readdirSync(".")
  .filter(f => f.endsWith(".html") && !f.endsWith(".prod.html"));

if (files.length === 0) {
  console.log("⚠️ No HTML files found to obfuscate");
  process.exit(0);
}

files.forEach(file => {
  const input = file;
  const output = file.replace(".html", ".prod.html");

  let html = fs.readFileSync(input, "utf8");
  let count = 0;

  html = html.replace(
    /<script>([\s\S]*?)<\/script>/g,
    (full, jsCode) => {
      if (!jsCode.trim()) return full;

      const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.75,

        // ✅ SAFETY FLAGS
        renameGlobals: false,
        rotateStringArray: true,

        // ❌ MUST STAY OFF
        controlFlowFlattening: false,
        deadCodeInjection: false,
        selfDefending: false,
      }).getObfuscatedCode();

      count++;
      return `<script>${obfuscated}</script>`;
    }
  );

  fs.writeFileSync(output, html, "utf8");
  console.log(`✅ ${input} → ${output} (${count} script block(s))`);
});
