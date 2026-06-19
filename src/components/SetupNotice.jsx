export default function SetupNotice() {
  return (
    <div className="centered-screen">
      <div className="card setup-card">
        <h1>Our Calendar</h1>
        <p>Almost there — the app just needs to be connected to your free Supabase project.</p>
        <ol>
          <li>Create a free project at <strong>supabase.com</strong></li>
          <li>
            Copy <code>.env.example</code> to <code>.env</code> and paste in your
            <em> Project URL</em> and <em>anon public key</em> (Project Settings → API).
          </li>
          <li>Run the SQL in <code>supabase_schema.sql</code> (SQL Editor → New query).</li>
          <li>Restart the dev server (<code>npm run dev</code>).</li>
        </ol>
        <p className="muted">Full step-by-step instructions are in <code>README.md</code>.</p>
      </div>
    </div>
  )
}
