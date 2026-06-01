import { useEffect, useMemo, useState } from 'react';
import { decideAccount, deleteEvent, deleteRecord, loadStore, login, logout, publicUser, requestAccount, saveStore } from './api';
import { addDays, createId, dateKey, dateRange, fromDateKey, hourSlots, localIso, monthLabel, nextDateKey, occurrencesForDates, pad, sameDay, shortDate, startOfMonthGrid, startOfWeek, timeInput, timeLabel } from './dates';
import type { AccountRequest, Announcement, CalendarEvent, CalendarView, Category, Concern, Occurrence, Store, User, Workspace } from './types';

const blankStore: Store = { version: 3, currentUserId: 'public', users: [], organizations: [], categories: [], events: [], blockedTimes: [], announcements: [], concerns: [], activityLogs: [], accountRequests: [] };
const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const canEdit = (user: User, event: CalendarEvent) => user.role === 'super_admin' || (user.role === 'organization_manager' && user.organization_id === event.organization_id);
const visibleEvents = (store: Store, user: User) => store.events.filter((event) => user.role === 'public_viewer'
  ? event.approval_status === 'approved' && event.privacy_level !== 'internal'
  : user.role === 'super_admin' || event.organization_id === user.organization_id || (event.approval_status === 'approved' && event.privacy_level !== 'internal'));
const categoryFor = (store: Store, id: string): Category => store.categories.find((item) => item.id === id) || { id: '', name: 'General', color: '#3568a6', active: true };
const datesFor = (event: CalendarEvent) => event.occurrences.map((item) => item.date);
const syncEvent = (event: CalendarEvent) => {
  const occurrences = [...event.occurrences].sort((a, b) => a.start_time.localeCompare(b.start_time));
  return { ...event, schedule_type: occurrences.length > 1 ? 'multi_day' as const : 'single_day' as const, occurrences, start_time: occurrences[0].start_time, end_time: occurrences.at(-1)!.end_time, updated_at: new Date().toISOString() };
};
const initialEvent = (store: Store, user: User, dates: string[], start = '09:00', end = '10:00'): CalendarEvent => {
  const organization = store.organizations.find((item) => item.id === user.organization_id) || store.organizations[0];
  const occurrences = occurrencesForDates(dates, start, end);
  const now = new Date().toISOString();
  return { id: createId(), title: '', event_type: '', organization_id: organization?.id || '', organization_name: organization?.organization_name || '', category_id: store.categories.find((item) => item.active)?.id || '', venue: '', schedule_type: occurrences.length > 1 ? 'multi_day' : 'single_day', occurrences, start_time: occurrences[0].start_time, end_time: occurrences.at(-1)!.end_time, expected_attendees: 1, public_description: '', purpose: '', contact_person: user.full_name, contact_info: '', private_notes: '', event_status: 'planned', privacy_level: 'basic', approval_status: 'approved', created_by: user.id, created_at: now, updated_at: now, conflict_event_ids: [] };
};

