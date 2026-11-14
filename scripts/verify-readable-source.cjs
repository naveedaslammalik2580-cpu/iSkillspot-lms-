const fs = require("node:fs");
const path = require("node:path");
const cp = require("node:child_process");
const crypto = require("node:crypto");
const ts = require("typescript");
const files = [
  ...new Set(
    cp
      .execFileSync(
        "git",
        [
          "ls-files",
          "-z",
          "--cached",
          "--others",
          "--exclude-standard",
          "src",
          "tests",
          "scripts",
          "prisma",
          "docs",
          ".github",
        ],
        { encoding: "utf8" },
      )
      .split("\0")
      .filter(Boolean),
  ),
];
let count = 0;
for (const file of files) {
  if (
    !/\.(?:tsx?|[cm]?jsx?|prisma|sql|json|md|ya?ml)$/.test(file) ||
    !fs.statSync(file).isFile()
  )
    continue;
  const text = fs.readFileSync(file, "utf8"),
    compact = text.trim().replace(/\s/g, "");
  if (
    text.includes("\0") ||
    text.startsWith("<<<<<<< ") ||
    /^=======$/m.test(text) ||
    /^>>>>>>> /m.test(text)
  )
    throw new Error("Invalid text or unresolved merge conflict: " + file);
  if (compact.length > 200 && /^[A-Za-z0-9+/_=-]+$/.test(compact))
    throw new Error("Possible whole-file Base64 encoding: " + file);
  if (/\.(?:tsx?|[cm]?jsx?)$/.test(file)) {
    const kind = file.endsWith(".tsx")
      ? ts.ScriptKind.TSX
      : file.endsWith(".ts")
        ? ts.ScriptKind.TS
        : ts.ScriptKind.JS;
    if (
      ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind)
        .parseDiagnostics.length
    )
      throw new Error("Source syntax error: " + file);
  }
  count++;
}
const manifest = JSON.parse(
  fs.readFileSync("docs/deployment/migration-checksums.json", "utf8"),
);
for (const [name, expected] of Object.entries(manifest)) {
  const bytes = fs.readFileSync(
    path.join("prisma/migrations", name, "migration.sql"),
  );
  if (crypto.createHash("sha256").update(bytes).digest("hex") !== expected)
    throw new Error("Migration checksum mismatch: " + name);
}
console.log(
  `PASS: ${count} readable text/source files; no whole-file Base64, syntax errors or conflict markers; ${Object.keys(manifest).length} exact migration checksums.`,
);
