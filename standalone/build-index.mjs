import { build } from "esbuild";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const standaloneDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(standaloneDirectory, "..");

const result = await build({
  entryPoints: [resolve(standaloneDirectory, "entry.tsx")],
  bundle: true,
  define: {
    "process.env.NODE_ENV": '"production"',
  },
  format: "iife",
  jsx: "automatic",
  minify: true,
  platform: "browser",
  target: ["chrome100", "edge100", "firefox100", "safari15"],
  write: false,
});

const script =
  result.outputFiles.find((file) => file.path.endsWith(".js")) ??
  result.outputFiles[0];
if (!script) throw new Error("Bundle JavaScript não foi gerado.");

const sourceCss = await readFile(
  resolve(projectDirectory, "app", "globals.css"),
  "utf8",
);
const css = sourceCss.replace(/^@import\s+["']tailwindcss["'];?\s*/m, "");
const safeScript = script.text.replace(/<\/script/gi, "<\\/script");

const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Monte sua grade semanal, confira pré-requisitos e identifique conflitos de horário.">
  <title>Grade Horária 2026.2 | Engenharia de Computação</title>
  <script>
    (() => {
      try {
        const saved = localStorage.getItem("grade-uabj-theme");
        const preferred = matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light";
        document.documentElement.dataset.theme =
          saved === "dark" || saved === "light" ? saved : preferred;
      } catch {
        document.documentElement.dataset.theme = "light";
      }
    })();
  </script>
  <style>${css}</style>
</head>
<body>
  <div id="root"></div>
  <script>${safeScript}</script>
</body>
</html>
`;

await writeFile(resolve(projectDirectory, "index.html"), html, "utf8");
