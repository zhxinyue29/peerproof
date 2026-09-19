// Every t() key the app asks for, against every key the dictionaries have.
//
// The lookup falls back to printing the key itself when a translation is missing — deliberately,
// because "home.step1Title" on screen is a bug somebody reports and a blank line is not. But that
// only works if somebody looks. This is the looking, and it is cheap enough to run on every build.
//
// Reports four things:
//   MISSING  — used in code, absent from en.ts. These render as raw keys. Ship-blocking.
//   UNTRANSLATED — in en.ts, absent from zh.ts. (The type system catches these too, belt and braces.)
//   HARDCODED — English prose in a component, never passed through t() at all. Ship-blocking.
//   UNUSED   — in the dictionaries, referenced nowhere. Not a bug; just dead weight.
//
// HARDCODED exists because the first three checks all start from a t() call, so a sentence that
// never became a key is invisible to every one of them. This script reported OK on a tree with
// twenty-two English strings still on screen in Chinese — including every message the scanner shows
// when a scan fails, which is the one moment somebody is standing in a room needing to be told
// exactly what went wrong. "Every key is translated" was true and meant nothing.
//
// The test is deliberately crude: three or more ASCII words in a string literal or a run of JSX
// text. It is a lint, not a parser, so it has an explicit allowlist below for the handful of places
// English is correct — and a false positive costs one line there, while a false negative is a
// sentence a reader cannot read.
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
  for (const m of s.matchAll(/label:\s*"((?:nav|common)\.[\w.-]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(WEB + "/", ""));
  }
  // Keys that travel as values before something else calls t() on them: format.ts's error tables,
  // a `title` prop forwarded into Scanner, the step tuples in GateIntro. A bare dotted string
  // whose prefix is a real namespace is a key — nothing else in this codebase is spelled that way.
  //
  // Without this the unused list filled up with keys that are used, which is worse than not having
  // the list: every name on it has to be checked by hand before it can be believed, so nobody
  // checks any of them. It was reporting all nineteen contract-revert messages as dead.
  for (const m of s.matchAll(/"((?:nav|common|events|organizer|floor|venue|event|verify|home|identity|error|gate|scan|timeline|create|deploy|topup|myEvents|graph|lang|strip|scene|art|payout|registered|myEvents)\.[\w.-]+)"/g)) {
    if (!used.has(m[1])) used.set(m[1], []);
    used.get(m[1]).push(f.replace(WEB + "/", ""));
  }
}

/* ------------------------------------------------------------------ hardcoded English ------ */

/// Attributes and call sites whose string argument is never read by a person.
const NOT_COPY =
  /(?:className|class|href|src|id|key|name|type|viewBox|preserveAspectRatio|role|d|fill|stroke|style|path|to|from|rel|target|charSet|content|property|functionName|method|font(?:Family|Weight)?|data-[\w-]+|aria-(?:label|describedby|labelledby))\s*=\s*$/;

/// Places English is the right answer.
///
/// Each line is a reason, not an exemption: page metadata is read by crawlers rather than users,
/// developer tools never ship to a venue, and a chain's error name is the chain's word.
const ALLOWED = [
  /\/app\/layout\.tsx$/, // <title>/<meta description> — crawler-facing, single-language by design
  /\/lib\/dict\//, // the dictionaries themselves
  /\/lib\/abi\.ts$/,
  /\/lib\/directoryArtifact\.ts$/,
];

