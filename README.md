# CORE: University-Wide Event Scheduler

CORE is a static university organization calendar connected to a fresh
Supabase backend. It does not use the original scheduler Supabase project.

## Deployment

The frontend is configured for Supabase project `xtagvyyopokrhvvnseom`. The
backend stores scheduler records in relational tables protected by Supabase
Auth and Row Level Security.

GitHub Pages publishes the static frontend from the `main` branch root:

https://centralstudentcouncil2026-rgb.github.io/UniversityWideEventScheduler/

Pushing a commit to `main` updates the public site automatically. The
`.nojekyll` marker keeps GitHub Pages in direct static-file mode.

## React Preview

The replacement React/Vite TypeScript interface is published alongside the
current root app at:

https://centralstudentcouncil2026-rgb.github.io/UniversityWideEventScheduler/next/

Its source lives in `next-app/`, while the production output is committed in
`next/` for GitHub Pages. Build it with:

```bash
cd next-app
npm install
npm run build
```

The preview intentionally uses the same Supabase backend and occurrence-based
event records as the current app. Keep the root entrypoint in place until the
preview has been reviewed and explicitly promoted.

The backend uses Supabase Auth, relational scheduler tables, role-aware RPCs,
and Row Level Security. Public viewers can read the approved calendar without
an account. Organization and admin accounts require admin approval.

Public viewers do not need an account. They receive a month-only overview and
can select a date to inspect its public events. New organization and admin
accounts are submitted from the public registration form and remain unavailable
until an admin approves them from the Accounts panel.

Active organization accounts can post events directly. Admin-blocked periods
prevent posting, while schedule overlaps remain visible warnings. Events marked
internal remain visible only to the posting organization and admins.

## Run Locally

```bash
python -m http.server 5173
```

Open `http://127.0.0.1:5173/index.html`.

## Backend

`schema.sql` documents the relational Auth schema applied to project
`xtagvyyopokrhvvnseom`. The authoritative migration is recorded in that fresh
project's Supabase migration history.
