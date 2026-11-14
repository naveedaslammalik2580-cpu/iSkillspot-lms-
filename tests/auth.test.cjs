const test = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { SignJWT } = require('jose');
const { context } = require('./source-loader.cjs');
const env = { NODE_ENV: 'development', SESSION_SECRET: randomBytes(48).toString('hex') };
const c = context(null, env);
const passwords = c.load('src/lib/auth/password.ts');
const policy = c.load('src/lib/auth/account-policy.ts');
const tokens = c.load('src/lib/auth/token.ts');

test('bcrypt helper hashes with cost 12 and verifies only the correct password', async () => {
  const secret = randomBytes(24).toString('base64url');
  const hash = await passwords.hashPassword(secret);
  assert.ok(/^\$2[aby]\$12\$/.test(hash));
  assert.ok(await passwords.verifyPassword(secret, hash));
  assert.ok(!(await passwords.verifyPassword(randomBytes(24).toString('base64url'), hash)));
});
test('malformed and plaintext hashes fail closed', async () => {
  assert.equal(await passwords.verifyPassword('irrelevant-test-input', 'invalid-hash'), false);
});
test('password policy rejects short, weak and bcrypt-truncated values', () => {
  for (const value of ['short', 'abcdefghijklmnop', 'A'.repeat(73) + 'a7!', 'Aa7!' + 'é'.repeat(40)]) assert.equal(passwords.strongPassword.safeParse(value).success, false);
});
test('generated temporary credentials meet the policy and expire in 24 hours', () => {
  assert.equal(passwords.strongPassword.safeParse(passwords.generateTempPassword()).success, true);
  assert.ok(Math.abs(passwords.temporaryPasswordExpiry().getTime() - Date.now() - 86400000) < 1000);
});
test('manageable roles enforce the approved hierarchy', () => {
  assert.deepEqual(policy.manageableRoles('SUPER_ADMIN'), ['ADMIN','TEACHER','STUDENT']);
  assert.deepEqual(policy.manageableRoles('ADMIN'), ['TEACHER','STUDENT']);
  assert.deepEqual(policy.manageableRoles('TEACHER'), []);
  assert.deepEqual(policy.manageableRoles('STUDENT'), []);
});
test('only SUPER_ADMIN has administrator provisioning permission', () => {
  const p = c.load('src/lib/auth/permissions.ts');
  assert.ok(p.can('SUPER_ADMIN','admin.manage'));
  for (const role of ['ADMIN','TEACHER','STUDENT']) assert.equal(p.can(role,'admin.manage'), false);
});
test('token verifier rejects old tokens without a session version', async () => {
  const token = await new SignJWT({ userId:'test', username:'test', role:'ADMIN', mustChangePassword:false })
    .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(tokens.getSecret());
  await assert.rejects(tokens.verifyToken(token));
});
test('token verifier rejects forged, expired and malformed claims', async () => {
  for (const claims of [{role:'OWNER'}, {sessionVersion:-1}, {mustChangePassword:'false'}]) {
    const token = await new SignJWT({userId:'test', username:'test', role:'ADMIN', mustChangePassword:false, sessionVersion:0, ...claims})
      .setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(tokens.getSecret());
    await assert.rejects(tokens.verifyToken(token));
  }
  const forged = await new SignJWT({role:'ADMIN'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('1h').sign(randomBytes(48));
  await assert.rejects(tokens.verifyToken(forged));
  const expired = await new SignJWT({userId:'test',username:'test',role:'ADMIN',mustChangePassword:false,sessionVersion:0}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime(1).sign(tokens.getSecret());
  await assert.rejects(tokens.verifyToken(expired));
});
test('logout clears its cookie and redirects even when account validation is unavailable', async () => {
  const outage=context({user:{findUnique:async()=>{throw new Error('simulated database outage');}}},env);
  const session=outage.load('src/lib/auth/session.ts');
  await session.createSession({userId:'test',username:'test',role:'ADMIN',mustChangePassword:false,sessionVersion:0});
  await assert.rejects(outage.load('src/lib/actions/auth.ts').logoutAction(),error=>error.digest?.split(';')[2]==='/login');
  assert.equal(outage.jar.size,0);
});
