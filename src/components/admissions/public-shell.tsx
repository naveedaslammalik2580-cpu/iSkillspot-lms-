import Link from "next/link";
import Image from "next/image";
export function PublicShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <main className="min-h-screen bg-gradient-to-br from-accent to-background px-4 py-10 sm:py-14">
      <div className="mx-auto w-full max-w-lg">
        <Link href="/login" className="mb-7 flex items-center justify-center">
          <Image
            src="/logo.png"
            alt="iSkillSpot"
            width={640}
            height={640}
            className="h-20 w-20 rounded-xl"
          />
        </Link>
        <section className="rounded-xl border border-border bg-card p-5 shadow-sm sm:p-8">
          <h1 className="mb-6 text-2xl font-bold">{title}</h1>
          {children}
        </section>
        <p className="mt-5 text-center text-sm text-muted-foreground">
          <Link href="/login" className="underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
