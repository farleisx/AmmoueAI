import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const files = fs
  .readdirSync(".")
  .filter(f => f.endsWith(".html") && !f.endsWith(".prod.html"));

files.forEach(file => {
  const out = file.replace(".html", ".prod.html");
  let html = fs.readFileSync(file, "utf8");
  let count = 0;

  html = html.replace(
    /<script\s+type=["']module["']>([\s\S]*?)<\/script>/gi,
    (full, js) => {
      if (!js.trim()) return full;

      const obf = JavaScriptObfuscator.obfuscate(js, {
        compact: true,

        // ✅ MODULE-SAFE OPTIONS ONLY
        renameGlobals: false,
        stringArray: true,
        stringArrayEncoding: ["base64"],
        rotateStringArray: true,

        // ❌ THESE BREAK MODULES
        controlFlowFlattening: false,
        deadCodeInjection: false,
        selfDefending: false,
      }).getObfuscatedCode();

      count++;
      return `<script type="module">${obf}</script>`;
    }
  );

  fs.writeFileSync(out, html);
  console.log(`✅ ${file} → ${out} (${count} module scripts)`);
});
