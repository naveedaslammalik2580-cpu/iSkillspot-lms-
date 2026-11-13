// Creates its OWN password-protected local cluster. Never loads .env, never
// connects to an existing cluster, never resets/seeds/drops a shared database.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const net = require('node:net');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const bin = process.env.PG_BIN || 'C:/Program Files/PostgreSQL/18/bin';
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'iskillspot-auth-test-'));
const data = path.join(work, 'cluster');
let started = false;
async function run(exe, args, env, output = false) {
  return new Promise((resolve, reject) => {
    const p = spawn(exe, args, { cwd: root, env, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
    let captured = '';
    p.stdout.on('data', chunk => { captured += chunk; if (output) process.stdout.write(chunk); });
    p.stderr.on('data', chunk => { captured += chunk; });
    p.on('error', () => reject(new Error('Local test executable unavailable')));
    p.on('close', code => code === 0 ? resolve(captured) : reject(new Error('Local test command failed: ' + path.basename(exe) + ' (exit ' + code + ')')));
  });
}
async function freePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const port = server.address().port;
  await new Promise(resolve => server.close(resolve));
  return port;
}
(async () => {
  try {
    const port = await freePort();
    const password = randomBytes(32).toString('hex');
    const database = 'iskillspot_auth_test_' + randomBytes(6).toString('hex');
    const url = `postgresql://auth_test_operator:${password}@127.0.0.1:${port}/${database}?connection_limit=5`;
    const env = { ...process.env, DATABASE_URL: url, DIRECT_URL: url, SESSION_SECRET: randomBytes(48).toString('hex'),
      LMS_BUILD_DIR: '.next-auth-test', AUTH_TEST_ISOLATED: '1', PGHOST:'127.0.0.1', PGPORT:String(port), PGUSER:'auth_test_operator', PGPASSWORD:password,
      PGDATABASE:database, NODE_ENV:'test' };
    // Do not inherit provider keys into tests or the browser server.
    for (const key of Object.keys(env)) if (/SUPABASE|BOOTSTRAP/.test(key)) delete env[key];
    fs.writeFileSync(path.join(work,'password'), password + '\n', {mode:0o600});
    console.log('Initializing a disposable password-protected PostgreSQL cluster...');
    await run(path.join(bin,'initdb.exe'), ['-D',data,'-U','auth_test_operator','--auth=scram-sha-256','--pwfile',path.join(work,'password'),'--encoding=UTF8','--locale=C'], env);
    fs.unlinkSync(path.join(work,'password'));
    await run(path.join(bin,'pg_ctl.exe'), ['-D',data,'-l',path.join(work,'postgres.log'),'-o',`-p ${port} -h 127.0.0.1`,'-w','start'],env);
    started = true;
    await run(path.join(bin,'createdb.exe'), [database], env);
    const parsed = new URL(env.DATABASE_URL);
    if (parsed.hostname !== '127.0.0.1' || !parsed.pathname.startsWith('/iskillspot_auth_test_')) throw new Error('Isolation guard rejected the database');
    console.log('Applying versioned migrations ONLY to the new isolated cluster...');
    await run(process.execPath, ['node_modules/prisma/build/index.js','migrate','deploy'], env, true);
    await run(process.execPath, ['node_modules/prisma/build/index.js','validate'], env, true);
    console.log('Building application against the isolated database...');
    await run(process.execPath, ['scripts/prisma-generate.cjs'], env, true);
    await run(process.execPath, ['node_modules/next/dist/bin/next','build'], {...env,NODE_ENV:'production'},true);
    await run(process.execPath, ['--test','tests/auth.test.cjs'], env,true);
    console.log('Running real Prisma account lifecycle and local browser integration tests...');
    await run(process.execPath, ['tests/auth.integration.cjs'], {...env,NODE_ENV:'production'},true);
    console.log('All isolated authentication checks completed. No shared database was used.');
  } catch (error) {
    console.error('Isolated verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (started) {
      try { await run(path.join(bin,'pg_ctl.exe'), ['-D',data,'-m','fast','-w','stop'], process.env); console.log('Disposable PostgreSQL stopped.'); }
      catch { console.error('Could not stop the disposable cluster; inspect only the test instance.'); }
    }
    // Retain the stopped cluster for inspection; never recursively delete computed paths.
  }
})();
