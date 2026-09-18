// Every t() key the app asks for, against every key the dictionaries have.
//
// The lookup falls back to printing the key itself when a translation is missing — deliberately,
// because "home.step1Title" on screen is a bug somebody reports and a blank line is not. But that
// only works if somebody looks. This is the looking, and it is cheap enough to run on every build.
//
// Reports three things:
//   MISSING  — used in code, absent from en.ts. These render as raw keys. Ship-blocking.
//   UNTRANSLATED — in en.ts, absent from zh.ts. (The type system catches these too, belt and braces.)
//   UNUSED   — in the dictionaries, referenced nowhere. Not a bug; just dead weight.
//
//   node scripts/i18n-audit.mjs
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "../web");

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === ".next" || name === "out") continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(tsx?|jsx?)$/.test(p)) out.push(p);
  }
  return out;
}

function dictKeys(file) {
  const s = readFileSync(join(WEB, "lib/dict", file), "utf8");
  return new Set([...s.matchAll(/^\s*"([\w.-]+)":/gm)].map((m) => m[1]));
}

const en = dictKeys("en.ts");
const zh = dictKeys("zh.ts");

// `t("x")` and `t(`x`)`, plus the label fields that hold keys rather than words.
const used = new Map();
for (const f of walk(join(WEB, "app")).concat(walk(join(WEB, "components")), walk(join(WEB, "lib")))) {
  if (f.includes("/lib/dict/")) continue;
  const s = readFileSync(f, "utf8");
  for (const m of s.matchAll(/\bt\(\s*["'`]([\w.-]+)["'`]/g)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(WEB + "/", ""));
  }
  // format.ts carries keys in `{ key, en }` pairs rather than calling t() — they are used, and a
  // report that calls them unused teaches people to skim past the unused list. Scoped to that
  // one file: elsewhere `key:` is React's list key and matching it invents nav items.
  if (f.endsWith("lib/format.ts")) for (const m of s.matchAll(/\bkey:\s*"([\w.-]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(WEB + "/", ""));
  }
  for (const m of s.matchAll(/label:\s*"((?:nav|common)\.[\w.-]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(WEB + "/", ""));
  }
}

const missing = [...used.keys()].filter((k) => !en.has(k)).sort();
const untranslated = [...en].filter((k) => !zh.has(k)).sort();
const unused = [...en].filter((k) => !used.has(k)).sort();

console.log(`${used.size} keys used · ${en.size} in en.ts · ${zh.size} in zh.ts\n`);

if (missing.length) {
  console.log(`MISSING — these render as raw keys on screen (${missing.length}):`);
  for (const k of missing) console.log(`  ${k}   ← ${[...new Set(used.get(k))].join(", ")}`);
  console.log();
}
if (untranslated.length) {
  console.log(`UNTRANSLATED — in English only (${untranslated.length}):`);
  for (const k of untranslated) console.log(`  ${k}`);
  console.log();
}
if (unused.length) console.log(`unused (${unused.length}): ${unused.join(", ")}\n`);

if (missing.length || untranslated.length) {
  console.log("FAIL");
  process.exit(1);
}
console.log("OK — every key used is defined, and every English key has Chinese.");
