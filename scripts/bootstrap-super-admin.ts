import { loadEnvConfig } from "@next/env";
import { PrismaClient } from "@prisma/client";
import { inspectBootstrap, bootstrapSuperAdmin } from "../src/lib/auth/bootstrap";

// No password flags, environment password, stdin pipe, or web endpoint.
async function privateInput(prompt: string): Promise<string> {
  if (!process.stdin.isTTY || !process.stdout.isTTY) throw new Error("Interactive private input is required");
  process.stdout.write(prompt);
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.setEncoding("utf8");
  return new Promise((resolve, reject) => {
    let value = "";
    function cleanup() { process.stdin.off("data", input); process.stdin.setRawMode(false); process.stdin.pause(); process.stdout.write("\n"); }
    function input(chunk: string) {
      for (const char of chunk) {
        if (char === "\u0003" || char === "\u0004") { cleanup(); reject(new Error("Cancelled")); return; }
        if (char === "\r" || char === "\n") { cleanup(); resolve(value); return; }
        if (char === "\u007f" || char === "\b") value = value.slice(0, -1);
        else if (char >= " " && value.length < 256) value += char;
      }
    }
    process.stdin.on("data", input);
  });
}

async function main() {
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  const args = process.argv.slice(2);
  const create = args[0] === "--create" && args[1] === "--confirm-project" && args.length === 3;
  if (!(args.length === 0 || (args.length === 1 && args[0] === "--inspect") || create)) throw new Error("Invalid arguments");
  const url = new URL(process.env.DATABASE_URL ?? "");
  const project = url.hostname.includes("pooler") ? decodeURIComponent(url.username).split(".").slice(1).join(".") :
    /supabase\.(co|com)$/.test(url.hostname) ? url.hostname.replace(/^db\./, "").split(".")[0] : url.pathname.slice(1);
  const db = new PrismaClient({ log: [] });
  try {
    const state = await inspectBootstrap(db);
    console.log("Bootstrap inspection:", { project, ...state });
    if (!create) return;
    if (state.superAdminExists || state.alreadyBootstrapped) { console.log("Refused: initial SUPER_ADMIN already exists. Nothing changed."); return; }
    if (!state.migrationReady || args[2] !== project) throw new Error("Project confirmation or migration missing");
    const email = process.env.BOOTSTRAP_EMAIL;
    const username = process.env.BOOTSTRAP_USERNAME;
    if (!email || !username) throw new Error("Operator identity missing");
    let password = await privateInput("New temporary password (hidden): ");
    let confirmation = await privateInput("Confirm password (hidden): ");
    if (password !== confirmation) throw new Error("Password confirmation differs");
    console.log("Pending operation:", { project, email, username, role: "SUPER_ADMIN", status: "ACTIVE", mustChangePassword: true });
    const result = await bootstrapSuperAdmin(db, { email, username, password });
    password = ""; confirmation = "";
    console.log(result.created ? "Initial account created. Complete first-login password change within 24 hours." : "Refused: another operator already completed bootstrap. Nothing changed.");
  } finally { await db.$disconnect(); }
}
main().catch(() => { console.error("Bootstrap did not complete. Check connectivity, project confirmation, migrations, operator identity and password requirements. No credentials are printed."); process.exitCode = 1; });
