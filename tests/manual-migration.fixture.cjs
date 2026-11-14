// Synthetic records in the runner's disposable pre-migration database only.
const { PrismaClient } = require('@prisma/client');
const { randomBytes } = require('node:crypto');
const assert = require('node:assert/strict');
const { context } = require('./source-loader.cjs');

exports.prepare = async function prepare(connection) {
  const url = new URL(connection);
  assert.ok(url.hostname === '127.0.0.1' && url.pathname.startsWith('/iskillspot_auth_test_') && url.pathname.endsWith('_manual'));
  const db = new PrismaClient({datasourceUrl:connection,log:[]});
  const hash = await context(null).load('src/lib/auth/password.ts').hashPassword(randomBytes(24).toString('base64url'));
  try {
    await db.$executeRawUnsafe('CREATE ROLE anon');
    await db.$executeRawUnsafe('CREATE ROLE authenticated');
    await db.$executeRawUnsafe('GRANT SELECT, UPDATE ON public."User" TO anon, authenticated');
    for(const [id,username,email,role,temporary] of [
      ['legacy-super','legacy.super','legacy.super@example.invalid','SUPER_ADMIN',true],
      ['legacy-teacher','legacy.teacher','legacy.teacher@example.invalid','TEACHER',false],
      ['legacy-student','legacy.student','legacy.student@example.invalid','STUDENT',false],
    ]) {
      // Only columns present before the additive migration are used.
      await db.$executeRaw`INSERT INTO "User" (id,username,email,"passwordHash",role,status,"mustChangePassword","updatedAt")
        VALUES (${id},${username},${email},${hash},${role}::"Role",'ACTIVE',${temporary},CURRENT_TIMESTAMP)`;
    }
    await db.teacher.create({data:{userId:'legacy-teacher',fullName:'Legacy Fixture Teacher'}});
    const student=await db.student.create({data:{userId:'legacy-student',studentId:'LEGACY-TEST-1',fullName:'Legacy Fixture Student'}});
    const course={id:'legacy-fixture-course'};
    await db.$executeRaw`INSERT INTO "Course" (id,title,slug,"updatedAt") VALUES (${course.id},'Legacy Fixture Course','legacy-fixture',CURRENT_TIMESTAMP)`;
    const batch=await db.batch.create({data:{courseId:course.id,name:'Legacy Fixture Batch',code:'LEGACY-FIXTURE'},select:{id:true}});
    await db.$executeRaw`INSERT INTO "Enrollment" (id,"studentId","courseId","batchId") VALUES ('legacy-fixture-enrollment',${student.id},${course.id},${batch.id})`;
    const fee=await db.fee.create({data:{studentId:student.id,courseId:course.id,totalFee:100,finalFee:100,amountPaid:25,remainingBalance:75,status:'PARTIAL'}});
    await db.$executeRaw`INSERT INTO "Payment" (id,"studentId","feeId",amount) VALUES ('legacy-fixture-payment',${student.id},${fee.id},25)`;
    await db.certificate.create({data:{studentId:student.id,courseId:course.id,certificateNumber:'LEGACY-FIXTURE-CERT',verificationCode:'LEGACY-FIXTURE-VERIFY'}});
    return async function verify() {
      try {
        assert.equal(await db.user.count(),3); assert.equal(await db.teacher.count(),1); assert.equal(await db.student.count(),1);
        assert.equal(await db.fee.count(),1); assert.equal(await db.payment.count(),1); assert.equal(await db.certificate.count(),1);
        assert.equal(await db.enrollment.count(),1);
        const users=await db.user.findMany();
        assert.ok(users.every(user=>user.passwordHash===hash && user.status==='ACTIVE' && user.sessionVersion===0));
        const superAdmin=users.find(user=>user.id==='legacy-super');
        assert.equal(superAdmin.role,'SUPER_ADMIN'); assert.ok(superAdmin.passwordExpiresAt > Date.now());
        assert.ok(Math.abs(superAdmin.passwordExpiresAt.getTime()-Date.now()-86400000)<60000);
        assert.ok(users.filter(user=>user.id!=='legacy-super').every(user=>user.passwordExpiresAt===null));
        const preserved=await db.fee.findUnique({where:{id:fee.id}});
        assert.equal(preserved.totalFee,100); assert.equal(preserved.amountPaid,25); assert.equal(preserved.remainingBalance,75);
        assert.equal((await db.payment.findFirst()).amount,25);
        const api=await db.$queryRaw`SELECT has_table_privilege('anon','public."User"','SELECT') AS readable,
          has_table_privilege('authenticated','public."User"','UPDATE') AS writable`;
        assert.equal(api[0].readable,false); assert.equal(api[0].writable,false);
      } finally { await db.$disconnect(); }
    };
  } catch(error) { await db.$disconnect(); throw error; }
};
