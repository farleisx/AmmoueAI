import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const INPUT = "index.html";
const OUTPUT = "index.prod.html";

if (!fs.existsSync(INPUT)) {
  console.error("❌ index.html not found");
  process.exit(1);
}

let html = fs.readFileSync(INPUT, "utf8");

let count = 0;

html = html.replace(
  /<script(?![^>]*src=)[^>]*>([\s\S]*?)<\/script>/gi,
  (full, js) => {
    if (!js.trim()) return full;

    const obfuscated = JavaScriptObfuscator.obfuscate(js, {
      compact: true,
      controlFlowFlattening: true,
      deadCodeInjection: true,
      stringArray: true,
      stringArrayEncoding: ["base64"],
      selfDefending: true,
    }).getObfuscatedCode();

    count++;
    return `<script>${obfuscated}</script>`;
  }
);

fs.writeFileSync(OUTPUT, html);
console.log(`✅ Obfuscated ${count} inline <script> blocks`);
