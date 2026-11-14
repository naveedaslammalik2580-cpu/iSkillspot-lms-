import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import {
  sendEmail,
  emailProviderConfigured,
  encryptEmail,
  decryptEmail,
  emailTemplate,
  portalUrl,
} from "@/lib/email";

const original = { ...process.env };
before(async () => {
  const url = new URL(process.env.DATABASE_URL || "http://invalid");
  assert.ok(
    ["localhost", "127.0.0.1", "postgres"].includes(url.hostname) &&
      /test/.test(url.pathname),
    "Disposable local database required",
  );
});
after(async () => {
  for (const key of [
    "EMAIL_FROM",
    "SMTP_HOST",
    "SMTP_PORT",
    "SMTP_SECURE",
    "SMTP_REQUIRE_TLS",
    "SMTP_USER",
    "SMTP_PASS",
    "RESEND_API_KEY",
    "LMS_PUBLIC_URL",
    "APP_URL",
    "NODE_ENV",
  ]) {
    if (original[key] === undefined) delete process.env[key];
    else process.env[key] = original[key];
  }
  await db.$disconnect();
});

describe("unified email transport and template", () => {
  it("requires explicit configuration and never claims provider acceptance when absent", async () => {
    delete process.env.SMTP_HOST;
    delete process.env.RESEND_API_KEY;
    delete process.env.EMAIL_FROM;
    assert.equal(emailProviderConfigured(), false);
    assert.deepEqual(
      await sendEmail({
        to: "fixture@example.invalid",
        subject: "Fixture",
        html: "<p>Fixture</p>",
      }),
      { delivered: false, reason: "not-configured" },
    );
  });
  it("escapes personal data, encrypts queued bearer links and uses only the configured official origin", () => {
    process.env.LMS_PUBLIC_URL = "https://lms.example.invalid";
    delete process.env.APP_URL;
    const html = emailTemplate(
      "<script>fixture</script>",
      "Confirmation",
      "Course & Batch",
    );
    assert.ok(!html.includes("<script>"));
    assert.ok(html.includes("&lt;script&gt;"));
    const encrypted = encryptEmail(html);
    assert.ok(!encrypted.includes(html));
    assert.equal(decryptEmail(encrypted), html);
    process.env.APP_URL = "https://wrong.example.invalid";
    assert.throws(() => portalUrl("/login"));
    delete process.env.LMS_PUBLIC_URL;
    process.env.APP_URL = "https://lms.example.invalid";
    assert.equal(portalUrl("/login"), "https://lms.example.invalid/login");
    delete process.env.APP_URL;
    process.env.LMS_PUBLIC_URL = "https://lms.example.invalid";
  });
  it("sends a real SMTP message only to a loopback fixture; retains provider acceptance semantics", async () => {
    let received = "",
      lines = "",
      data = false;
    const server = net.createServer((socket) => {
      socket.setEncoding("utf8");
      socket.write("220 fixture ESMTP\r\n");
      socket.on("data", (chunk) => {
        lines += chunk;
        let at;
        while ((at = lines.indexOf("\r\n")) >= 0) {
          const line = lines.slice(0, at);
          lines = lines.slice(at + 2);
          if (data) {
            if (line === ".") {
              data = false;
              socket.write("250 2.0.0 accepted\r\n");
            } else received += line + "\n";
          } else if (/^(EHLO|HELO)/i.test(line))
            socket.write("250-fixture\r\n250 SIZE 100000\r\n");
          else if (/^(MAIL FROM|RCPT TO)/i.test(line))
            socket.write("250 OK\r\n");
          else if (/^DATA$/i.test(line)) {
            data = true;
            socket.write("354 send message\r\n");
          } else if (/^QUIT$/i.test(line)) {
            socket.write("221 bye\r\n");
            socket.end();
          } else socket.write("250 OK\r\n");
        }
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve),
    );
    process.env.SMTP_HOST = "127.0.0.1";
    process.env.SMTP_PORT = String((server.address() as net.AddressInfo).port);
    process.env.EMAIL_FROM = "Fixture <fixture@example.invalid>";
    process.env.SMTP_SECURE = "false";
    process.env.SMTP_REQUIRE_TLS = "false";
    Object.assign(process.env, { NODE_ENV: "test" });
    delete process.env.SMTP_USER;
    delete process.env.SMTP_PASS;
    try {
      assert.deepEqual(
        await sendEmail(
          {
            to: "recipient@example.invalid",
            subject: "SMTP fixture",
            html: "<p>Fixture SMTP delivery</p>",
          },
          randomBytes(12).toString("hex"),
        ),
        { delivered: true, provider: "smtp" },
      );
      assert.ok(received.includes("SMTP fixture"));
      assert.ok(received.includes("Fixture SMTP delivery"));
      process.env.SMTP_REQUIRE_TLS = "true";
      assert.deepEqual(
        await sendEmail({
          to: "recipient@example.invalid",
          subject: "TLS fixture",
          html: "fixture",
        }),
        { delivered: false, reason: "failed" },
      );
      Object.assign(process.env, { NODE_ENV: "production" });
      process.env.SMTP_REQUIRE_TLS = "false";
      assert.deepEqual(
        await sendEmail({
          to: "recipient@example.invalid",
          subject: "TLS fixture",
          html: "fixture",
        }),
        { delivered: false, reason: "failed" },
      );
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
      delete process.env.SMTP_HOST;
      Object.assign(process.env, { NODE_ENV: "test" });
    }
  });
});
