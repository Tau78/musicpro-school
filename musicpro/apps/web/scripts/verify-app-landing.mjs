#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const html = readFileSync(join(root, "public/musicproschoolapp.html"), "utf8");
const errors = [];

for (const snippet of [
  "https://school.musicproeventi.it/musicproschoolapp.html",
  "https://school.musicproeventi.it/app-landing/og-square.jpg",
  "eventi.musicproeventi.it/musicproschoolapp.html",
]) {
  const shouldHave = !snippet.startsWith("eventi.");
  const has = html.includes(snippet);
  if (shouldHave && !has) errors.push(`manca ${snippet}`);
  if (!shouldHave && has) errors.push(`ancora sul dominio Eventi: ${snippet}`);
}

if (errors.length) {
  console.error("FAIL landing School");
  for (const err of errors) console.error(`  - ${err}`);
  process.exit(1);
}
console.log("OK: landing School punta a school.musicproeventi.it");
