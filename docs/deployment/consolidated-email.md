# One email configuration for authentication and admissions

Use this guide with [consolidated-supabase.md](consolidated-supabase.md). Verification, application receipt, admission approval/rejection/information requests, public recovery and staff reset links share the encrypted transactional EmailOutbox. No passwords are emailed. Staff see queue success; provider acceptance and inbox delivery are separate outcomes.

## Required environment

| Variable | Exact meaning |
| --- | --- |
| `LMS_PUBLIC_URL` | Official HTTPS origin, without a route, for every emailed link |
| `APP_URL` | PR #5 compatibility alias; leave empty, or use the same origin as LMS_PUBLIC_URL |
| `EMAIL_FROM` | Authorized sender, such as `iSkillSpot <your-real-sender@your-domain>` |
| `SESSION_SECRET` | Existing random secret of at least 32 characters; also encrypts queue bodies |
| `CRON_SECRET` | At least 32 random characters, shared with the authenticated worker scheduler |
| `AUTH_TRUSTED_IP_HEADER` | Optional client-IP header overwritten by your trusted proxy; never a browser-controlled arbitrary header |

No emailed origin is inferred from Host or X-Forwarded-Host. Conflicting APP_URL/LMS_PUBLIC_URL origins cause queuing to fail. Verification expires after 60 minutes; reset links after 30. Superseded, expired, used and session-version-invalid token emails are canceled rather than delivered as live links. Public requests have a generic response and cooldown/rate limits; each account/purpose may receive at most five links per hour. Staff issuance uses the same token service and caps.

## Choose exactly one transport

SMTP has precedence when `SMTP_HOST` is nonempty. There is no silent fallback to Resend after an SMTP failure; the queue records failure and retries.

| Setting | SMTP with STARTTLS | SMTP with implicit TLS | Resend |
| --- | --- | --- | --- |
| `SMTP_HOST` | Your real provider host | Your real provider host | Empty |
| `SMTP_PORT` | `587` | `465` | Not used |
| `SMTP_SECURE` | `false` | `true` | Not used |
| `SMTP_REQUIRE_TLS` | `true` | `true` (implicit TLS already active) | Not used |
| `SMTP_USER`, `SMTP_PASS` | Provider credentials | Provider credentials | Not used |
| `RESEND_API_KEY` | Empty | Empty | Your real server-only key |
| `EMAIL_FROM` | Authorized sender | Authorized sender | Sender on your verified domain |

Plaintext SMTP is rejected in production. A non-TLS loopback relay is used only by disposable transport tests. Do not disable certificate validation or STARTTLS. SMTP messages use Nodemailer with bounded connection/greeting/socket timeouts and file/URL access disabled. For Resend, verify the domain and required SPF/DKIM records before sending. Configure DMARC using the provider/domain administrator's process. Credentials belong in the deployment secret manager, never in NEXT_PUBLIC variables or Git.

## Worker and operational behavior

1. Schedule `GET https://<official-origin>/api/cron/emails` every minute with `Authorization: Bearer <CRON_SECRET>`. This exact header applies to the email worker. Existing reminder POST requests continue to use `x-cron-secret`.
2. Ensure worker execution time can accommodate its twenty-message batch and provider timeouts; overlapping invocations use database leases/`SKIP LOCKED`. If the hosting timeout is shorter, reduce the batch size before deployment or run the worker on a suitable scheduled runtime. Do not expose the scheduler secret in a URL.
3. Monitor EmailOutbox counts by PENDING/SENDING/FAILED/SENT/CANCELED using an authorized operator connection. Do not print/decrypt token mail bodies into logs. Retry backoff is bounded and processing stops after eight failed claims. SMTP/Resend failures retain approval and queued data. Fix configuration, then issue a fresh verification/recovery request or use the authorized admission-confirmation resend action as appropriate.
4. SENT means the transport accepted the message; no inbox delivery claim is made without provider delivery evidence/mailbox receipt. Successful acceptance clears the encrypted body. Canceling superseded/invalid token mail also clears its body. SMTP can deliver twice after an uncertain crash; the stable Message-ID is not an exactly-once guarantee. Resend idempotency lasts 24 hours, after which an uncertain retry can also duplicate.
5. Keep worker scheduling frequent enough that links arrive before expiration. Issuing a fresh link cancels earlier pending mail of that purpose. A used, expired or session-version-invalid link cannot reset a password or verify email, even if an older message arrives.

## Authorized mailbox acceptance checklist

After applying all SQL and configuring the real sender/worker, verify an authorized recipient receives: (a) registration verification, (b) application receipt, (c) admission approval with real student/course/batch and the official “Sign In to Student Portal” button, and (d) Forgot Password plus staff reset mail. Check links use the official origin, expiry/replay fail safely and recovery revokes old sessions without unlocking pending admissions. Confirm failed-provider handling leaves admission approved and the staff resend action works. Record actual provider acceptance and mailbox delivery separately.

Implementation tests include a real loopback SMTP exchange, TLS failure handling and intercepted Resend acceptance/rejection. No live credentials or external mailbox were used during development. Real external delivery remains an operator deployment step.

References: [Nodemailer SMTP transport](https://nodemailer.com/smtp), [Resend send-email API](https://resend.com/docs/api-reference/emails/send-email), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys).
