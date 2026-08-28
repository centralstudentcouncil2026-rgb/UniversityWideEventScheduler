# Bug Fix Guide — Organization Dashboard

Use this guide after the first modular extraction is working.

## Rule for every bug

Fix one bug at a time. Do not change unrelated features.

## Bug: schedule does not save

Look at:

- `src/features/calendar/schedule-modal.js`
- `src/features/calendar/calendar-drag-create.js`
- `src/services/schedule-service.js`
- `src/services/supabase-storage.js`
- `src/legacy-bundle/script.js`

Check:

1. Are start/end date and time fields being filled correctly?
2. Is the organization ID included?
3. Is the approval status correct?
4. Is Supabase insert/update successful?
5. Is the UI refreshing from the saved source, not just local state?

## Bug: schedule click does not show details

Look at:

- `src/features/calendar/calendar-render.js`
- `src/features/calendar/schedule-modal.js`
- `src/features/calendar/calendar-google-style-addon.js`
- `src/legacy-bundle/script.js`

Check:

1. Does the clicked event have the correct ID?
2. Does the modal lookup use the same event ID?
3. Does the event source include full details?
4. Is the event object being transformed differently per view?

## Bug: organization edit request does not reach admin

Look at:

- `src/features/approvals/approval-workflow-guard.js`
- `src/services/schedule-service.js`
- `src/services/notification-service.js`
- `src/features/notifications/notification-routing-guard.js`

Check:

1. Is the edit request saved to Supabase?
2. Does it include original values and requested values?
3. Is an admin notification created?
4. Does rejection preserve original data?
5. Does approval update the actual schedule?

## Bug: organization does not receive admin response notification

Look at:

- `src/features/notifications/notification-routing-guard.js`
- `src/services/notification-service.js`
- `src/features/approvals/approval-workflow-guard.js`

Check:

1. Is the recipient organization ID correct?
2. Is the notification persisted in Supabase?
3. Is the notification only stored locally?
4. Does the unread badge recalculate after reload?
5. Does clicking mark it as read?

## Bug: concern status/update not working

Look at:

- `src/features/concerns/concern-sync-bridge.js`
- `src/features/concerns/org-status-concerns-polish.js`
- `src/services/concern-service.js`

Check:

1. Is the concern ID consistent?
2. Is the status stored in Supabase?
3. Is the UI refreshing after update?
4. Does the organization see admin updates?

## Bug: mobile modal/card cropped

Look at:

- `src/ui/modal-responsive-center.js`
- `src/ui/responsive-ui-final-pass.js`
- `styles/modal.css`
- `styles/mobile.css`

Check:

1. Does the modal use max-height with internal scrolling?
2. Are footer buttons sticky or visible?
3. Are cards allowed to wrap text?
4. Are fixed widths causing overflow?

## Bug: week view multi-day schedule display is wrong

Look at:

- `src/features/calendar/calendar-google-style-addon.js`
- `src/features/calendar/calendar-render.js`
- `src/features/calendar/calendar-drag-create.js`
- `styles/week-timed-render-fix.css`

Expected behavior:

If a schedule starts July 7, 2026 at 3:00 PM and ends July 8, 2026 at 9:00 AM, the week view should show the correct occupied time range across both days, similar to Google Calendar.

