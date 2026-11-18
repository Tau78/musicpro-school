import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const base64Mod = join(
  webRoot,
  "src/lib/last-minute/digest-assets-base64.ts",
);
const assetsDir = join(webRoot, "src/lib/last-minute/assets");

test("LM digest runtime usa moduli base64 (no fs su Vercel)", () => {
  assert.ok(existsSync(base64Mod), "digest-assets-base64.ts");
  const src = readFileSync(base64Mod, "utf8");
  for (const name of [
    "LM_DIGEST_BG_BASE64",
    "FONT_MONTSERRAT_BOLD_BASE64",
    "FONT_MONTSERRAT_EXTRABOLD_BASE64",
    "FONT_BEBAS_NEUE_BASE64",
  ]) {
    assert.ok(src.includes(`export const ${name}`), name);
  }
  // Sorgenti binarie tenute per rigenerare il modulo.
  assert.ok(existsSync(join(assetsDir, "lm-digest-bg.jpg")), "bg jpg");
});

test("last-minute-digest-image importa i base64", () => {
  const img = readFileSync(
    join(webRoot, "src/lib/last-minute-digest-image.tsx"),
    "utf8",
  );
  assert.ok(img.includes("digest-assets-base64"));
  assert.ok(!img.includes("readFileSync"));
});
