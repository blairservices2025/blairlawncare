/**
 * Shown instead of the sign-in page when the Supabase environment variables
 * are missing, so the cause is visible on the page rather than buried in a
 * build log.
 */
export default function SetupNeeded({ missing }: { missing: string[] }) {
  return (
    <main className="min-h-screen flex items-center justify-center mow-stripes p-4">
      <div className="w-full max-w-lg bg-paper rounded-xl p-6 shadow-xl">
        <div className="text-3xl mb-2">🌱</div>
        <h1 className="display text-xl font-semibold mb-1">Almost there</h1>
        <p className="text-sm text-ink-soft mb-4">
          The app is deployed and running — it just doesn&apos;t know where your
          database is yet.
        </p>

        <div className="bg-bone-dim rounded-lg p-4 mb-4">
          <p className="text-sm font-semibold mb-2">
            Missing environment variable{missing.length === 1 ? "" : "s"}:
          </p>
          <ul className="text-sm font-mono space-y-1">
            {missing.map((m) => (
              <li key={m}>• {m}</li>
            ))}
          </ul>
        </div>

        <ol className="text-sm space-y-2 list-decimal pl-5">
          <li>
            In <strong>Supabase</strong> → Project Settings → API, copy your{" "}
            <strong>Project URL</strong> and your <strong>anon public</strong>{" "}
            key.
          </li>
          <li>
            In <strong>Vercel</strong> → Settings → Environment Variables, add
            each name above with its matching value.
          </li>
          <li>
            In <strong>Vercel</strong> → Deployments → ⋯ → <strong>Redeploy</strong>.
            Environment variables only apply to new deployments.
          </li>
        </ol>

        <p className="text-xs text-ink-soft mt-4">
          Full setup steps are in the README in your repository.
        </p>
      </div>
    </main>
  );
}
