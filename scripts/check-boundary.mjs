#!/usr/bin/env node
/**
 * The one hard boundary (UI spec 5.1).
 *
 * `sim/`, `structure/` (this codebase's solver), and everything they rest on are
 * deterministic, fixed-timestep and contain no DOM reference of any kind. They run headless.
 * The spec asks for a lint rule banning DOM and `window` imports from those directories;
 * this is that rule, as a check with no lint dependency behind it.
 *
 * It exists because determinism is a P0 hard requirement (spec 4.5) and because the point of
 * collecting tester blueprints is to batch-run them against the wave script later, without a
 * browser. A single `performance.now()` in the tick would end that.
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

/** Directories that must stay headless. */
const HEADLESS = [
  "src/core",
  "src/math",
  "src/materials",
  "src/blueprint",
  "src/structure",
  "src/path",
  "src/editor",
  "src/damage",
  "src/crew",
  "src/sim",
  "src/config",
  "src/persistence",
];

/** Directories allowed to touch the DOM: the renderer, the panels, and nothing else. */
const BROWSER = ["src/render", "src/ui"];

/**
 * Identifiers that only exist in a browser, plus the two clocks. Wall-clock time is banned
 * from the headless core for the same reason `Math.random` is: a tick that can tell how
 * long it took is a tick that can produce a different answer on a slower machine.
 */
const BANNED = [
  "document",
  "window",
  "navigator",
  "localStorage",
  "sessionStorage",
  "requestAnimationFrame",
  "HTMLElement",
  "HTMLCanvasElement",
  "CanvasRenderingContext2D",
  "performance.now",
  "Date.now",
  "new Date",
  "Math.random",
  "fetch(",
  "URL.createObjectURL",
];

/** Imports the headless core may never make, whatever they are called. */
const BANNED_IMPORTS = ["../render/", "../ui/", "../telemetry/", "./render/", "./ui/"];

function walk(dir) {
  const found = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      found.push(...walk(full));
    } else if (entry.endsWith(".ts")) {
      found.push(full);
    }
  }
  return found;
}

function checkHeadless(file, problems) {
  const text = readFileSync(file, "utf8");
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const code = line.replace(/\/\/.*$/, "");
    if (code.trim().startsWith("*") || code.trim().startsWith("/*")) {
      continue;
    }
    for (const banned of BANNED) {
      if (code.includes(banned)) {
        problems.push(`${file}:${i + 1}: headless code may not use \`${banned}\``);
      }
    }
    if (code.includes("import ")) {
      for (const banned of BANNED_IMPORTS) {
        if (code.includes(banned)) {
          problems.push(`${file}:${i + 1}: headless code may not import from \`${banned}\``);
        }
      }
    }
  }
}

const problems = [];
let checked = 0;
for (const dir of HEADLESS) {
  for (const file of walk(dir)) {
    checkHeadless(file.split(sep).join("/"), problems);
    checked++;
  }
}

// The browser side is not checked for DOM use -- that is its job -- but it is checked for
// the inverse mistake: a layer reaching into a simulation to mutate it. The renderer reads
// `Readonly<SimState>` and never writes to it (UI spec 5.1).
const WRITE_PATTERNS = [
  /\.structure\s*\.\s*destroy\(/,
  /\.structure\s*\.\s*applyDamage\(/,
  /\.structure\s*\.\s*severJoint\(/,
  /\.structure\s*\.\s*restore\(/,
];
for (const dir of BROWSER) {
  for (const file of walk(dir)) {
    const relativeName = relative(".", file).split(sep).join("/");
    // PredictAnalysis is the one place that mutates, and it mutates a clone.
    if (relativeName.endsWith("PredictAnalysis.ts")) {
      continue;
    }
    const text = readFileSync(file, "utf8");
    const lines = text.split("\n");
    for (let i = 0; i < lines.length; i++) {
      for (const pattern of WRITE_PATTERNS) {
        if (pattern.test(lines[i])) {
          problems.push(`${relativeName}:${i + 1}: the renderer must not mutate sim state`);
        }
      }
    }
    checked++;
  }
}

if (problems.length > 0) {
  console.error("boundary check failed:\n");
  for (const problem of problems) {
    console.error("  " + problem);
  }
  console.error(`\n${problems.length} problem(s) in ${checked} file(s).`);
  process.exit(1);
}

console.log(`boundary check passed: ${checked} file(s), no DOM or wall clock in the headless core.`);
