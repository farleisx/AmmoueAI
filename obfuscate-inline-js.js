import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const HTML_FILE = "index.html";

if (!fs.existsSync(HTML_FILE)) {
  console.error("❌ index.html not found");
  process.exit(1);
}

let html = fs.readFileSync(HTML_FILE, "utf8");

let count = 0;

html = html.replace(
  /<script>([\s\S]*?)<\/script>/g,
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

fs.writeFileSync(HTML_FILE, html);
console.log(`✅ Obfuscated ${count} inline <script> blocks`);
