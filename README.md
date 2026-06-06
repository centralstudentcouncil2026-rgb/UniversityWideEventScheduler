# CORE: University-Wide Event Scheduler

CORE is a static university organization calendar connected to a fresh
Supabase backend. It does not use the original scheduler Supabase project.

## Deployment

The frontend is configured for Supabase project `lcmyqhyxtipzovmgbdtf`. The
backend stores the CONNECT scheduler payload in Supabase behind Auth-backed
RPCs and Row Level Security.

GitHub Pages publishes the static frontend from the `main` branch root:

https://centralstudentcouncil2026-rgb.github.io/UniversityWideEventScheduler/

Pushing a commit to `main` updates the public site automatically. The
`.nojekyll` marker keeps GitHub Pages in direct static-file mode.

The backend uses Supabase Auth, a JSON scheduler state table, role-aware RPCs,
and Row Level Security. Public viewers can read the approved calendar without
an account. Organization accounts require Manager approval. Elevated accounts
are assigned by the Manager from inside the Accounts panel.

Public viewers do not need an account. They receive a month-only overview and
can select a date to inspect its public events. New organization accounts are
submitted from the public registration form and remain unavailable until the
Manager approves them from the Accounts panel.

Active organization accounts can post events directly. Admin-blocked periods
prevent posting, while schedule overlaps remain visible warnings. Events marked
internal remain visible only to the posting organization and admins.

## Run Locally

```bash
python -m http.server 5173
```

Open `http://127.0.0.1:5173/index.html`.

## Backend

`schema.sql` documents the CONNECT Auth/RPC backend applied to project
`lcmyqhyxtipzovmgbdtf`. The authoritative migrations are recorded in that
project's Supabase migration history.

## Supabase MCP For Codex

Use this MCP target for CONNECT project work in Codex:

```bash
codex mcp add supabase --url https://mcp.supabase.com/mcp?project_ref=lcmyqhyxtipzovmgbdtf
codex mcp login supabase
```

Then run `/mcp` inside Codex to verify authentication. The deployed frontend
points at `lcmyqhyxtipzovmgbdtf.supabase.co`; verify the intended backend
target before applying migrations or changing live data.
