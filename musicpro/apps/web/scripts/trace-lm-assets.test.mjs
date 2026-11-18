import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const webRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const workspaceRoot = join(webRoot, "../../..");
const config = readFileSync(join(webRoot, "next.config.ts"), "utf8");
const glob = createRequire(join(webRoot, "package.json"))(
  "next/dist/compiled/glob",
);

const patterns = [
  "docs/assets/school/lm-digest-bg.jpg",
  "docs/assets/school/fonts/**/*",
];

test("next.config include gli asset LM dalla tracing root del repo", () => {
  for (const pattern of patterns) {
    assert.ok(config.includes(pattern), pattern);
    const hits = glob.sync(pattern, {
      cwd: workspaceRoot,
      nodir: true,
      dot: true,
    });
    assert.ok(hits.length >= 1, `${pattern} non risolve dalla repo root`);
  }
  const fonts = glob.sync("docs/assets/school/fonts/**/*.ttf", {
    cwd: workspaceRoot,
    nodir: true,
  });
  for (const name of [
    "Montserrat-Bold.ttf",
    "Montserrat-ExtraBold.ttf",
    "BebasNeue-Regular.ttf",
  ]) {
    assert.ok(
      fonts.some((file) => file.endsWith(name)),
      name,
    );
  }
});
