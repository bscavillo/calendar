export default function SetupNotice() {
  return (
    <div className="grid min-h-[100dvh] place-items-center p-4 sm:p-6">
      <div className="w-full max-w-lg rounded-sm bg-surface p-6 shadow-[0_8px_30px_rgba(120,110,160,0.12)] sm:p-8">
        <h1 className="text-2xl font-semibold">Calendar</h1>
        <p className="mt-2">Almost there — the app just needs to be connected to your free Supabase project.</p>
        <ol className="mt-3 list-decimal pl-5 leading-7">
          <li>Create a free project at <strong>supabase.com</strong></li>
          <li>
            Copy <code className="rounded-sm bg-canvas px-1.5 py-0.5 text-[0.9em]">.env.example</code> to{' '}
            <code className="rounded-sm bg-canvas px-1.5 py-0.5 text-[0.9em]">.env</code> and paste in your
            <em> Project URL</em> and <em>anon public key</em> (Project Settings → API).
          </li>
          <li>
            Run the SQL in{' '}
            <code className="rounded-sm bg-canvas px-1.5 py-0.5 text-[0.9em]">supabase_schema.sql</code> (SQL Editor → New query).
          </li>
          <li>
            Restart the dev server (<code className="rounded-sm bg-canvas px-1.5 py-0.5 text-[0.9em]">npm run dev</code>).
          </li>
        </ol>
        <p className="mt-3 text-muted">
          Full step-by-step instructions are in{' '}
          <code className="rounded-sm bg-canvas px-1.5 py-0.5 text-[0.9em]">README.md</code>.
        </p>
      </div>
    </div>
  )
}
