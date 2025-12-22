import fs from "fs";
import path from "path";
import JavaScriptObfuscator from "javascript-obfuscator";

const files = fs
  .readdirSync(".")
  .filter(f => f.endsWith(".src.html"));

if (files.length === 0) {
  console.log("⚠️ No .src.html files found");
  process.exit(0);
}

let totalScripts = 0;

for (const file of files) {
  const inputPath = path.resolve(file);
  const outputPath = path.resolve(file.replace(".src.html", ".html"));

  let html = fs.readFileSync(inputPath, "utf8");
  let count = 0;

  html = html.replace(
    /<script>([\s\S]*?)<\/script>/g,
    (full, jsCode) => {
      if (!jsCode.trim()) return full;

      const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, {
        compact: true,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        stringArrayThreshold: 0.7,

        // 🔒 SAFE SETTINGS (buttons + DOM survive)
        renameGlobals: false,
        controlFlowFlattening: false,
        deadCodeInjection: false,
        selfDefending: false,
      }).getObfuscatedCode();

      count++;
      return `<script>${obfuscated}</script>`;
    }
  );

  fs.writeFileSync(outputPath, html, "utf8");
  totalScripts += count;

  console.log(`✅ ${file} → ${path.basename(outputPath)} (${count} script(s))`);
}

console.log(`🔥 Done. Obfuscated ${totalScripts} script blocks total.`);
