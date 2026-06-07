# CONNECT: University-Wide Event Scheduler

CONNECT is a static university organization calendar connected to a fresh
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

## User Manual

### Public Calendar

- Open the public site to view approved public events without logging in.
- Use the Month or Year view to scan university-wide activity.
- Select a calendar date to inspect the public events scheduled for that day.
- Open the menu on phone or tablet to view announcements and posted status cards.

### Organization Portal

- Sign in through the organization access link.
- Post university events from the sidebar.
- Create single-day or multi-day events, including per-day custom times.
- Edit or remove events created by the signed-in organization.
- View approved public events from other organizations and CSC.
- Raise concerns for admin review.

### Admin Portal

- Sign in through the admin access link.
- Review, approve, reject, edit, or remove calendar events.
- Manage blocked dates and times that prevent event posting.
- Manage announcements, categories, organizations, accounts, and activity logs.
- Use account presets and toggles to control each account's available tools.
- Update CSC President and Incampus/Offcampus status cards when authorized.

### Calendar Behavior

- Week and day views keep overlapping events visible.
- Multi-day week events use connected horizontal and vertical line styling.
- Month and year views keep multi-day events visually connected.
- Public events show only public-safe details.
- Internal events remain visible only to the posting organization and admins.

### Mobile and Tablet Use

- The same public, organization, and admin sites adapt to phone, tablet, and desktop sizes.
- On touch devices, the sidebar becomes a drawer opened by the menu button.
- Rotate the device freely; the calendar resizes after viewport and orientation changes.

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