export default function App() {
  const [store, setStore] = useState<Store>(blankStore);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState('');
  const [cursor, setCursor] = useState(new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [workspace, setWorkspace] = useState<Workspace>('calendar');
  const [editor, setEditor] = useState<CalendarEvent | null>(null);
  const [selectedDate, setSelectedDate] = useState('');
  const [authOpen, setAuthOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [mobile, setMobile] = useState(matchMedia('(max-width: 760px)').matches);

  const user = store.users.find((item) => item.id === store.currentUserId) || publicUser;
  const events = useMemo(() => visibleEvents(store, user).filter((event) => {
    const text = `${event.title} ${event.organization_name} ${event.venue}`.toLowerCase();
    return (!search || text.includes(search.toLowerCase())) && (!filterCategory || event.category_id === filterCategory);
  }), [store, user, search, filterCategory]);

  useEffect(() => { void reload(); }, []);
  useEffect(() => { const handler = () => setMobile(matchMedia('(max-width: 760px)').matches); addEventListener('resize', handler); return () => removeEventListener('resize', handler); }, []);
  useEffect(() => {
    if (user.role === 'public_viewer' && view !== 'month') setView('month');
    if (mobile && !['month', 'agenda'].includes(view)) setView('month');
  }, [user.role, mobile, view]);
  useEffect(() => {
    const hash = location.hash.slice(1) as Workspace;
    if (['calendar', 'dashboard', 'announcements', 'concerns', 'admin'].includes(hash)) setWorkspace(hash);
  }, []);

  async function reload(message = '') {
    try { setStore(await loadStore()); if (message) setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not connect to Supabase.'); }
    finally { setLoading(false); }
  }
  async function persist(next: Store, message: string) {
    try { await saveStore(next); setStore(next); setNotice(message); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not save changes.'); }
  }
  function go(next: Workspace) { location.hash = next; setWorkspace(next); }
  function shift(amount: number) { setCursor((value) => view === 'day' ? addDays(value, amount) : view === 'week' ? addDays(value, amount * 7) : new Date(value.getFullYear() + (view === 'year' ? amount : 0), value.getMonth() + (view === 'month' ? amount : 0), 1, 12)); }
  function create(dates: string[], start = '09:00', end = '10:00') { if (user.role !== 'public_viewer') setEditor(initialEvent(store, user, dates, start, end)); }
  async function saveEvent(event: CalendarEvent) {
    const nextEvent = syncEvent(event);
    if (!nextEvent.title || !nextEvent.event_type || !nextEvent.venue || !nextEvent.public_description || !nextEvent.purpose || !nextEvent.contact_info) return setNotice('Complete the title, type, venue, description, purpose, and contact details.');
    if (nextEvent.occurrences.some((item) => new Date(item.start_time) >= new Date(item.end_time))) return setNotice('Every event day needs an end time later than its start time.');
    const index = store.events.findIndex((item) => item.id === event.id);
    const next = { ...store, events: [...store.events] };
    if (index >= 0) next.events[index] = nextEvent; else next.events.push(nextEvent);
    await persist(next, index >= 0 ? 'Event updated.' : 'Event posted.');
    setEditor(null);
  }
  async function removeEvent(event: CalendarEvent) {
    if (!canEdit(user, event) || !confirm(`Permanently delete "${event.title}" and all of its occurrences?`)) return;
    try { const next = await deleteEvent(store, event.id); setStore(next); setEditor(null); setNotice('Event deleted.'); }
    catch (error) { setNotice(error instanceof Error ? error.message : 'Could not delete event.'); }
  }

  if (loading) return <main className="loading">Loading CORE calendar...</main>;
  return <div className="app">
    <header className="topbar">
      <button className="brand" onClick={() => go('calendar')}><img src="../assets/csc-logo.png" /><span><strong>CORE</strong><small>University Coordination Calendar</small></span></button>
      <div className="top-actions">
        <input className="search" placeholder="Search events" value={search} onChange={(event) => setSearch(event.target.value)} />
        <button className="profile" onClick={() => setAuthOpen(true)}>{user.full_name}</button>
      </div>
    </header>
    <div className="body">
      <aside className="sidebar">
        {user.role !== 'public_viewer' && <button className="post" onClick={() => create([dateKey(new Date())])}>+ Post event</button>}
        <Nav active={workspace} go={go} user={user} />
        <section className="side-note"><strong>Calendar filters</strong><select value={filterCategory} onChange={(event) => setFilterCategory(event.target.value)}><option value="">All categories</option>{store.categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></section>
      </aside>
      <main className="main">
        {notice && <button className="notice" onClick={() => setNotice('')}>{notice}</button>}
        {workspace === 'calendar' && <CalendarWorkspace store={store} user={user} events={events} view={view} setView={setView} cursor={cursor} setCursor={setCursor} shift={shift} create={create} edit={setEditor} setSelectedDate={setSelectedDate} mobile={mobile} />}
        {workspace === 'dashboard' && <Dashboard store={store} events={events} />}
        {workspace === 'announcements' && <Announcements store={store} user={user} persist={persist} />}
        {workspace === 'concerns' && <Concerns store={store} user={user} persist={persist} />}
        {workspace === 'admin' && <Admin store={store} user={user} persist={persist} reload={reload} />}
      </main>
    </div>
    {selectedDate && <DayPanel date={selectedDate} events={events} store={store} close={() => setSelectedDate('')} edit={(event) => user.role === 'public_viewer' ? undefined : setEditor(event)} />}
    {editor && <EventEditor event={editor} store={store} user={user} close={() => setEditor(null)} save={saveEvent} remove={removeEvent} />}
    {authOpen && <Auth user={user} close={() => setAuthOpen(false)} reload={reload} />}
  </div>;
}

function Nav({ active, go, user }: { active: Workspace; go: (item: Workspace) => void; user: User }) {
  const items: [Workspace, string][] = user.role === 'public_viewer' ? [['calendar', 'Calendar'], ['announcements', 'Announcements']] : [['calendar', 'Calendar'], ['dashboard', 'Dashboard'], ['announcements', 'Announcements'], ['concerns', 'Concerns']];
  if (user.role === 'super_admin') items.push(['admin', 'Admin tools']);
  return <nav>{items.map(([value, label]) => <button key={value} className={active === value ? 'active' : ''} onClick={() => go(value)}>{label}</button>)}</nav>;
}

function CalendarWorkspace(props: { store: Store; user: User; events: CalendarEvent[]; view: CalendarView; setView: (view: CalendarView) => void; cursor: Date; setCursor: (date: Date) => void; shift: (amount: number) => void; create: (dates: string[], start?: string, end?: string) => void; edit: (event: CalendarEvent) => void; setSelectedDate: (date: string) => void; mobile: boolean }) {
  const allowed: CalendarView[] = props.user.role === 'public_viewer' ? ['month'] : props.mobile ? ['month', 'agenda'] : ['day', 'week', 'month', 'year', 'agenda'];
  return <section className="calendar-workspace">
    <header className="calendar-head">
      <div><span className="eyebrow">{props.user.role === 'public_viewer' ? 'Public events overview' : 'Shared scheduling workspace'}</span><h1>{props.view === 'year' ? props.cursor.getFullYear() : monthLabel(props.cursor)}</h1></div>
      <div className="calendar-controls"><button onClick={() => props.shift(-1)}>‹</button><button onClick={() => props.setCursor(new Date())}>Today</button><button onClick={() => props.shift(1)}>›</button><select value={props.view} onChange={(event) => props.setView(event.target.value as CalendarView)}>{allowed.map((item) => <option key={item}>{item}</option>)}</select></div>
    </header>
    {props.view === 'month' && <MonthView {...props} />}
    {props.view === 'week' && <WeekView {...props} />}
    {props.view === 'day' && <DayView {...props} />}
    {props.view === 'year' && <YearView {...props} />}
    {props.view === 'agenda' && <Agenda events={props.events} store={props.store} edit={props.edit} />}
  </section>;
}

function MonthView({ store, user, events, cursor, create, edit, setSelectedDate }: Parameters<typeof CalendarWorkspace>[0]) {
  const days = Array.from({ length: 42 }, (_, index) => addDays(startOfMonthGrid(cursor), index));
  const weeks = Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  function finish(date: string) {
    if (!start) return;
    const [first, last] = start <= date ? [start, date] : [date, start];
    setEnd(last); setStart('');
    if (user.role === 'public_viewer') setSelectedDate(date); else create(dateRange(first, last));
    setTimeout(() => setEnd(''), 250);
  }
  return <div className="month-view">
    <div className="weekday-row">{weekdays.map((day) => <strong key={day}>{day}</strong>)}</div>
    {weeks.map((week) => <div className="month-week" key={dateKey(week[0])}>
      <div className="month-cells">{week.map((day) => {
        const key = dateKey(day); const selected = start && end ? key >= start && key <= end : key === start;
        return <button key={key} className={`month-cell ${day.getMonth() !== cursor.getMonth() ? 'muted' : ''} ${sameDay(day, new Date()) ? 'today' : ''} ${selected ? 'selected' : ''}`} onPointerDown={() => setStart(key)} onPointerEnter={() => start && setEnd(key)} onPointerUp={() => finish(key)} onClick={() => user.role === 'public_viewer' && setSelectedDate(key)}><span>{day.getDate()}</span></button>;
      })}</div>
      <MonthBars week={week} events={events} store={store} edit={edit} publicView={user.role === 'public_viewer'} setSelectedDate={setSelectedDate} />
    </div>)}
  </div>;
}

function MonthBars({ week, events, store, edit, publicView, setSelectedDate }: { week: Date[]; events: CalendarEvent[]; store: Store; edit: (event: CalendarEvent) => void; publicView: boolean; setSelectedDate: (date: string) => void }) {
  const first = dateKey(week[0]), last = dateKey(week[6]);
  const spans = events.flatMap((event) => {
    const selected = datesFor(event).filter((date) => date >= first && date <= last);
    const groups = selected.reduce<string[][]>((all, date) => { const group = all.at(-1); if (!group || nextDateKey(group.at(-1)!) !== date) all.push([date]); else group.push(date); return all; }, []);
    return groups.map((group) => ({ event, start: group[0], end: group.at(-1)!, continuesLeft: datesFor(event).includes(dateKey(addDays(group[0], -1))), continuesRight: datesFor(event).includes(nextDateKey(group.at(-1)!)) }));
  });
  return <div className="month-bars">{spans.slice(0, 4).map((span, index) => {
    const left = week.findIndex((day) => dateKey(day) === span.start) + 1; const right = week.findIndex((day) => dateKey(day) === span.end) + 2;
    return <button key={`${span.event.id}-${span.start}`} className={`month-bar ${span.continuesLeft ? 'continue-left' : ''} ${span.continuesRight ? 'continue-right' : ''}`} style={{ gridColumn: `${left} / ${right}`, gridRow: index + 1, background: categoryFor(store, span.event.category_id).color }} onClick={(event) => { event.stopPropagation(); publicView ? setSelectedDate(span.start) : edit(span.event); }}>{span.event.title}</button>;
  })}</div>;
}

function WeekView(props: Parameters<typeof CalendarWorkspace>[0]) {
  const days = Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(props.cursor), index));
  return <TimeGrid {...props} days={days} />;
}
function DayView(props: Parameters<typeof CalendarWorkspace>[0]) { return <TimeGrid {...props} days={[props.cursor]} />; }
function TimeGrid({ days, store, events, create, edit }: Parameters<typeof CalendarWorkspace>[0] & { days: Date[] }) {
  const [anchor, setAnchor] = useState<{ day: number; half: number } | null>(null);
  function finish(day: number, half: number) {
    if (!anchor) return;
    const firstDay = Math.min(anchor.day, day), lastDay = Math.max(anchor.day, day), firstHalf = Math.min(anchor.half, half), lastHalf = Math.max(anchor.half, half) + 1;
    const start = `${pad(7 + Math.floor(firstHalf / 2))}:${firstHalf % 2 ? '30' : '00'}`, end = `${pad(7 + Math.floor(lastHalf / 2))}:${lastHalf % 2 ? '30' : '00'}`;
    create(days.slice(firstDay, lastDay + 1).map(dateKey), start, end); setAnchor(null);
  }
  return <div className="time-view">
    <div className="time-head" style={{ gridTemplateColumns: `56px repeat(${days.length}, 1fr)` }}><span />{days.map((day) => <strong key={dateKey(day)}>{day.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })}</strong>)}</div>
    <div className="time-body">
      <div className="time-labels">{hourSlots.map((hour) => <span key={hour}>{hour > 12 ? hour - 12 : hour}:00</span>)}</div>
      {days.map((day, dayIndex) => <div className="time-day" key={dateKey(day)}>{Array.from({ length: 28 }, (_, half) => <button key={half} onPointerDown={() => setAnchor({ day: dayIndex, half })} onPointerUp={() => finish(dayIndex, half)} />)}
        {events.flatMap((event) => event.occurrences.filter((item) => item.date === dateKey(day)).map((occurrence) => <TimedEvent key={`${event.id}-${occurrence.id}`} event={event} occurrence={occurrence} store={store} edit={edit} />))}
      </div>)}
    </div>
  </div>;
}
function TimedEvent({ event, occurrence, store, edit }: { event: CalendarEvent; occurrence: Occurrence; store: Store; edit: (event: CalendarEvent) => void }) {
  const start = new Date(occurrence.start_time), end = new Date(occurrence.end_time); const top = ((start.getHours() - 7) * 60 + start.getMinutes()) / 840 * 100; const height = (end.getTime() - start.getTime()) / 60000 / 840 * 100;
  return <button className="timed-event" style={{ top: `${top}%`, height: `${height}%`, background: categoryFor(store, event.category_id).color }} onClick={() => edit(event)}><strong>{event.title}</strong><small>{timeLabel(occurrence.start_time)}</small></button>;
}

function YearView({ cursor, setCursor, setView, events, store }: Parameters<typeof CalendarWorkspace>[0]) {
  return <div className="year-grid">{Array.from({ length: 12 }, (_, month) => <section className="mini-month" key={month}><h3>{new Date(cursor.getFullYear(), month).toLocaleDateString(undefined, { month: 'long' })}</h3><div>{Array.from({ length: new Date(cursor.getFullYear(), month + 1, 0).getDate() }, (_, index) => { const day = new Date(cursor.getFullYear(), month, index + 1, 12); const key = dateKey(day); return <button key={key} className={events.some((event) => datesFor(event).includes(key)) ? 'has-event' : ''} onClick={() => { setCursor(day); setView('month'); }}>{day.getDate()}</button>; })}</div></section>)}</div>;
}
function Agenda({ events, store, edit }: { events: CalendarEvent[]; store: Store; edit: (event: CalendarEvent) => void }) {
  const rows = events.flatMap((event) => event.occurrences.map((occurrence) => ({ event, occurrence }))).sort((a, b) => a.occurrence.start_time.localeCompare(b.occurrence.start_time));
  return <div className="agenda">{rows.map(({ event, occurrence }) => <button key={occurrence.id} onClick={() => edit(event)}><span style={{ background: categoryFor(store, event.category_id).color }} /><strong>{shortDate(occurrence.date)}</strong><div><b>{event.title}</b><small>{timeLabel(occurrence.start_time)} · {event.venue}</small></div></button>)}</div>;
}

function EventEditor({ event, store, user, close, save, remove }: { event: CalendarEvent; store: Store; user: User; close: () => void; save: (event: CalendarEvent) => void; remove: (event: CalendarEvent) => void }) {
  const [draft, setDraft] = useState(event); const [sharedStart, setSharedStart] = useState(timeInput(event.occurrences[0].start_time)); const [sharedEnd, setSharedEnd] = useState(timeInput(event.occurrences[0].end_time));
  const set = (key: keyof CalendarEvent, value: unknown) => setDraft((item) => ({ ...item, [key]: value }));
  const updateOccurrence = (id: string, key: 'date' | 'start' | 'end', value: string) => setDraft((item) => ({ ...item, occurrences: item.occurrences.map((occurrence) => occurrence.id !== id ? occurrence : key === 'date' ? { ...occurrence, date: value, start_time: localIso(value, timeInput(occurrence.start_time)), end_time: localIso(value, timeInput(occurrence.end_time)) } : { ...occurrence, [key === 'start' ? 'start_time' : 'end_time']: localIso(occurrence.date, value) }) }));
  return <aside className="editor"><header><div><span className="eyebrow">Event schedule</span><h2>{store.events.some((item) => item.id === draft.id) ? 'Edit event' : 'Post event'}</h2></div><button onClick={close}>×</button></header>
    <div className="editor-body">
      <label>Title<input value={draft.title} onChange={(event) => set('title', event.target.value)} /></label><div className="two"><label>Type<input value={draft.event_type} onChange={(event) => set('event_type', event.target.value)} /></label><label>Venue<input value={draft.venue} onChange={(event) => set('venue', event.target.value)} /></label></div>
      <div className="shared"><strong>Shared daily schedule</strong><div className="three"><input type="time" value={sharedStart} onChange={(event) => setSharedStart(event.target.value)} /><input type="time" value={sharedEnd} onChange={(event) => setSharedEnd(event.target.value)} /><button onClick={() => setDraft((item) => ({ ...item, occurrences: item.occurrences.map((occurrence) => ({ ...occurrence, start_time: localIso(occurrence.date, sharedStart), end_time: localIso(occurrence.date, sharedEnd) })) }))}>Apply</button></div></div>
      <div className="occurrences"><strong>Daily rows</strong>{draft.occurrences.map((occurrence) => <div className="occurrence" key={occurrence.id}><input type="date" value={occurrence.date} onChange={(event) => updateOccurrence(occurrence.id, 'date', event.target.value)} /><input type="time" value={timeInput(occurrence.start_time)} onChange={(event) => updateOccurrence(occurrence.id, 'start', event.target.value)} /><input type="time" value={timeInput(occurrence.end_time)} onChange={(event) => updateOccurrence(occurrence.id, 'end', event.target.value)} /><button onClick={() => setDraft((item) => ({ ...item, occurrences: item.occurrences.filter((row) => row.id !== occurrence.id) }))}>×</button></div>)}</div>
      <button className="secondary" onClick={() => setDraft((item) => ({ ...item, occurrences: [...item.occurrences, occurrencesForDates([nextDateKey(item.occurrences.at(-1)!.date)], sharedStart, sharedEnd)[0]] }))}>+ Add day</button>
      <div className="two"><label>Category<select value={draft.category_id} onChange={(event) => set('category_id', event.target.value)}>{store.categories.filter((item) => item.active).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>Privacy<select value={draft.privacy_level} onChange={(event) => set('privacy_level', event.target.value)}><option value="basic">Public details</option><option value="internal">Internal only</option></select></label></div>
      <label>Short public description<textarea value={draft.public_description} onChange={(event) => set('public_description', event.target.value)} /></label><label>Purpose<textarea value={draft.purpose} onChange={(event) => set('purpose', event.target.value)} /></label><label>Contact email or number<input value={draft.contact_info} onChange={(event) => set('contact_info', event.target.value)} /></label>
    </div><footer>{store.events.some((item) => item.id === draft.id) && canEdit(user, draft) ? <button className="danger" onClick={() => remove(draft)}>Delete</button> : <span />}<button className="primary" onClick={() => void save(draft)}>Save event</button></footer>
  </aside>;
}

function DayPanel({ date, events, store, close, edit }: { date: string; events: CalendarEvent[]; store: Store; close: () => void; edit: (event: CalendarEvent) => void }) {
  const items = events.filter((event) => datesFor(event).includes(date));
  return <aside className="day-panel"><header><div><span className="eyebrow">Selected date</span><h2>{fromDateKey(date).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</h2></div><button onClick={close}>×</button></header>{items.length ? items.map((event) => { const occurrence = event.occurrences.find((item) => item.date === date)!; return <button className="day-card" key={event.id} style={{ borderLeftColor: categoryFor(store, event.category_id).color }} onClick={() => edit(event)}><strong>{event.title}</strong><span>{timeLabel(occurrence.start_time)} to {timeLabel(occurrence.end_time)}</span><small>{event.organization_name} · {event.venue}</small><p>{event.public_description}</p></button>; }) : <p>No public events scheduled.</p>}</aside>;
}
function Dashboard({ store, events }: { store: Store; events: CalendarEvent[] }) { return <Workspace title="Dashboard"><div className="metrics"><Metric label="Visible events" value={events.length} /><Metric label="Organizations" value={store.organizations.length} /><Metric label="Announcements" value={store.announcements.length} /><Metric label="Open concerns" value={store.concerns.filter((item) => !['resolved', 'rejected'].includes(item.status)).length} /></div></Workspace>; }
function Metric({ label, value }: { label: string; value: number }) { return <article className="metric"><strong>{value}</strong><span>{label}</span></article>; }
function Announcements({ store, user, persist }: { store: Store; user: User; persist: (store: Store, message: string) => void }) {
  function add() { const title = prompt('Announcement title:')?.trim(), content = prompt('Announcement message:')?.trim(); if (!title || !content) return; const item: Announcement = { id: createId(), title, content, priority: 'normal', posted_by: user.full_name, posted_at: new Date().toISOString() }; void persist({ ...store, announcements: [...store.announcements, item] }, 'Announcement posted.'); }
  return <Workspace title="Announcements">{user.role === 'super_admin' && <button className="primary" onClick={add}>+ Post announcement</button>}{store.announcements.map((item) => <article className="list-card" key={item.id}><strong>{item.title}</strong><p>{item.content}</p>{user.role === 'super_admin' && <button className="danger-link" onClick={() => void persist({ ...store, announcements: store.announcements.filter((row) => row.id !== item.id) }, 'Announcement deleted.')}>Delete</button>}</article>)}</Workspace>;
}
function Concerns({ store, user, persist }: { store: Store; user: User; persist: (store: Store, message: string) => void }) {
  const items = user.role === 'super_admin' ? store.concerns : store.concerns.filter((item) => item.organization_id === user.organization_id);
  function add() { const title = prompt('Concern title:')?.trim(), description = prompt('Describe the concern:')?.trim(); const org = store.organizations.find((item) => item.id === user.organization_id); if (!title || !description || !org) return; const now = new Date().toISOString(); const item: Concern = { id: createId(), title, description, organization_id: org.id, organization_name: org.organization_name, category: 'general', priority: 'normal', status: 'pending', created_at: now, updated_at: now }; void persist({ ...store, concerns: [...store.concerns, item] }, 'Concern submitted.'); }
  return <Workspace title="Concerns">{user.role === 'organization_manager' && <button className="primary" onClick={add}>+ Raise concern</button>}{items.map((item) => <article className="list-card" key={item.id}><strong>{item.title}</strong><p>{item.description}</p><small>{item.organization_name} · {item.status}</small>{user.role === 'super_admin' && <button onClick={() => void persist({ ...store, concerns: store.concerns.map((row) => row.id === item.id ? { ...row, status: 'resolved', updated_at: new Date().toISOString() } : row) }, 'Concern resolved.')}>Resolve</button>}</article>)}</Workspace>;
}
function Admin({ store, user, persist, reload }: { store: Store; user: User; persist: (store: Store, message: string) => void; reload: (message?: string) => void }) {
  if (user.role !== 'super_admin') return <Workspace title="Admin tools"><p>Admin access required.</p></Workspace>;
  function addBlock() { const title = prompt('Blocked period title:')?.trim(), date = prompt('Date (YYYY-MM-DD):')?.trim(); if (!title || !date) return; const item = { id: createId(), title, start_time: localIso(date, '08:00'), end_time: localIso(date, '17:00'), reason: title, all_day: true }; void persist({ ...store, blockedTimes: [...store.blockedTimes, item] }, 'Blocked period added.'); }
  function addCategory() { const name = prompt('Category name:')?.trim(); if (!name) return; const item: Category = { id: createId(), name, color: '#3568a6', active: true }; void persist({ ...store, categories: [...store.categories, item] }, 'Category added.'); }
  function addOrganization() { const organization_name = prompt('Organization name:')?.trim(); if (!organization_name) return; const item = { id: createId(), organization_name, organization_type: 'University organization' }; void persist({ ...store, organizations: [...store.organizations, item] }, 'Organization added.'); }
  function review(event: CalendarEvent, approval_status: CalendarEvent['approval_status']) { void persist({ ...store, events: store.events.map((item) => item.id === event.id ? { ...item, approval_status, updated_at: new Date().toISOString() } : item) }, `Event ${approval_status}.`); }
  return <Workspace title="Admin tools"><h3>Event review</h3>{store.events.filter((item) => item.approval_status === 'pending').map((item) => <article className="list-card" key={item.id}><strong>{item.title}</strong><p>{item.organization_name} · {item.venue}</p><button onClick={() => review(item, 'approved')}>Approve</button><button className="danger-link" onClick={() => review(item, 'rejected')}>Reject</button></article>)}<h3>Pending accounts</h3>{store.accountRequests.filter((item) => item.status === 'pending').map((item) => <Account key={item.id} item={item} reload={reload} />)}<h3>Blocked periods</h3><button className="primary" onClick={addBlock}>+ Block date</button>{store.blockedTimes.map((item) => <article className="list-card" key={item.id}><strong>{item.title}</strong><p>{item.start_time} to {item.end_time}</p><button className="danger-link" onClick={async () => { await deleteRecord('blockedTimes', item.id); await reload('Blocked period removed.'); }}>Remove</button></article>)}<h3>Categories</h3><button className="primary" onClick={addCategory}>+ Add category</button>{store.categories.map((item) => <article className="list-card" key={item.id}><strong>{item.name}</strong><button onClick={() => void persist({ ...store, categories: store.categories.map((row) => row.id === item.id ? { ...row, active: !row.active } : row) }, 'Category updated.')}>{item.active ? 'Deactivate' : 'Activate'}</button></article>)}<h3>Organizations</h3><button className="primary" onClick={addOrganization}>+ Add organization</button>{store.organizations.map((item) => <article className="list-card" key={item.id}><strong>{item.organization_name}</strong><p>{item.organization_type}</p></article>)}<h3>Activity log</h3>{store.activityLogs.slice(-12).reverse().map((item) => <article className="list-card" key={item.id}><strong>{item.action}</strong><p>{item.description}</p><small>{item.performed_by} · {item.created_at}</small></article>)}</Workspace>;
}
function Account({ item, reload }: { item: AccountRequest; reload: (message?: string) => void }) { return <article className="list-card"><strong>{item.full_name}</strong><p>@{item.username} · {item.role}</p><button onClick={async () => { await decideAccount(item.id, 'approved'); await reload('Account approved.'); }}>Approve</button><button className="danger-link" onClick={async () => { await decideAccount(item.id, 'rejected'); await reload('Account rejected.'); }}>Reject</button></article>; }
function Workspace({ title, children }: { title: string; children: React.ReactNode }) { return <section className="workspace"><span className="eyebrow">CORE workspace</span><h1>{title}</h1>{children}</section>; }
function Auth({ user, close, reload }: { user: User; close: () => void; reload: (message?: string) => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login'); const [error, setError] = useState('');
  async function submit(event: React.FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); try { if (mode === 'login') { await login(String(data.get('username')), String(data.get('password'))); await reload('Logged in.'); } else { await requestAccount({ username: String(data.get('username')), password: String(data.get('password')), fullName: String(data.get('fullName')), role: String(data.get('role')), organizationName: String(data.get('organizationName')) }); setError('Account request sent for admin approval.'); return; } close(); } catch (reason) { setError(reason instanceof Error ? reason.message : 'Authentication failed.'); } }
  return <div className="modal"><form onSubmit={submit}><header><h2>{mode === 'login' ? 'Account login' : 'Request an account'}</h2><button type="button" onClick={close}>×</button></header>{error && <p className="error">{error}</p>}{user.role !== 'public_viewer' ? <button type="button" onClick={() => { logout(); void reload('Logged out.'); close(); }}>Continue as public viewer</button> : <><label>Username<input name="username" required /></label><label>Password<input name="password" type="password" required /></label>{mode === 'register' && <><label>Full name<input name="fullName" required /></label><label>Role<select name="role"><option value="organization_manager">Organization manager</option><option value="super_admin">Admin</option></select></label><label>Organization<input name="organizationName" required /></label></>}<button className="primary">{mode === 'login' ? 'Login' : 'Submit request'}</button><button type="button" className="link" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>{mode === 'login' ? 'Request an account' : 'Back to login'}</button></>}</form></div>;
}
