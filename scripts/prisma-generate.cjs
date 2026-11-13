// Windows-safe generation: preserve a locked engine only if its bytes match.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'node_modules/prisma/build/index.js');
function generate(schema) { return spawnSync(process.execPath, [cli, 'generate', '--schema', schema], { cwd: root, encoding: 'utf8', windowsHide: true }); }
const normal = generate('prisma/schema.prisma');
if (normal.status === 0) { console.log('Prisma client generated.'); process.exit(0); }
if (process.platform !== 'win32' || !/EPERM/.test(normal.stderr + normal.stdout)) {
  console.error('Prisma generation failed. Check schema validation and local tooling.'); process.exit(1);
}
const stage = path.join(root, '.auth-work', 'prisma-stage');
fs.mkdirSync(stage, { recursive: true });
const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8')
  .replace('provider = "prisma-client-js"', 'provider = "prisma-client-js"\n  output = "./client"');
fs.writeFileSync(path.join(stage, 'schema.prisma'), schema);
const fallback = generate(path.join(stage, 'schema.prisma'));
if (fallback.status !== 0) { console.error('Staged Prisma generation failed. No processes were terminated.'); process.exit(1); }
const source = path.join(stage, 'client');
const target = path.join(root, 'node_modules/.prisma/client');
const engine = 'query_engine-windows.dll.node';
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
if (!fs.existsSync(path.join(target, engine)) || digest(path.join(source, engine)) !== digest(path.join(target, engine))) {
  console.error('Locked Prisma engine differs from the required engine. Stop only your own app before retrying generation.'); process.exit(1);
}
for (const entry of fs.readdirSync(source)) {
  if (entry !== engine) fs.cpSync(path.join(source, entry), path.join(target, entry), { recursive: true });
}
console.log('Prisma client generated using an identical existing Windows engine; no processes terminated.');
