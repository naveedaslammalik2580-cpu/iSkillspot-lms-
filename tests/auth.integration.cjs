// Real Prisma + disposable PostgreSQL. No mocked account, password or JWT logic.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { PrismaClient } = require('@prisma/client');
const { context } = require('./source-loader.cjs');
const url = new URL(process.env.DATABASE_URL || 'http://invalid');
if (process.env.AUTH_TEST_ISOLATED !== '1' || url.hostname !== '127.0.0.1' || !url.pathname.startsWith('/iskillspot_auth_test_')) {
  console.error('Refused: integration tests require a runner-created disposable local database.'); process.exit(1);
}
const db = new PrismaClient({log:[]});
const operator = context(db);
const bootstrap = operator.load('src/lib/auth/bootstrap.ts');
const pw = operator.load('src/lib/auth/password.ts');
const password = () => 'Aa7!' + randomBytes(20).toString('hex');
let step = 'initialization';
let passed = 0;
async function check(name, work) { step = name; await work(); passed++; console.log('PASS:',name); }
async function redirect(promise, target) { await assert.rejects(promise, error => error.digest?.split(';')[2] === target); }
function form(values) { const data = new FormData(); for (const [k,v] of Object.entries(values)) data.set(k,String(v)); return data; }
async function login(c, identifier, secret, target, remember=false) {
  await redirect(c.load('src/lib/actions/auth.ts').loginAction({},form({identifier,password:secret,...(remember?{remember:'on'}:{})})),target);
  return c.load('src/lib/auth/session.ts').getSession();
}
async function change(c, old, next, target) {
  await redirect(c.load('src/lib/actions/auth.ts').changePasswordAction({},form({currentPassword:old,newPassword:next,confirmPassword:next})),target);
}
async function freePort() { const s=net.createServer(); await new Promise(r=>s.listen(0,'127.0.0.1',r)); const p=s.address().port; await new Promise(r=>s.close(r)); return p; }
async function launchChromium(chromium) {
  // Prefer Edge where it is installed (the maintainer's machine); then
  // Playwright's bundled Chromium; finally any locally cached Chromium build
  // (a sandbox's browser cache may not match this Playwright version).
  try { return await chromium.launch({channel:'msedge',headless:true}); } catch {}
  try { return await chromium.launch({headless:true}); } catch {}
  const cache=path.join(process.env.HOME||'','.cache','ms-playwright');
  if (fs.existsSync(cache)) {
    for (const dir of fs.readdirSync(cache).filter(d=>d.startsWith('chromium-')).sort().reverse()) {
      for (const sub of ['chrome-linux64/chrome','chrome-linux/chrome']) {
        const exe=path.join(cache,dir,sub);
        if (fs.existsSync(exe)) return await chromium.launch({executablePath:exe,headless:true});
      }
    }
  }
  return await chromium.launch({headless:true});
}

