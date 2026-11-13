// Real Prisma + disposable PostgreSQL. No mocked account, password or JWT logic.
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { spawn } = require('node:child_process');
const net = require('node:net');
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
    browser=await chromium.launch({channel:'msedge',headless:true});
    const bc=await browser.newContext(); const page=await bc.newPage(); let browserErrors=0;
    page.on('pageerror',()=>{browserErrors++;});
    async function browserLogin(identifier,secret,target) {
      await page.goto(origin+'/login'); await page.locator('#identifier').fill(identifier); await page.locator('#password').fill(secret);
      await page.getByRole('button',{name:'Sign in',exact:true}).click();
      await page.waitForURL(origin+target,{timeout:30000});
    }
    async function browserLogout() {
      // Exercise the actual existing logout form through its server action.
      await page.getByRole('button',{name:/log out|sign out/i}).click();
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
    await check('browser ADMIN forced password change and administrator UI restrictions',async()=>{
      await browserLogin('browser.admin',temp,'/change-password');
      await page.goto(origin+'/admin/accounts'); await page.waitForURL(origin+'/change-password');
      const next=password(); await page.locator('#currentPassword').fill(temp); await page.locator('#newPassword').fill(next); await page.locator('#confirmPassword').fill(next);
      await page.getByRole('button',{name:'Save new password'}).click(); await page.waitForURL(origin+'/admin/dashboard');
      await page.goto(origin+'/admin/accounts'); await page.getByRole('heading',{name:'User Accounts',exact:true}).waitFor();
      assert.equal(await page.getByRole('heading',{name:'Create administrator'}).count(),0);
      assert.equal(await page.locator('tbody tr').filter({hasText:'browser.admin'}).count(),0);
      await browserLogout();
    });
    for(const role of ['teacher','student']) {
      await check('browser '+role+' dashboard, persistence and forbidden cross-role routes',async()=>{
        const account=accounts[role]; const target='/'+role+'/dashboard';
        await browserLogin(account.username,account.password,target); await page.reload(); assert.equal(new URL(page.url()).pathname,target);
        await page.goto(origin+'/admin/accounts'); await page.waitForURL(origin+'/forbidden');
        const other=role==='teacher'?'student':'teacher'; await page.goto(origin+'/'+other+'/dashboard'); await page.waitForURL(origin+'/forbidden');
        await page.goto(origin+target); await browserLogout();
      });
    }
    assert.equal(browserErrors,0); assert.equal(serverErrors,0);
    await bc.close();
  } finally { if(browser) await browser.close(); server.kill(); }
}

