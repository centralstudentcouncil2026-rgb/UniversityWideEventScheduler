-- CSC S.Y.N.C. same-row edit/removal requests
-- Run this once in Supabase SQL Editor.
-- This keeps schedule edits/removals in the original calendar_items row.
-- No duplicate edit rows and no separate notification table are required.

begin;

alter table public.calendar_items add column if not exists pending_action text;
alter table public.calendar_items add column if not exists pending_revision jsonb not null default '{}'::jsonb;
alter table public.calendar_items add column if not exists notification_read_by jsonb not null default '{}'::jsonb;

-- Normalize existing rows.
update public.calendar_items
set pending_revision = coalesce(pending_revision, '{}'::jsonb),
    notification_read_by = coalesce(notification_read_by, '{}'::jsonb)
where record_type = 'schedule';

-- Collapse old duplicated pending revision/removal rows into their original approved row when possible.
-- The original row remains the single source of truth and holds the pending request data.
with pending_revisions as (
  select r.*
  from public.calendar_items r
  where r.record_type = 'schedule'
    and r.revision_of is not null
    and r.revision_of <> ''
    and r.approval_status = 'pending'
), applied as (
  update public.calendar_items original
  set pending_action = case
        when revision.revision_status = 'cancel_pending' or revision.event_status = 'cancellation_requested' then 'remove'
        else 'edit'
      end,
      pending_revision = jsonb_build_object(
        'request_id', revision.id,
        'requested_at', coalesce(revision.revision_submitted_at, revision.updated_at, now()),
        'requested_by', revision.created_by,
        'category_id', revision.category_id,
        'title', revision.title,
        'venue', revision.venue,
        'schedule_type', revision.schedule_type,
        'start_time', revision.start_time,
        'end_time', revision.end_time,
        'occurrences', coalesce(revision.occurrences, '[]'::jsonb),
        'expected_attendees', revision.expected_attendees,
        'privacy_level', revision.privacy_level,
        'contact_person', revision.contact_person,
        'contact_info', revision.contact_info,
        'public_description', revision.public_description,
        'purpose', revision.purpose,
        'revision_status', revision.revision_status,
        'event_status', revision.event_status
      ),
      revision_status = 'pending',
      notification_status = 'unread',
      notification_read_by = '{}'::jsonb,
      updated_at = now()
  from pending_revisions revision
  where original.id = revision.revision_of
    and original.record_type = 'schedule'
  returning revision.id
)
delete from public.calendar_items d
where d.id in (select id from applied);

notify pgrst, 'reload schema';

commit;
