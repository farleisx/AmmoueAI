import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const INPUT_HTML = "index.html";
const OUTPUT_HTML = "index.prod.html";

if (!fs.existsSync(INPUT_HTML)) {
  console.error("❌ index.html not found");
  process.exit(1);
}

let html = fs.readFileSync(INPUT_HTML, "utf8");
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

      // ❌ Critical: keep global JS identifiers intact to preserve event bindings
      renameGlobals: false,
      rotateStringArray: true,

      // ❌ Avoid these: break buttons and DOM events
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,
    }).getObfuscatedCode();

    count++;
    return `<script>${obfuscated}</script>`;
  }
);

fs.writeFileSync(OUTPUT_HTML, html, "utf8");
console.log(`✅ Obfuscated ${count} inline <script> block(s)`);
console.log(`📦 Output: ${OUTPUT_HTML}`);
