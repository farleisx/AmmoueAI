import fs from "fs";
import JavaScriptObfuscator from "javascript-obfuscator";

const files = fs.readdirSync(".").filter(f => f.endsWith(".src.html"));

if (!files.length) {
  console.log("❌ No .src.html files found");
  process.exit(0);
}

files.forEach(file => {
  const outFile = file.replace(".src.html", ".html");
  let html = fs.readFileSync(file, "utf8");

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

  fs.writeFileSync(outFile, html);
  console.log(`✅ ${file} → ${outFile} (${count} scripts)`);
});
