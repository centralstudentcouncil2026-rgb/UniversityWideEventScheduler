# Codex Prompt — CSC S.Y.N.C. Organization Dashboard Modularization

You are working on the organization-side CSC S.Y.N.C. dashboard.

## Primary goal

Refactor the compacted `org-dashboard.html` into readable modules without changing behavior first.

## Mandatory rules

1. Read this file first before editing.
2. Do not optimize during the first pass.
3. Do not rename existing functions, global flags, event listeners, Supabase table names, localStorage/sessionStorage keys, or DOM IDs/classes unless required by a targeted bug fix.
4. Preserve current execution order.
5. Keep `legacy/original-compacted/org-dashboard.html` untouched as the reference copy.
6. Use the extracted files under `src/legacy-bundle/`, `src/legacy-inline/`, and `src/legacy-external-scripts/` to compare behavior.
7. Make one focused change at a time.
8. After the app works in modular form, only then move logic into feature folders.
9. When fixing a bug, edit only the related feature/service files.
10. Leave a short note in `docs/BUG-FIX-GUIDE.md` or a new doc when you fix a bug.

## Recommended first task

Make the app load with separate CSS and JS files while preserving the current behavior.

Suggested order:

1. Keep root `org-dashboard.html` working as the fallback.
2. Use `modular-preview/org-dashboard.modular-template.html` as a starting point only.
3. Wire extracted styles:
   - `styles/early-session.css`
   - `styles/dashboard-bundle.css`
   - `styles/org-dashboard-visibility.css`
   - `styles/event-request-card-text-wrap-fix.css`
   - `styles/week-timed-render-fix.css`
4. Wire the extracted JavaScript in the same order as the original inline scripts.
5. Verify login/session restore.
6. Verify organization schedule creation.
7. Verify schedule edit request workflow.
8. Verify notifications.
9. Verify calendar month/week/day/year views.
10. Verify mobile modal/card responsiveness.

## Important bug areas to isolate

### Calendar bugs
Focus on:
- `src/features/calendar/`
- `src/services/schedule-service.js`
- `src/utils/date-utils.js`

### Notification bugs
Focus on:
- `src/features/notifications/`
- `src/services/notification-service.js`
- `src/features/approvals/`

### Approval workflow bugs
Focus on:
- `src/features/approvals/`
- `src/services/schedule-service.js`
- `src/features/notifications/`

### Concern bugs
Focus on:
- `src/features/concerns/`
- `src/services/concern-service.js`

### Mobile/UI bugs
Focus on:
- `src/ui/`
- `styles/mobile.css`
- `styles/modal.css`

## What not to do in the first pass

Do not:
- convert everything to a framework,
- delete guards,
- merge unrelated logic,
- rewrite Supabase logic from scratch,
- change table/column names,
- change the visual design,
- change admin dashboard logic unless this org dashboard depends on it.

