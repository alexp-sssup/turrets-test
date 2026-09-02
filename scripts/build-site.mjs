/**
 * Builds the static site published to GitHub Pages.
 *
 * P0 is headless, so "the build" has nothing a browser can run. What it does have is an
 * answer: the harness in `src/app/main.ts` prints the heatmap, the replay and the
 * validation report. This captures that run verbatim and puts it next to the docs, so the
 * three questions P0 exists to answer are readable without cloning anything.
 *
 * Inputs:  dist/src/app/main.js (compiled by `npm run build`), README.md, docs/*.md
 * Output:  dist-site/
 */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = join(ROOT, "dist-site");
const HARNESS = join(ROOT, "dist", "src", "app", "main.js");

/** Pages in nav order. `href` is relative to the site root. */
const DOCS = readdirSync(join(ROOT, "docs"))
  .filter((name) => name.endsWith(".md"))
  .sort()
  .map((name) => ({
    source: join("docs", name),
    href: "docs/" + name.replace(/\.md$/, ".html"),
  }));

const NAV = [
  { href: "index.html", label: "Overview" },
  { href: "demo.html", label: "Demo report" },
  ...DOCS.map((doc) => ({ href: doc.href, label: navLabelOf(titleOf(read(doc.source))) })),
];

function read(relative) {
  return readFileSync(join(ROOT, relative), "utf8");
}

/** The first `# ` heading, which is what every markdown file here starts with. */
function titleOf(markdown) {
  const match = /^#\s+(.+)$/m.exec(markdown);
  return match ? match[1].trim() : "Turrets";
}

/** Nav has no room for a title's subtitle, so drop everything after the dash. */
function navLabelOf(title) {
  return title.split(/\s+(?:--|[\u2013\u2014])\s+/)[0];
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * Rewrites links between markdown files to the pages they become. The sources link to
 * each other as `docs/architecture.md`, and the site mirrors that layout, so only the
 * extension changes.
 */
function relinkMarkdown(html) {
  return html.replace(
    /href="(?!https?:|\/|#)([^"]+)\.md(#[^"]*)?"/g,
    (_match, path, fragment) => `href="${path}.html${fragment ?? ""}"`,
  );
}

/** `depth` is how many directories deep the page sits, so nav links resolve. */
function page({ title, body, depth = 0 }) {
  const prefix = "../".repeat(depth);
  const nav = NAV.map(
    (item) => `<a href="${prefix}${item.href}">${escapeHtml(item.label)}</a>`,
  ).join("\n      ");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <link rel="stylesheet" href="${prefix}style.css" />
  </head>
  <body>
    <nav>
      ${nav}
    </nav>
    <main>
${body}
    </main>
  </body>
</html>
`;
}

const STYLE = `:root {
  color-scheme: light dark;
  --bg: #fbfaf8;
  --fg: #1c1a17;
  --muted: #6a655d;
  --rule: #ddd8ce;
  --code-bg: #f2efe9;
  --link: #7a4a12;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #171614;
    --fg: #e6e2da;
    --muted: #9a9488;
    --rule: #34312c;
    --code-bg: #201e1b;
    --link: #d9a566;
  }
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--bg);
  color: var(--fg);
  font: 16px/1.6 ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
}
nav {
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--rule);
  font-size: 0.9rem;
}
nav a { color: var(--muted); text-decoration: none; }
nav a:hover { color: var(--link); }
main {
  max-width: 52rem;
  margin: 0 auto;
  padding: 2rem 1.5rem 6rem;
}
h1, h2, h3 { line-height: 1.25; }
h1 { font-size: 1.9rem; margin-top: 1rem; }
h2 { margin-top: 2.5rem; border-bottom: 1px solid var(--rule); padding-bottom: 0.3rem; }
a { color: var(--link); }
code {
  background: var(--code-bg);
  padding: 0.1em 0.35em;
  border-radius: 3px;
  font-size: 0.9em;
}
pre {
  background: var(--code-bg);
  border: 1px solid var(--rule);
  border-radius: 5px;
  padding: 1rem;
  overflow-x: auto;
}
pre code { background: none; padding: 0; }
pre, code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }
table { border-collapse: collapse; display: block; overflow-x: auto; }
th, td { border: 1px solid var(--rule); padding: 0.4rem 0.7rem; text-align: left; }
blockquote {
  margin: 1rem 0;
  padding-left: 1rem;
  border-left: 3px solid var(--rule);
  color: var(--muted);
}
.note { color: var(--muted); font-size: 0.9rem; }
`;

function build() {
  rmSync(OUT, { recursive: true, force: true });
  mkdirSync(join(OUT, "docs"), { recursive: true });
  writeFileSync(join(OUT, "style.css"), STYLE);

  const readme = read("README.md");
  writeFileSync(
    join(OUT, "index.html"),
    page({ title: titleOf(readme), body: relinkMarkdown(marked.parse(readme)) }),
  );

  for (const doc of DOCS) {
    const markdown = read(doc.source);
    writeFileSync(
      join(OUT, doc.href),
      page({
        title: titleOf(markdown),
        body: relinkMarkdown(marked.parse(markdown)),
        depth: 1,
      }),
    );
  }

  // The harness is the site's reason to exist, so a failing run must fail the build
  // rather than publish a page that quietly says nothing.
  process.stdout.write("running the harness...\n");
  const report = execFileSync(process.execPath, [HARNESS], {
    encoding: "utf8",
    maxBuffer: 32 * 1024 * 1024,
  });
  const stamp = new Date().toISOString().replace("T", " ").slice(0, 16) + " UTC";
  writeFileSync(
    join(OUT, "demo.html"),
    page({
      title: "Demo report -- Turrets P0",
      body:
        `      <h1>Demo report</h1>\n` +
        `      <p class="note">Verbatim output of <code>npm run demo</code>, ` +
        `generated ${stamp}.</p>\n` +
        `      <pre><code>${escapeHtml(report)}</code></pre>`,
    }),
  );

  process.stdout.write(`site written to ${OUT}\n`);
}

build();
