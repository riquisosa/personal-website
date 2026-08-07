#!/usr/bin/env node
/**
 * check-no-hardcoded-colors.mjs
 *
 * Exhaustive backstop for the "no hardcoded colors" rule.
 *
 * stylelint-declaration-strict-value (see .stylelintrc.json) catches most
 * cases, but it only inspects properties whose *entire* value it owns —
 * it does not look inside shorthand values like `background: linear-gradient(rgba(...))`
 * or `text-shadow: 0 1px 2px rgba(...)`. This script closes that gap by
 * scanning raw file text for any color literal (#hex, rgb(), rgba(), hsl(),
 * hsla()) in every .css and .astro file, with no awareness of CSS property
 * structure at all — which is exactly why it can't be fooled by shorthand.
 *
 * tokens.css is the one legitimate place color literals are defined and is
 * excluded. Everything else must reference a var(--...) token.
 */
import { readFileSync } from 'node:fs';
import { globSync } from 'node:fs';
import path from 'node:path';

const COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/g;
const EXCLUDED_FILES = ['tokens.css'];
const TARGET_GLOBS = ['src/**/*.css', 'src/**/*.astro'];

function collectFiles() {
  const files = [];
  for (const pattern of TARGET_GLOBS) {
    files.push(...globSync(pattern));
  }
  return files.filter((f) => !EXCLUDED_FILES.some((excluded) => f.endsWith(excluded)));
}

function checkFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const hits = [];

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;

    // Explicit, visible escape hatch for non-color uses of color syntax
    // (e.g. mask-image luminance masks, which use #000/transparent to mean
    // "fully opaque" / "fully transparent", not a rendered color). This must
    // be written on the same line so it shows up in code review — never add
    // silent exceptions elsewhere in this script.
    if (trimmed.includes('color-check-ignore')) return;

    const matches = line.match(COLOR_PATTERN);
    if (matches) {
      hits.push({ line: index + 1, matches, text: trimmed });
    }
  });

  return hits;
}

const files = collectFiles();
let totalHits = 0;

for (const file of files) {
  const hits = checkFile(file);
  if (hits.length > 0) {
    console.log(`\n${path.relative(process.cwd(), file)}`);
    for (const hit of hits) {
      console.log(`  ${hit.line}: ${hit.matches.join(', ')}`);
      console.log(`     ${hit.text}`);
    }
    totalHits += hits.length;
  }
}

if (totalHits > 0) {
  console.log(`\n✗ ${totalHits} hardcoded color value(s) found outside tokens.css.`);
  console.log('  Replace with a var(--token) reference, or add a narrow, documented');
  console.log('  exception to EXCLUDED_FILES in this script if the literal is genuinely');
  console.log('  required (e.g. a third-party theme object).\n');
  process.exit(1);
} else {
  console.log('✓ No hardcoded color values found outside tokens.css.');
  process.exit(0);
}