/// Lines carrying a string no attendee reads. The organizer's warp buttons are used by whoever is
/// holding the keyboard; a `throw new Error` is read in a stack trace by whoever is debugging. Both
/// are addressed to a developer, and a developer is not the person this check protects.
/// `super(...)` is in this list because every use of it in this codebase is an Error subclass whose
/// message is intercepted by an `instanceof` check before anything renders — the reader gets a
/// translated sentence chosen by the catch site, never this one.
const DEV_LINE =
  /\bDevBtn\b|\bdevMode\b|\bDev · |console\.(?:log|warn|error)|throw new (?:\w*)Error\(|new Error\(|\bsuper\(/;

/// Opt-out for a file whose English is load-bearing rather than copy.
///
/// Deliberately one marker, deliberately in the file itself, and deliberately requiring the words
/// to be written next to the code they excuse: the one place this is needed is the wallet
/// derivation message, where the signature over the exact English string is what the attest key is
/// derived from. Translating it would hand somebody a different account than the one holding their
/// deposit. A reviewer needs to meet that argument where the risk is, not in a list over here.
const EXEMPT_MARKER = "i18n-exempt-file:";

function stripComments(src) {
  let out = "";
  let i = 0;
  let inBlock = false;
  for (const line of src.split("\n")) {
    let l = line;
    if (inBlock) {
      const end = l.indexOf("*/");
      if (end === -1) {
        out += "\n";
        continue;
      }
      l = l.slice(end + 2);
      inBlock = false;
    }
    // Only a comment that opens a line, so a `//` inside a URL inside a string survives.
    if (/^\s*(?:\/\/|\/\*\*?|\*)/.test(l.trimStart()) && !/^\s*\*\//.test(l)) {
      if (/^\s*\/\*/.test(l) && !l.includes("*/")) inBlock = true;
      out += "\n";
      continue;
    }
    const open = l.indexOf("/*");
    if (open !== -1 && !l.includes("*/", open)) {
      l = l.slice(0, open);
      inBlock = true;
    }
    out += l + "\n";
  }
  return out;
}

/// Three or more words that are plainly English, with at least one of them a real lowercase word.
/// Tailwind class lists and enum values do not survive this: they have no spaces between words, or
/// no lowercase word longer than two letters once hyphens are counted as part of a token.
function looksEnglish(s) {
  const text = s.trim();
  if (text.length < 12) return false;
  if (/^[\w.-]+$/.test(text)) return false; // a key, a path, an identifier
  if (/[一-鿿]/.test(text)) return false; // already Chinese
  // Human-readable ABI. `event Attested(uint256 indexed eventId, …)` is the chain's own vocabulary,
  // and translating it would stop it parsing.
  if (/^(?:event|function|error|struct|constructor)\s+\w+\(/.test(text)) return false;
  const words = text.split(/\s+/).filter((w) => /^[A-Za-z][A-Za-z'’]*[.,!?;:]?$/.test(w));
  if (words.length < 3) return false;
  return words.some((w) => /^[a-z]{3,}/.test(w));
}

/// The English behind a key, for the stranded check below.
function enValue(key) {
  const src = readFileSync(join(WEB, "lib/dict/en.ts"), "utf8");
  const m = src.match(new RegExp('"' + key.replace(/\./g, "\\.") + '":\\s*\\n?\\s*"((?:[^"\\\\]|\\\\.)*)"'));
  return m ? m[1] : null;
}

/// Comment-stripped sources, kept so the stranded check can search the same text the hardcoded
/// check did — a key whose English only appears inside a comment is not a bug.
const sources = [];

const hardcoded = [];
for (const f of walk(join(WEB, "app")).concat(walk(join(WEB, "components")), walk(join(WEB, "lib")))) {
  const rel = f.replace(WEB + "/", "");
  if (ALLOWED.some((re) => re.test(f))) continue;
  const raw = readFileSync(f, "utf8");
  if (raw.includes(EXEMPT_MARKER)) continue;
  const src = stripComments(raw);
  sources.push([rel, src]);
  const lines = src.split("\n");

  lines.forEach((line, n) => {
    if (DEV_LINE.test(line)) return;

    // Double-quoted and backticked literals. Single quotes are skipped on purpose: they hold
    // apostrophes in this codebase far more often than they hold copy.
    for (const m of line.matchAll(/"([^"\\]{12,})"|`([^`\\$]{12,})`/g)) {
      const value = m[1] ?? m[2];
      const before = line.slice(0, m.index);
      if (NOT_COPY.test(before)) continue;
      if (/\bt\(\s*$/.test(before)) continue; // a key being looked up
      if (/\b(?:import|require|from)\b/.test(before)) continue;
      if (looksEnglish(value)) hardcoded.push({ rel, n: n + 1, value });
    }

    // Bare JSX text: `>Some words here<`, which no literal-matching pass can see.
    //
    // Only in .tsx, and only when the run holds nothing an expression would. `>` and `<` are also
    // comparison operators, and `if (a > b && c < d)` looked exactly like a JSX text node until
    // this — it reported `|| body === null) throw new Error(` as untranslated English.
    if (rel.endsWith(".tsx")) {
      for (const m of line.matchAll(/>([^<>{}"`()[\];=|&+*/\\]{12,})</g)) {
        if (looksEnglish(m[1])) hardcoded.push({ rel, n: n + 1, value: m[1].trim() });
      }
    }
  });
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
if (hardcoded.length) {
  console.log(`HARDCODED — English that never reaches a dictionary (${hardcoded.length}):`);
  for (const h of hardcoded) {
    const clipped = h.value.length > 68 ? h.value.slice(0, 65) + "…" : h.value;
    console.log(`  ${h.rel}:${h.n}  ${clipped}`);
  }
  console.log();
}
/// An unused key whose English is sitting in the source as a literal.
///
/// The strongest signal there is, and it was in this report all along as two separate lines nobody
/// joined up: `floor.refreshesIn` sat in the unused list while "refreshes in {n}s" was hardcoded
/// under the venue QR — translated, ready, and never reached, on the one screen a whole room looks
/// at. The prose check missed it too ("refreshes", "in", "9s" is two words by its reckoning), which
/// is why this cross-check is worth having on its own.
const stranded = [];
for (const k of unused) {
  const value = enValue(k);
  if (!value || value.length < 8) continue;
  // Compare on the fixed part, so a key with a placeholder still matches its literal.
  const stem = value.split(/\{\w+\}/)[0].trim();
  // Multi-word only. A single word is indistinguishable from part of an identifier: "Organizer"
  // matched inside the key `event.notByOrganizer` and reported a bug that was not there. A phrase
  // with a space in it cannot hide in camelCase.
  if (stem.length < 10 || !stem.includes(" ")) continue;
  for (const [f, src] of sources) {
    if (src.includes(stem)) {
      stranded.push({ k, f, stem });
      break;
    }
  }
}
if (stranded.length) {
  console.log(`STRANDED — translated, and hardcoded anyway (${stranded.length}):`);
  for (const s of stranded) console.log(`  ${s.k}  ← literal in ${s.f}: ${s.stem.slice(0, 50)}`);
  console.log();
}

if (unused.length) console.log(`unused (${unused.length}): ${unused.join(", ")}\n`);

if (missing.length || untranslated.length || hardcoded.length || stranded.length) {
  console.log("FAIL");
  process.exit(1);
}
console.log("OK — every key is defined and translated, and no English is left outside them.");
