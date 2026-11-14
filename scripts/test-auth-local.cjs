// Creates its OWN password-protected local cluster. Prisma/Next may parse .env,
// but explicit local DB variables prevail. Never connects to an existing cluster.
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
    // pg_ctl's detached server can inherit a pipe; wait for the command's exit,
    // not for every daemon descendant to close that pipe.
    p.on('exit', code => code === 0 ? resolve(captured) : reject(new Error('Local test command failed: ' + path.basename(exe) + ' (exit ' + code + ')')));
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
    for (const key of Object.keys(env)) if (/SUPABASE|BOOTSTRAP/.test(key)) env[key] = '';
    for (const key of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SUPABASE_STORAGE_BUCKET']) env[key] = '';
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
    console.log('Testing the manual SQL + migration-history workflow on a second disposable database...');
    const manualDatabase = database + '_manual';
    await run(path.join(bin,'createdb.exe'), [manualDatabase], env);
    const manualUrl = new URL(url); manualUrl.pathname = '/' + manualDatabase;
    const manualEnv = { ...env, DATABASE_URL:manualUrl.href, DIRECT_URL:manualUrl.href, PGDATABASE:manualDatabase };
    const manualPrisma = path.join(work,'manual-prisma');
    fs.mkdirSync(path.join(manualPrisma,'migrations'),{recursive:true});
    fs.copyFileSync(path.join(root,'prisma/schema.prisma'),path.join(manualPrisma,'schema.prisma'));
    for (const entry of fs.readdirSync(path.join(root,'prisma/migrations'))) {
      if (entry !== '20261113120000_auth_account_lifecycle') fs.cpSync(path.join(root,'prisma/migrations',entry),path.join(manualPrisma,'migrations',entry),{recursive:true});
    }
    await run(process.execPath,['node_modules/prisma/build/index.js','migrate','deploy','--schema',path.join(manualPrisma,'schema.prisma')],manualEnv,true);
    const verifyLegacyData = await require('../tests/manual-migration.fixture.cjs').prepare(manualUrl.href);
    for (const file of ['docs/sql/01-auth-preflight.sql','prisma/migrations/20261113120000_auth_account_lifecycle/migration.sql','docs/sql/03-auth-postflight.sql','docs/sql/04-auth-reconcile-history.sql','docs/sql/04-auth-reconcile-history.sql']) {
      await run(path.join(bin,'psql.exe'),['-X','-v','ON_ERROR_STOP=1','-f',path.join(root,file)],manualEnv);
    }
    await verifyLegacyData();
    const manualStatus=await run(process.execPath,['node_modules/prisma/build/index.js','migrate','status'],manualEnv);
    if (!manualStatus.includes('up to date')) throw new Error('Manual migration history did not reconcile');
    console.log('PASS: preflight, manual migration, postflight and idempotent history reconciliation; Prisma reports up to date.');
    console.log('PASS: existing fixture accounts, hashes, roles, profiles, fees, payments and certificates survived the additive migration.');
    await run(process.execPath, ['node_modules/prisma/build/index.js','validate'], env, true);
    console.log('Building application against the isolated database...');
    const npmCli = process.env.npm_execpath || path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
    await run(process.execPath, [npmCli,'run','build'], {...env,NODE_ENV:'production'},true);
    await run(process.execPath, ['--test','tests/auth.test.cjs'], env,true);
    console.log('Running real Prisma account lifecycle and local browser integration tests...');
    await run(process.execPath, ['tests/auth.integration.cjs'], {...env,NODE_ENV:'production'},true);
    const inspect = await run(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/bootstrap-super-admin.ts','--inspect'],env);
    if (!/superAdminExists:\s*true/.test(inspect)) throw new Error('Bootstrap CLI inspection failed');
    const refused = await run(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/bootstrap-super-admin.ts','--create','--confirm-project',database],env);
    if (!refused.includes('Nothing changed')) throw new Error('Bootstrap CLI did not refuse an existing SUPER_ADMIN');
    console.log('PASS: real operator CLI inspection and refusal to overwrite the existing SUPER_ADMIN.');
    console.log('All isolated authentication checks completed. No shared database was used.');
  } catch (error) {
    console.error('Isolated verification failed:', error.message);
    process.exitCode = 1;
  } finally {
    if (fs.existsSync(path.join(work,'password'))) fs.unlinkSync(path.join(work,'password'));
    if (started) {
      try { await run(path.join(bin,'pg_ctl.exe'), ['-D',data,'-m','fast','-w','stop'], process.env); console.log('Disposable PostgreSQL stopped.'); }
      catch { console.error('Could not stop the disposable cluster; inspect only the test instance.'); }
    }
    // Retain the stopped cluster for inspection; never recursively delete computed paths.
  }
})();
