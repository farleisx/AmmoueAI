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

// Obfuscate ONLY inline <script> blocks
html = html.replace(
  /<script>([\s\S]*?)<\/script>/g,
  (fullMatch, jsCode) => {
    if (!jsCode.trim()) return fullMatch;

    const obfuscated = JavaScriptObfuscator.obfuscate(jsCode, {
      compact: true,

      // SAFE + EFFECTIVE
      stringArray: true,
      stringArrayEncoding: ["base64"],
      stringArrayThreshold: 0.75,

      // Prevent DOM / library breakage
      renameGlobals: false,

      // ❌ DO NOT USE (breaks buttons/events)
      controlFlowFlattening: false,
      deadCodeInjection: false,
      selfDefending: false,

      // Optional extra confusion (safe)
      simplify: true,
      numbersToExpressions: true,
    }).getObfuscatedCode();

    count++;
    return `<script>${obfuscated}</script>`;
  }
);

fs.writeFileSync(OUTPUT_HTML, html, "utf8");

console.log(`✅ Obfuscated ${count} inline <script> block(s)`);
console.log(`📦 Output: ${OUTPUT_HTML}`);
