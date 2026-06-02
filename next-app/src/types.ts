export type Role = 'public_viewer' | 'organization_manager' | 'super_admin';
export type CalendarView = 'month' | 'week' | 'day' | 'year' | 'agenda';
export type Workspace = 'calendar' | 'dashboard' | 'notifications' | 'announcements' | 'concerns' | 'admin';

export interface User { id: string; full_name: string; username?: string; role: Role; organization_id: string | null }
export interface Organization { id: string; organization_name: string; organization_type?: string }
export interface Category { id: string; name: string; color: string; active: boolean }
export interface Occurrence { id: string; date: string; start_time: string; end_time: string }
export interface CalendarEvent {
  id: string; title: string; event_type: string; organization_id: string; organization_name: string;
  category_id: string; venue: string; schedule_type: 'single_day' | 'multi_day'; occurrences: Occurrence[];
  start_time: string; end_time: string; expected_attendees: number; public_description: string; purpose: string;
  contact_person: string; contact_info: string; private_notes: string; admin_notes?: string; rejection_reason?: string;
  event_status: 'planned' | 'finalized' | 'postponed' | 'cancelled' | 'completed';
  privacy_level: 'basic' | 'internal'; approval_status: 'pending' | 'approved' | 'rejected';
  created_by: string; created_at: string; updated_at: string; conflict_event_ids?: string[];
}
export interface BlockedTime { id: string; title: string; start_time: string; end_time: string; reason?: string; all_day?: boolean }
export interface Announcement { id: string; title: string; content: string; priority: string; posted_by: string; posted_at: string; expires_at?: string }
export interface Concern { id: string; title: string; description: string; organization_id: string; organization_name: string; category: string; priority: string; status: string; admin_response?: string; created_at: string; updated_at: string }
export interface ActivityLog { id: string; action: string; description: string; created_at: string; performed_by: string; performed_by_role: string }
export interface AccountRequest { id: string; username: string; full_name: string; role: Role; organization_name?: string; status: string }
export interface Store {
  version: number; currentUserId: string; users: User[]; organizations: Organization[]; categories: Category[];
  events: CalendarEvent[]; blockedTimes: BlockedTime[]; announcements: Announcement[]; concerns: Concern[];
  activityLogs: ActivityLog[]; accountRequests: AccountRequest[];
}
