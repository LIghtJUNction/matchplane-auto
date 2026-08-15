import { mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

await rm("dist", { recursive: true, force: true });
await mkdir("dist/assets", { recursive: true });

const result = await Bun.build({
  entrypoints: ["src/plugin-entry.tsx"],
  outdir: "dist/assets",
  target: "browser",
  splitting: false,
  minify: true,
  naming: "[name]-[hash].[ext]",
});
if (!result.success) {
  console.error(result.logs);
  process.exit(1);
}

const files = await readdir("dist/assets");
const script = files.find((file) => file.endsWith(".js"));
const stylesheet = files.find((file) => file.endsWith(".css"));
if (!script) throw new Error("plugin build did not emit a browser script");
const links = stylesheet ? `\n    <link rel="stylesheet" href="./assets/${stylesheet}">` : "";
const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">${links}
  </head>
  <body><div id="root"></div><script type="module" src="./assets/${script}"></script></body>
</html>
`;
await Bun.write("dist/index.html", html);
console.log(`built static plugin ${path.join("dist", "index.html")}`);