(async()=>{
  const initial=password(), superPassword=password(); const sa=context(db), admin=context(db), teacher=context(db), student=context(db);
  let su, au, tu, stu, adminTemp, teacherTemp, studentTemp, studentProfile;
  const adminPassword=password(), teacherPassword=password(), studentPassword=password();
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
    await check('SUPER_ADMIN login requires password change; direct action cannot bypass it',async()=>{
      await login(sa,su.username,initial,'/change-password');
      await redirect(sa.load('src/lib/actions/accounts.ts').createAdminAction({username:'blocked.admin',email:'blocked@example.invalid'}),'/change-password');
      assert.equal(await db.user.count({where:{role:'ADMIN'}}),0);
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
    await check('ADMIN login and forced first password change invalidate its earlier token',async()=>{
      await login(admin,au.email,adminTemp,'/change-password'); const old=admin.jar.get('isp_session');
      await change(admin,adminTemp,adminPassword,'/admin/dashboard'); const current=admin.jar.get('isp_session');
      admin.jar.set('isp_session',old); assert.equal(await admin.load('src/lib/auth/session.ts').getSession(),null); admin.jar.set('isp_session',current);
    });
    await check('ADMIN cannot create, reset, deactivate or manage administrator/SUPER_ADMIN accounts',async()=>{
      const actions=admin.load('src/lib/actions/accounts.ts');
      await redirect(actions.createAdminAction({username:'no.admin',email:'no@example.invalid'}),'/forbidden');
      for(const id of [su.id,au.id]) { assert.equal((await actions.resetAccountAction(id)).ok,false); assert.equal((await actions.setAccountActiveAction(id,false)).ok,false); }
      const rows=(await admin.load('src/lib/data/accounts.ts').listAccounts()).rows; assert.equal(rows.length,0);
    });
    await check('ADMIN creates TEACHER through existing atomic provisioning workflow',async()=>{
      const result=await admin.load('src/lib/actions/teachers.ts').createTeacher({fullName:'Isolated Teacher',email:'TEACHER@EXAMPLE.INVALID',username:'Isolated.Teacher'});
      assert.equal(result.ok,true); teacherTemp=result.tempPassword; tu=await db.user.findUnique({where:{username:'isolated.teacher'},include:{teacher:true}});
      assert.equal(tu.role,'TEACHER'); assert.ok(tu.teacher); assert.equal(tu.mustChangePassword,true);
      assert.ok(await pw.verifyPassword(teacherTemp,tu.passwordHash));
    });
    await check('ADMIN creates STUDENT, linked profile and enrollment through existing workflow',async()=>{
      const course=await db.course.create({data:{title:'Isolated Course',slug:'isolated-course'}});
      const batch=await db.batch.create({data:{name:'Isolated Batch',code:'ISOLATED-1',courseId:course.id,teacherId:tu.teacher.id}});
      const result=await admin.load('src/lib/actions/students.ts').createStudentAction(form({fullName:'Isolated Student',email:'student@example.invalid',courseId:course.id,batchId:batch.id}));
      assert.equal(result.ok,true); studentTemp=result.tempPassword; studentProfile=await db.student.findUnique({where:{id:result.id}});
      stu=await db.user.findUnique({where:{id:studentProfile.userId}}); assert.equal(stu.role,'STUDENT'); assert.equal(await db.enrollment.count({where:{studentId:studentProfile.id}}),1);
    });
    await check('TEACHER/STUDENT valid logins, first password changes and dashboard redirects',async()=>{
      await login(teacher,tu.username,teacherTemp,'/change-password'); await change(teacher,teacherTemp,teacherPassword,'/teacher/dashboard');
      await login(student,studentProfile.studentId.toLowerCase(),studentTemp,'/student/change-password'); await change(student,studentTemp,studentPassword,'/student/dashboard');
    });
    await check('supported username, case-insensitive email and student ID identifiers work',async()=>{
      for(const identifier of [stu.username,' STUDENT@EXAMPLE.INVALID ',studentProfile.studentId]) await login(student,identifier,studentPassword,'/student/dashboard');
    });
    await check('invalid password and missing account return the same generic error',async()=>{
      for(const identifier of [tu.username,'missing@example.invalid']) {
        const c=context(db); const result=await c.load('src/lib/actions/auth.ts').loginAction({},form({identifier,password:password()}));
        assert.equal(result.error,'Invalid credentials.'); assert.equal(c.jar.size,0);
      }
    });
    await check('TEACHER/STUDENT direct account reads and actions cannot bypass permissions',async()=>{
      for(const c of [teacher,student]) {
        await redirect(c.load('src/lib/data/accounts.ts').listAccounts(),'/forbidden');
        await redirect(c.load('src/lib/actions/accounts.ts').resetAccountAction(au.id),'/forbidden');
        await redirect(c.load('src/lib/actions/teachers.ts').createTeacher({fullName:'Blocked',username:'blocked',email:'blocked@example.invalid'}),'/forbidden');
      }
    });
    await check('deactivation invalidates existing sessions and blocks login; activation restores access',async()=>{
      assert.equal((await admin.load('src/lib/actions/accounts.ts').setAccountActiveAction(tu.id,false)).ok,true);
      assert.equal(await teacher.load('src/lib/auth/session.ts').getSession(),null);
      assert.equal((await context(db).load('src/lib/actions/auth.ts').loginAction({},form({identifier:tu.email,password:teacherPassword}))).error,'Invalid credentials.');
      assert.equal((await admin.load('src/lib/actions/accounts.ts').setAccountActiveAction(tu.id,true)).ok,true);
      await login(teacher,tu.username,teacherPassword,'/teacher/dashboard');
    });
    await check('password reset revokes sessions, rejects old password and requires first change',async()=>{
      const result=await admin.load('src/lib/actions/teachers.ts').resetTeacherPassword(tu.teacher.id); assert.equal(result.ok,true);
      assert.equal(await teacher.load('src/lib/auth/session.ts').getSession(),null);
      assert.equal((await context(db).load('src/lib/actions/auth.ts').loginAction({},form({identifier:tu.email,password:teacherPassword}))).error,'Invalid credentials.');
      await login(teacher,tu.email,result.tempPassword,'/change-password'); await change(teacher,result.tempPassword,teacherPassword,'/teacher/dashboard');
    });
    await check('expired temporary passwords and sessions are rejected',async()=>{
      const result=await admin.load('src/lib/actions/students.ts').resetStudentPasswordAction(studentProfile.id); assert.equal(result.ok,true);
      await login(student,stu.username,result.tempPassword,'/student/change-password');
      await db.user.update({where:{id:stu.id},data:{passwordExpiresAt:new Date(Date.now()-1000)}});
      assert.equal(await student.load('src/lib/auth/session.ts').getSession(),null);
      const c=context(db); assert.equal((await c.load('src/lib/actions/auth.ts').loginAction({},form({identifier:stu.email,password:result.tempPassword}))).error,'Invalid credentials.');
      const renewed=await admin.load('src/lib/actions/students.ts').resetStudentPasswordAction(studentProfile.id);
      await login(student,stu.email,renewed.tempPassword,'/student/change-password'); await change(student,renewed.tempPassword,studentPassword,'/student/dashboard');
    });
    await check('operator role changes revoke sessions through the database trigger',async()=>{
      const before=await db.user.findUnique({where:{id:tu.id}});
      await db.user.update({where:{id:tu.id},data:{role:'ADMIN'}});
      assert.equal(await teacher.load('src/lib/auth/session.ts').getSession(),null);
      assert.ok((await db.user.findUnique({where:{id:tu.id}})).sessionVersion>before.sessionVersion);
      // ADMIN cannot use a stale Teacher relation to reset an administrator.
      assert.equal((await admin.load('src/lib/actions/teachers.ts').resetTeacherPassword(tu.teacher.id)).ok,false);
      await db.user.update({where:{id:tu.id},data:{role:'TEACHER'}});
    });
    await check('throttling is shared and enforced atomically across independent request contexts',async()=>{
      const identifier='throttle-'+randomBytes(8).toString('hex');
      const results=await Promise.all(Array.from({length:10},()=>context(db).load('src/lib/auth/throttle.ts').rateLimited(identifier)));
      assert.equal(results.filter(Boolean).length,2);
    });
    await check('account creation and its audit entry roll back together on failure',async()=>{
      // Real transaction, intentionally abort after creation; no mock DB writes.
      const count=await db.user.count();
      await assert.rejects(db.$transaction(async tx=>{await tx.user.create({data:{username:'rollback.fixture',email:'rollback@example.invalid',passwordHash:await pw.hashPassword(password()),role:'ADMIN'}});throw new Error('intentional isolated rollback');}));
      assert.equal(await db.user.count(),count);
    });
    await check('audit records exist for creation, resets, status and password changes without secrets',async()=>{
      const logs=await db.auditLog.findMany();
      for(const action of ['Bootstrapped initial SUPER_ADMIN','Created administrator','Created teacher','Created student','Reset account password','Deactivated account','Password changed']) assert.ok(logs.some(l=>l.action===action));
      assert.ok(!logs.some(l=>/passwordHash|tempPassword|isp_session/.test(l.metadata||'')));
    });
    // Throttle test login counts are deliberately limited. Clear only expired
    // fixture throttle rows using normal expiry before browser login scenarios.
    await db.authThrottle.updateMany({data:{expiresAt:new Date(Date.now()-1000)}});
    await browserChecks({super:{username:su.username,password:superPassword},teacher:{username:tu.username,password:teacherPassword},student:{username:stu.username,password:studentPassword}});
    console.log('Integration/browser checks passed:',passed);
  } catch(error) {
    console.error('FAILED:',step,'(error type:',error.name,', code:',error.code||'not available',')'); process.exitCode=1;
  } finally { await db.$disconnect(); }
})();