async function browserChecks(accounts) {
  const {chromium}=require('playwright');
  const port=await freePort();
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--port',String(port),'--hostname','127.0.0.1'],
    {cwd:require('node:path').resolve(__dirname,'..'),env:{...process.env,NODE_ENV:'production'},windowsHide:true,stdio:['ignore','pipe','pipe']});
  // Do not emit server errors/requests that could contain credentials.
  let serverErrors=0; server.stderr.on('data',()=>{serverErrors++;}); server.stdout.resume();
  let browser;
  try {
    const origin=`http://localhost:${port}`;
    let ready=false;
    for(let i=0;i<80;i++) {
      try { if((await fetch(origin+'/login')).status===200){ready=true;break;} }catch{}
      await new Promise(r=>setTimeout(r,250));
    }
    assert.ok(ready);
    browser=await launchChromium(chromium);
    const bc=await browser.newContext(); const page=await bc.newPage(); let browserErrors=0;
    page.on('pageerror',()=>{browserErrors++;});
    async function browserLogin(identifier,secret,target) {
      await page.goto(origin+'/login'); await page.locator('#identifier').fill(identifier); await page.locator('#password').fill(secret);
      await page.getByRole('button',{name:'Sign in',exact:true}).click();
      await page.waitForURL(origin+target,{timeout:30000});
    }
    async function browserLogout() {
      // Exercise the actual existing logout form through its server action.
      await page.getByRole('button',{name:'Logout',exact:true}).click();
      await page.waitForURL(origin+'/login');
      assert.ok(!(await bc.cookies()).some(c=>c.name==='isp_session'));
    }
    await check('browser SUPER_ADMIN login, persisted reload, and User Accounts UI',async()=>{
      await browserLogin(accounts.super.username,accounts.super.password,'/admin/dashboard');
      await page.reload(); assert.equal(new URL(page.url()).pathname,'/admin/dashboard');
      await page.goto(origin+'/admin/accounts'); await page.getByRole('heading',{name:'User Accounts',exact:true}).waitFor();
      await page.getByRole('heading',{name:'Create administrator'}).waitFor();
      assert.equal(await page.locator('input[name="passwordHash"]').count(),0);
    });
    let temp;
    await check('browser SUPER_ADMIN creates ADMIN through the actual server action',async()=>{
      await page.locator('#admin-username').fill('browser.admin'); await page.locator('#admin-email').fill('browser.admin@example.invalid');
      await page.getByRole('button',{name:'Create ADMIN',exact:true}).click();
      const credential=page.getByLabel('One-time temporary password'); await credential.waitFor(); temp=await credential.inputValue();
      assert.ok(temp.length>=12); assert.equal((await db.user.findUnique({where:{username:'browser.admin'}})).role,'ADMIN');
    });
    await check('browser logout clears session',async()=>{await browserLogout();});
    await check('browser ADMIN temporary-password login is direct and administrator UI restrictions apply',async()=>{
      // No forced password change: a temporary password lands on the dashboard.
      await browserLogin('browser.admin',temp,'/admin/dashboard');
      await page.goto(origin+'/admin/accounts'); await page.getByRole('heading',{name:'User Accounts',exact:true}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'Create administrator'}).count(),0);
      assert.equal(await page.locator('tbody tr').filter({hasText:'browser.admin'}).count(),0);
      await browserLogout();
    });
    await check('browser STUDENT landing, persistence, voluntary password change and forbidden staff routes',async()=>{
      const account=accounts.student; const target='/student/courses';
      await browserLogin(account.username,account.password,target); await page.reload(); assert.equal(new URL(page.url()).pathname,target);
      await page.goto(origin+'/admin/accounts'); await page.waitForURL(origin+'/forbidden');
      await page.goto(origin+'/admin/dashboard'); await page.waitForURL(origin+'/forbidden');
      // Password change is voluntary and lives in the student portal.
      const next=password();
      await page.goto(origin+'/student/change-password');
      await page.locator('#currentPassword').fill(account.password); await page.locator('#newPassword').fill(next); await page.locator('#confirmPassword').fill(next);
      await page.getByRole('button',{name:'Save new password'}).click(); await page.waitForURL(origin+target);
      account.password=next;
      await browserLogout();
      await browserLogin(account.username,account.password,target); await browserLogout();
    });
    assert.equal(browserErrors,0); assert.equal(serverErrors,0);
    await bc.close();
  } finally { if(browser) await browser.close(); server.kill(); }
}

