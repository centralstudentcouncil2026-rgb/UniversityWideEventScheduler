# CORE: University-Wide Event Scheduler

CORE is a static university organization calendar connected to a fresh
Supabase backend. It does not use the original scheduler Supabase project.

## Deployment

The frontend is configured for Supabase project `xtagvyyopokrhvvnseom`. The
backend stores scheduler records in relational tables protected by Supabase
Auth and Row Level Security.

The backend uses Supabase Auth, relational scheduler tables, role-aware RPCs,
and Row Level Security. Public viewers can read the approved calendar without
an account. Organization and admin accounts require admin approval.

Public viewers do not need an account. New organization and admin accounts are
submitted from the public registration form and remain unavailable until an
admin approves them from the Accounts panel.

## Run Locally

```bash
python -m http.server 5173
```

Open `http://127.0.0.1:5173/index.html`.

## Backend

`schema.sql` documents the relational Auth schema applied to project
`xtagvyyopokrhvvnseom`. The authoritative migration is recorded in that fresh
project's Supabase migration history.