(async()=>{
  const initial=password(), superPassword=password(); const sa=context(db), admin=context(db), student=context(db);
  let su, au, stu, adminTemp, studentTemp, studentProfile;
  const adminPassword=password(), studentPassword=password();
  try {
    await check('first SUPER_ADMIN bootstrap is concurrency-safe and idempotent',async()=>{
      const input={username:'isolated.super',email:'isolated.super@example.invalid',password:initial};
      const result=await Promise.all([bootstrap.bootstrapSuperAdmin(db,input),bootstrap.bootstrapSuperAdmin(db,input)]);
      assert.equal(result.filter(r=>r.created).length,1); assert.equal(await db.user.count({where:{role:'SUPER_ADMIN'}}),1);
      assert.equal(await db.accountBootstrap.count(),1); assert.equal((await bootstrap.inspectBootstrap(db)).superAdminExists,true);
      su=await db.user.findUnique({where:{username:input.username}}); const before=su.passwordHash;
      assert.equal((await bootstrap.bootstrapSuperAdmin(db,{...input,password:password()})).created,false);
      assert.ok((await db.user.findUnique({where:{id:su.id}})).passwordHash===before);
    });
    await check('SUPER_ADMIN login is direct; the must-change flag is bookkeeping and a voluntary change clears it',async()=>{
      // Mandatory password change was removed: the bootstrap flag neither
      // diverts the login nor blocks the session. Changing the password is
      // voluntary and clears the flag.
      const session=await login(sa,su.username,initial,'/admin/dashboard');
      assert.equal(session.mustChangePassword,true);
      await change(sa,initial,superPassword,'/admin/dashboard'); assert.equal((await sa.load('src/lib/auth/session.ts').getSession()).mustChangePassword,false);
    });
    await check('SUPER_ADMIN creates canonical ADMIN with secure temporary credentials',async()=>{
      const result=await sa.load('src/lib/actions/accounts.ts').createAdminAction({username:' Local.Admin ',email:'LOCAL.ADMIN@EXAMPLE.INVALID'});
      assert.equal(result.ok,true); adminTemp=result.tempPassword; au=await db.user.findUnique({where:{username:'local.admin'}});
      assert.equal(au.role,'ADMIN'); assert.equal(au.status,'ACTIVE'); assert.equal(au.mustChangePassword,true);
      assert.ok(au.passwordExpiresAt>Date.now()); assert.ok(await pw.verifyPassword(adminTemp,au.passwordHash));
    });
    await check('duplicate identities and SUPER_ADMIN role injection are rejected without overwriting users',async()=>{
      assert.equal((await sa.load('src/lib/actions/accounts.ts').createAdminAction({username:'LOCAL.ADMIN',email:'another@example.invalid'})).ok,false);
      assert.equal((await sa.load('src/lib/actions/accounts.ts').createAdminAction({username:'injected',email:'injected@example.invalid',role:'SUPER_ADMIN'})).ok,false);
      assert.equal(await db.user.count({where:{role:'SUPER_ADMIN'}}),1);
    });
    await check('ADMIN login with temporary password is direct; voluntary password change invalidates its earlier token',async()=>{
      await login(admin,au.email,adminTemp,'/admin/dashboard'); const old=admin.jar.get('isp_session');
      await change(admin,adminTemp,adminPassword,'/admin/dashboard'); const current=admin.jar.get('isp_session');
      admin.jar.set('isp_session',old); assert.equal(await admin.load('src/lib/auth/session.ts').getSession(),null); admin.jar.set('isp_session',current);
    });
    await check('ADMIN cannot create, reset, deactivate or manage administrator/SUPER_ADMIN accounts',async()=>{
      const actions=admin.load('src/lib/actions/accounts.ts');
      await redirect(actions.createAdminAction({username:'no.admin',email:'no@example.invalid'}),'/forbidden');
      for(const id of [su.id,au.id]) { assert.equal((await actions.resetAccountAction(id)).ok,false); assert.equal((await actions.setAccountActiveAction(id,false)).ok,false); }
      const rows=(await admin.load('src/lib/data/accounts.ts').listAccounts()).rows; assert.equal(rows.length,0);
    });
    await check('teacher role and provisioning workflow no longer exist',async()=>{
      // Agency model: there is no teacher role, actions module or profile.
      assert.equal(fs.existsSync(path.resolve(__dirname,'..','src/lib/actions/teachers.ts')),false);
      await assert.rejects(db.user.create({data:{username:'no.teacher',email:'no.teacher@example.invalid',passwordHash:await pw.hashPassword(password()),role:'TEACHER'}}));
      assert.equal(await db.user.count({where:{username:'no.teacher'}}),0);
    });
    await check('ADMIN creates STUDENT, linked profile and enrollment through existing workflow',async()=>{
      const course=await db.course.create({data:{title:'Isolated Course',slug:'isolated-course'}});
      const batch=await db.batch.create({data:{name:'Isolated Batch',code:'ISOLATED-1',courseId:course.id}});
      const result=await admin.load('src/lib/actions/students.ts').createStudentAction(form({fullName:'Isolated Student',email:'student@example.invalid',courseId:course.id,batchId:batch.id}));
      assert.equal(result.ok,true); studentTemp=result.tempPassword; studentProfile=await db.student.findUnique({where:{id:result.id}});
      stu=await db.user.findUnique({where:{id:studentProfile.userId}}); assert.equal(stu.role,'STUDENT'); assert.equal(await db.enrollment.count({where:{studentId:studentProfile.id}}),1);
    });
    await check('STUDENT valid login goes straight to My Courses; voluntary password change works',async()=>{
      await login(student,studentProfile.studentId.toLowerCase(),studentTemp,'/student/courses');
      await change(student,studentTemp,studentPassword,'/student/courses');
    });
    await check('supported username, case-insensitive email and student ID identifiers work',async()=>{
      for(const identifier of [stu.username,' STUDENT@EXAMPLE.INVALID ',studentProfile.studentId]) await login(student,identifier,studentPassword,'/student/courses');
    });
    await check('invalid password and missing account return the same generic error',async()=>{
      for(const identifier of [stu.username,'missing@example.invalid']) {
        const c=context(db); const result=await c.load('src/lib/actions/auth.ts').loginAction({},form({identifier,password:password()}));
        assert.equal(result.error,'Invalid credentials.'); assert.equal(c.jar.size,0);
      }
    });
    await check('STUDENT direct account reads and actions cannot bypass permissions',async()=>{
      await redirect(student.load('src/lib/data/accounts.ts').listAccounts(),'/forbidden');
      await redirect(student.load('src/lib/actions/accounts.ts').resetAccountAction(au.id),'/forbidden');
      await redirect(student.load('src/lib/actions/students.ts').createStudentAction(form({fullName:'Blocked',email:'blocked@example.invalid',courseId:'blocked',batchId:'blocked'})),'/forbidden');
    });
    await check('deactivation invalidates existing sessions and blocks login; activation restores access',async()=>{
      assert.equal((await admin.load('src/lib/actions/accounts.ts').setAccountActiveAction(stu.id,false)).ok,true);
      assert.equal(await student.load('src/lib/auth/session.ts').getSession(),null);
      assert.equal((await context(db).load('src/lib/actions/auth.ts').loginAction({},form({identifier:stu.email,password:studentPassword}))).error,'Invalid credentials.');
      assert.equal((await admin.load('src/lib/actions/accounts.ts').setAccountActiveAction(stu.id,true)).ok,true);
      await login(student,stu.username,studentPassword,'/student/courses');
    });
    await check('password reset revokes sessions, rejects old password and issues a working temporary password',async()=>{
      const result=await admin.load('src/lib/actions/accounts.ts').resetAccountAction(stu.id); assert.equal(result.ok,true);
      assert.equal(await student.load('src/lib/auth/session.ts').getSession(),null);
      assert.equal((await context(db).load('src/lib/actions/auth.ts').loginAction({},form({identifier:stu.email,password:studentPassword}))).error,'Invalid credentials.');
      await login(student,stu.email,result.tempPassword,'/student/courses'); await change(student,result.tempPassword,studentPassword,'/student/courses');
    });
    await check('expired temporary passwords and sessions are rejected',async()=>{
      const result=await admin.load('src/lib/actions/students.ts').resetStudentPasswordAction(studentProfile.id); assert.equal(result.ok,true);
      await login(student,stu.username,result.tempPassword,'/student/courses');
      await db.user.update({where:{id:stu.id},data:{passwordExpiresAt:new Date(Date.now()-1000)}});
      assert.equal(await student.load('src/lib/auth/session.ts').getSession(),null);
      const c=context(db); assert.equal((await c.load('src/lib/actions/auth.ts').loginAction({},form({identifier:stu.email,password:result.tempPassword}))).error,'Invalid credentials.');
      const renewed=await admin.load('src/lib/actions/students.ts').resetStudentPasswordAction(studentProfile.id);
      await login(student,stu.email,renewed.tempPassword,'/student/courses'); await change(student,renewed.tempPassword,studentPassword,'/student/courses');
    });
    await check('operator role changes revoke sessions through the database trigger',async()=>{
      const before=await db.user.findUnique({where:{id:stu.id}});
      await db.user.update({where:{id:stu.id},data:{role:'ADMIN'}});
      assert.equal(await student.load('src/lib/auth/session.ts').getSession(),null);
      assert.ok((await db.user.findUnique({where:{id:stu.id}})).sessionVersion>before.sessionVersion);
      // An ADMIN cannot reset another ADMIN's account.
      assert.equal((await admin.load('src/lib/actions/accounts.ts').resetAccountAction(stu.id)).ok,false);
      await db.user.update({where:{id:stu.id},data:{role:'STUDENT'}});
    });
    await check('throttling is shared and enforced atomically across independent request contexts',async()=>{
      const identifier='throttle-'+randomBytes(8).toString('hex');
      const results=await Promise.all(Array.from({length:10},()=>context(db).load('src/lib/auth/throttle.ts').rateLimited(identifier)));
      assert.equal(results.filter(Boolean).length,2);
    });
    await check('account creation and its audit entry roll back together on failure',async()=>{
      // Real transaction, intentionally abort after creation; no mock DB writes.
      const count=await db.user.count(); const logCount=await db.auditLog.count();
      await db.$executeRawUnsafe(`CREATE FUNCTION public.auth_test_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN IF NEW.action='Created administrator' AND EXISTS(SELECT 1 FROM "User" WHERE id=NEW."entityId" AND username='rollback.fixture') THEN
          RAISE EXCEPTION 'isolated test audit failure'; END IF; RETURN NEW; END; $$`);
      await db.$executeRawUnsafe(`CREATE TRIGGER auth_test_reject_audit BEFORE INSERT ON "AuditLog" FOR EACH ROW EXECUTE FUNCTION public.auth_test_reject_audit()`);
      const result=await sa.load('src/lib/actions/accounts.ts').createAdminAction({username:'rollback.fixture',email:'rollback@example.invalid'});
      assert.equal(result.ok,false);
      assert.equal(await db.user.count(),count);
      assert.equal(await db.auditLog.count(),logCount);
    });
    await check('audit records exist for creation, resets, status and password changes without secrets',async()=>{
      const logs=await db.auditLog.findMany();
      for(const action of ['Bootstrapped initial SUPER_ADMIN','Created administrator','Created student','Reset account password','Deactivated account','Password changed','Login failed']) assert.ok(logs.some(l=>l.action===action));
      assert.ok(!logs.some(l=>/passwordHash|tempPassword|isp_session/.test(l.metadata||'')));
    });
    // Throttle test login counts are deliberately limited. Clear only expired
    // fixture throttle rows using normal expiry before browser login scenarios.
    await db.authThrottle.updateMany({data:{expiresAt:new Date(Date.now()-1000)}});
    await browserChecks({super:{username:su.username,password:superPassword},student:{username:stu.username,password:studentPassword}});
    console.log('Integration/browser checks passed:',passed);
  } catch(error) {
    console.error('FAILED:',step,'(error type:',error.name,', code:',error.code||'not available',')'); process.exitCode=1;
  } finally { await db.$disconnect(); }
})();
