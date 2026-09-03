import { emptyPublicStore, normalizeStore, storeForPersistence } from './app-data.js?v=20260625-status-sync-v1';
import { currentUser, ensureAllowedAdminStore, isAllowedAdminEmail, isSuperAdmin } from './app-rules.js?v=20260625-status-sync-v1';
const { url } = window.SUPABASE_CONFIG;
const publishableKey = window.SUPABASE_CONFIG?.publishableKey || window.SUPABASE_CONFIG?.anonKey || window.SUPABASE_CONFIG?.apiKey || window.SUPABASE_CONFIG?.apikey || '';
const SESSION_KEY='core_supabase_auth_session', STORE_SYNC_SIGNAL_KEY='csc-sync-store-version', STORE_SYNC_CHANNEL='csc-sync-store';
const CALENDAR_DEFAULTS=Object.freeze({id:null,record_type:null,schedule_source:null,block_source:null,created_by_role:null,requires_approval:null,organization_id:null,organization_name:null,category_id:null,category_name:null,category_color:null,category_active:null,title:null,venue:null,schedule_type:null,start_time:null,end_time:null,occurrences:[],expected_attendees:null,privacy_level:null,contact_person:null,contact_info:null,public_description:null,purpose:null,repeat_until:null,recurrence_type:null,recurrence_until:null,approval_status:null,admin_recommendation:null,approval_date:null,reviewed_by:null,approved_by:null,revision_of:null,original_schedule_id:null,revision_status:null,request_type:null,request_reason:null,requester_id:null,revision_created_at:null,revision_submitted_at:null,revision_history:[],event_status:null,notification_status:null,notification_read_by:null,block_type:null,reason:null,created_by:null,created_at:null,updated_at:null});
const AUTHENTICATED_CALENDAR_ITEMS_QUERY='/rest/v1/calendar_items?select=*&order=created_at.asc';
const CONFERENCE_ROOM_BOOKINGS_QUERY='/rest/v1/conference_room_bookings?select=*&order=start_time.asc';
const PUBLIC_CALENDAR_ITEMS_QUERY='/rest/v1/calendar_items?select=*&record_type=eq.schedule&approval_status=eq.approved&event_status=in.(planned,finalized)&or=(privacy_level.is.null,privacy_level.neq.internal)&order=created_at.asc';
let lastEventIds=new Set(), refreshSessionPromise=null;
function session(){try{return JSON.parse(sessionStorage.getItem(SESSION_KEY)||'null')}catch{return null}}
function sessionExpiryMs(value=session()){
  const stored=Number(value?.expires_at||0);
  if(stored)return stored*1000;
  const token=String(value?.access_token||'');
  const parts=token.split('.');
  if(parts.length<2)return 0;
  try{
    const payload=JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    return Number(payload?.exp||0)*1000;
  }catch{return 0}
}
function sessionNeedsRefresh(value=session()){
  const expiry=sessionExpiryMs(value);
  return Boolean(value?.access_token&&value?.refresh_token&&expiry&&expiry<=Date.now()+60000);
}
async function ensureFreshSession(){
  if(!sessionNeedsRefresh())return;
  if(!refreshSessionPromise)refreshSessionPromise=refreshSession().finally(()=>{refreshSessionPromise=null});
  await refreshSessionPromise;
}
function headers(authenticated=false){const token=authenticated?session()?.access_token:publishableKey;return{apikey:publishableKey,Authorization:`Bearer ${token||publishableKey}`,'Content-Type':'application/json'}}
function body(payload){return JSON.stringify(payload,(_k,value)=>value===undefined?null:value)}
async function request(endpoint,options={},authenticated=false){if(authenticated&&!options.skipRefresh){try{await ensureFreshSession()}catch{clearSession()}}const response=await fetch(`${url}${endpoint}`,{...options,headers:{...headers(authenticated),...options.headers}});const payload=response.status===204?null:await response.json().catch(()=>({}));if(authenticated&&response.status===401&&session()?.refresh_token&&!options.skipRefresh){try{await refreshSession();return request(endpoint,{...options,skipRefresh:true},authenticated)}catch{clearSession()}}if(!response.ok){const error=new Error(payload?.message||payload?.error_description||payload?.error||payload?.msg||`Supabase request failed (${response.status})`);error.status=response.status;error.code=payload?.error_code||payload?.code||'';error.details=payload;throw error}return payload}async function rpc(name,payload={},authenticated=false){return request(`/rest/v1/rpc/${name}`,{method:'POST',body:body(payload)},authenticated)}
function currentEventIds(store){const events=store&&Array.isArray(store.events)?store.events:[];return new Set(events.map((event)=>event.id).filter(Boolean))}
function rememberEventIds(store){lastEventIds=currentEventIds(store)}
function removedEventIds(store){const nextEventIds=currentEventIds(store);return[...lastEventIds].filter((id)=>!nextEventIds.has(id))}
async function cleanupRemovedEvents(store){const failures=[];for(const id of removedEventIds(store)){try{await deleteRecord('events',id)}catch(error){failures.push({id,error})}}rememberEventIds(store);return failures}
export async function loadStore(){try{const store=await loadRelationalStore(Boolean(session()?.access_token));if(session()?.access_token){await mergeAuthenticatedProfiles(store);await mergeBlockedTimes(store,true);enforceAuthenticatedIdentity(store)}rememberEventIds(store);return{store,notice:'Connected to the authenticated Supabase backend.',noticeType:'success'}}catch(error){lastEventIds=new Set();return{store:emptyPublicStore(),notice:`Supabase is unavailable. ${error.message}`,noticeType:'error'}}}
export async function loadPublicStore(){try{return{store:await loadRelationalStore(),notice:'Connected to the public Supabase calendar.',noticeType:'success'}}catch(error){return{store:emptyPublicStore(),notice:`Supabase is unavailable. ${error.message}`,noticeType:'error'}}}
async function mergeBlockedTimes(store,authenticated=false){try{const rows=await request('/rest/v1/calendar_items?record_type=eq.blocked_time&select=*&order=start_time.asc',{},authenticated);if(!Array.isArray(rows))return;const byId=new Map((store.blockedTimes||[]).map((block)=>[block.id,block]));rows.filter((row)=>row.id).forEach((row)=>byId.set(row.id,{...(byId.get(row.id)||{}),...row,record_type:'blocked_time',block_source:'admin',created_by_role:'admin',requires_approval:false}));store.blockedTimes=[...byId.values()]}catch(error){console.warn('CONNECT blocked-time sync unavailable:',error)}}
async function loadConcernsTable(authenticated=false){
  if(!authenticated)return[];
  try{
    return await request('/rest/v1/concerns?select=*&order=created_at.desc',{},true);
  }catch(error){
    console.warn('CONNECT concerns sync unavailable:',error);
    return[];
  }
}
async function loadConferenceRoomBookingsTable(authenticated=false){
  try{
    return await request(CONFERENCE_ROOM_BOOKINGS_QUERY,{},authenticated);
  }catch(error){
    if(authenticated){
      try{
        return await request(CONFERENCE_ROOM_BOOKINGS_QUERY,{},false);
      }catch(fallbackError){
        console.warn('CONNECT conference room public fallback unavailable:',fallbackError);
      }
    }
    console.warn('CONNECT conference room sync unavailable:',error);
    return[];
  }
}
export async function loadAuthenticatedStore(){if(!session()?.access_token)throw new Error('Your session expired. Please log in again.');const store=await loadRelationalStore(true);await mergeAuthenticatedProfiles(store);await mergeBlockedTimes(store,true);enforceAuthenticatedIdentity(store);rememberEventIds(store);return store}
async function loadRelationalStore(authenticated=false){
  const[profiles,organizations,calendarItems,announcements,concerns,conferenceBookings]=await Promise.all([
    authenticated?request('/rest/v1/profiles?select=*',{},true):Promise.resolve([]),
    request('/rest/v1/organizations?select=*'),
    request(authenticated?AUTHENTICATED_CALENDAR_ITEMS_QUERY:PUBLIC_CALENDAR_ITEMS_QUERY,{},authenticated),
    request('/rest/v1/announcements?select=*',{},authenticated),
    loadConcernsTable(authenticated),
    loadConferenceRoomBookingsTable(authenticated)
  ]);
  const items=Array.isArray(calendarItems)?calendarItems:[];
  const organizationNames=new Map((organizations||[]).map((item)=>[item.id,item.organization_name]));
  const users=(profiles||[]).map(profileToUser);
  const activityStatuses=(profiles||[]).map(profileToActivityStatus).filter(Boolean);
  const normalizeSchedule=(item)=>({...item,record_type:'schedule',organization_name:organizationNames.get(item.organization_id)||item.organization_name||'',occurrences:jsonArray(item.occurrences),recurrence_type:normalizedRepeatRule(item.recurrence_type??item.repeat_rule??'none'),recurrence_until:item.recurrence_until??item.repeat_until??null});
  const conferenceRows=dedupeConferenceRoomRows(Array.isArray(conferenceBookings)?conferenceBookings:[]);
  const conferenceEvents=conferenceRows.filter((item)=>item&&item.id).map((item)=>normalizeSchedule({...item,record_type:'schedule',schedule_type:item.schedule_type||'conference_room_booking',venue:item.venue||'Conference Room',title:item.title||item.organization_name||'Conference Room Booking',event_type:item.event_type||item.booking_type||'Conference Room Booking',approval_status:item.approval_status||'pending',event_status:item.event_status||'planned',privacy_level:item.privacy_level||'internal'}));
  return normalizeStore({version:4,currentUserId:authenticatedUserId()||'public',users,activityStatuses,pendingAccounts:(profiles||[]).filter(isPendingOrganizationProfile).map(profileToAccountRequest),organizations:organizations||[],categories:[],announcements:announcements||[],concerns:Array.isArray(concerns)?dedupeConcernRecordsForPersistence(concerns):[],blockedTimes:items.filter((item)=>item.record_type==='blocked_time').map((item)=>({...item,record_type:'blocked_time',block_source:'admin',created_by_role:'admin',requires_approval:false})),events:[...items.filter((item)=>item.record_type==='schedule'&&!isConferenceRoomScheduleRecord(item)).map(normalizeSchedule),...conferenceEvents]})
}
async function mergeAuthenticatedProfiles(store){try{const profiles=await request('/rest/v1/profiles?select=*&order=created_at.asc',{},true);profiles.forEach((profile)=>mergeProfileUser(store,profile));store.pendingAccounts=profiles.filter(isPendingOrganizationProfile).map(profileToAccountRequest)}catch(error){console.warn('CONNECT account data merge unavailable:',error)}}
function isPendingOrganizationProfile(profile){return profile?.role==='organization_manager'&&profile.approval_status==='pending'}
function profileToAccountRequest(profile){return{id:profile.id,request_id:profile.id,user_id:profile.id,username:profile.username||profile.email||'',full_name:profile.full_name||'',aup_email:profile.email||'',contact_number:profile.contact_number||'',phone_number:profile.contact_number||'',organization_name:profile.organization_name||'',organizationName:profile.organization_name||'',status:profile.approval_status||'pending',created_at:profile.created_at,updated_at:profile.updated_at}}
function profileToUser(profile){return{...profile,username:profile.username||profile.email,permissions:{...(profile.permissions||{}),enabled:Boolean(profile.is_enabled)}}}
function profileToActivityStatus(profile={}){const email=String(profile.email||'').trim().toLowerCase();const accountType=email==='cscadviser@aup.edu.ph'?'OIC':email==='president@aup.edu.ph'?'CSC':'';const activityStatus=profile.activity_status||profile.status_label;if(!accountType||!activityStatus||String(activityStatus).trim().toLowerCase()==='status not posted')return null;return{id:accountType.toLowerCase(),account_id:profile.id||email,account_type:accountType,activity_status:activityStatus,status_label:profile.status_label||activityStatus,updated_by:profile.status_updated_by||profile.full_name||'',updated_at:profile.status_updated_at||profile.updated_at||profile.created_at||new Date().toISOString(),created_at:profile.created_at||profile.status_updated_at||new Date().toISOString()}}
function mergeProfileUser(store,profile){if(!profile?.id)return;if(!Array.isArray(store.users))store.users=[];const isOrganizationAccount=profile.role==='organization_manager'||profile.account_preset==='organization';const existing=store.users.find((user)=>user.id===profile.id||String(user.email||'').toLowerCase()===String(profile.email||'').toLowerCase()||String(user.username||'').toLowerCase()===String(profile.username||'').toLowerCase());const messengerAccount=profile.messenger_account||profile.messengerAccount||existing?.messenger_account||existing?.messengerAccount||'';const next={id:profile.id,username:profile.username||profile.email||existing?.username||'',full_name:profile.full_name||existing?.full_name||profile.username||profile.email||'Account',role:profile.role||existing?.role||'organization_manager',account_preset:profile.account_preset||existing?.account_preset||(profile.role==='super_admin'?'manager':'organization'),account_type:profile.account_type||existing?.account_type||(isOrganizationAccount?'org':'CSC'),organization_id:profile.organization_id||existing?.organization_id||'',organization_name:profile.organization_name||existing?.organization_name||existing?.organizationName||'',organizationName:profile.organization_name||existing?.organizationName||existing?.organization_name||'',email:profile.email||existing?.email||'',aup_email:profile.email||existing?.aup_email||'',contact_number:profile.contact_number||profile.phone_number||existing?.contact_number||'',phone_number:profile.phone_number||profile.contact_number||existing?.phone_number||'',messenger_account:messengerAccount,messengerAccount,suspended_status:Boolean(profile.suspension_status||existing?.suspended_status),suspension_status:Boolean(profile.suspension_status||existing?.suspension_status),suspension_date:profile.suspension_date||existing?.suspension_date||'',deletion_logs:profile.deletion_logs||existing?.deletion_logs||[],modification_logs:profile.modification_logs||existing?.modification_logs||[],created_at:profile.created_at||existing?.created_at||new Date().toISOString(),updated_at:profile.updated_at||existing?.updated_at||profile.created_at||new Date().toISOString(),permissions:{...(existing?.permissions||{}),...jsonObject(profile.permissions),enabled:Boolean(profile.is_enabled)}};if(existing)Object.assign(existing,next);else store.users.push(next)}
function jsonObject(value){if(value&&typeof value==='object'&&!Array.isArray(value))return value;if(typeof value!=='string'||!value.trim())return{};try{const parsed=JSON.parse(value);return parsed&&typeof parsed==='object'&&!Array.isArray(parsed)?parsed:{}}catch{return{}}}
function jsonArray(value){if(Array.isArray(value))return value;if(typeof value!=='string'||!value.trim())return[];try{const parsed=JSON.parse(value);return Array.isArray(parsed)?parsed:[]}catch{return[]}}
function dedupeConferenceRoomRows(rows=[]){const byId=new Map();(rows||[]).filter((row)=>row&&row.id).forEach((row)=>{const existing=byId.get(row.id);if(!existing||new Date(row.updated_at||row.created_at||0)>=new Date(existing.updated_at||existing.created_at||0))byId.set(row.id,row)});return[...byId.values()]}
function enforceAuthenticatedIdentity(store){const email=authenticatedEmail();const userId=authenticatedUserId();if(!email)return store;if(isAllowedAdminEmail(email))return ensureAllowedAdminStore(store,email,userId);const user=store.users.find((item)=>item.id===userId);if(user)store.currentUserId=user.id;return store}
export async function saveStore(store,{skipRecordSync=false}={}){const persistenceStore=storeForPersistence(store);const tableFailures=skipRecordSync?[]:await syncRecordTables(persistenceStore);const statusFailures=await syncActivityStatusProfiles(persistenceStore);const criticalFailures=tableFailures.filter((failure)=>failure.table==='calendar_items');if(criticalFailures.length){console.warn('CONNECT relational table sync reported errors after store save:',tableFailures);const details=criticalFailures.map((failure)=>`${failure.table}: ${recordSyncFailureMessage(failure.error)}`).join(' ');throw new Error(`Database record sync failed. ${details}`)}if(statusFailures.length){const details=statusFailures.map((failure)=>`${failure.account_type}: ${recordSyncFailureMessage(failure.error)}`).join(' ');throw new Error(`Activity status sync failed. ${details}`)}if(tableFailures.length)console.warn('CONNECT non-calendar table sync reported errors after store save:',tableFailures);const deleteFailures=await cleanupRemovedEvents(store);if(deleteFailures.length)console.warn('CONNECT delete cleanup RPC reported errors after store save:',deleteFailures);broadcastStoreSync();return{deleteFailures,tableFailures,statusFailures}}
function recordSyncFailureMessage(error){const message=String(error?.message||'Unknown error');if(/concerns|relation.*concerns.*does not exist/i.test(message))return'The concerns database update is not installed. Run supabase-concerns.sql in Supabase, refresh the portal, then save again.';if(/calendar_items|relation.*does not exist/i.test(message))return'The unified calendar database update is not installed. Run supabase-unified-calendar.sql in Supabase, refresh the portal, then save again.';return message}
function broadcastStoreSync(){try{localStorage.setItem(STORE_SYNC_SIGNAL_KEY,String(Date.now()))}catch{}try{const channel=new BroadcastChannel(STORE_SYNC_CHANNEL);channel.postMessage({updated_at:Date.now()});channel.close()}catch{}}
async function syncRecordTables(store){if(!session()?.access_token)return[];const failures=[];let organizationIds=new Map();try{organizationIds=await syncOrganizationsTable(store)}catch(error){failures.push({table:'organizations',error})}await syncCalendarItemsTable(store,organizationIds).catch((error)=>failures.push({table:'calendar_items',error}));if(isAllowedAdminEmail(authenticatedEmail()))await syncAnnouncementsTable(store).catch((error)=>failures.push({table:'announcements',error}));await syncConcernsTable(store,organizationIds).catch((error)=>failures.push({table:'concerns',error}));return failures}
async function syncActivityStatusProfiles(store){if(!session()?.access_token)return[];const user=currentUser(store);const failures=[];const targets={CSC:'president@aup.edu.ph',OIC:'cscadviser@aup.edu.ph'};const statuses=(store.activityStatuses||[]).filter((status)=>status.account_id&&status.account_id===user.id&&targets[status.account_type]);for(const status of statuses){const now=status.updated_at||new Date().toISOString();const existing=await latestProfileStatus(targets[status.account_type]).catch(()=>null);if(existing&&new Date(existing.status_updated_at||existing.updated_at||0)>new Date(now))continue;try{await request(`/rest/v1/profiles?email=eq.${encodeURIComponent(targets[status.account_type])}`,{method:'PATCH',headers:{Prefer:'return=minimal'},body:body({account_type:status.account_type,activity_status:status.activity_status,status_label:status.status_label||status.activity_status,status_updated_by:status.updated_by||user.full_name||user.username||authenticatedEmail(),status_updated_at:now,updated_at:now})},true)}catch(error){failures.push({account_type:status.account_type,error})}}return failures}
async function latestProfileStatus(email){const rows=await request(`/rest/v1/profiles?select=email,status_updated_at,updated_at&email=eq.${encodeURIComponent(email)}&limit=1`,{},true);return Array.isArray(rows)?rows[0]:null}
async function syncOrganizationsTable(store){const organizationIds=new Map();const existingRows=await request('/rest/v1/organizations?select=id,organization_name',{},true);const existingOrganizations=Array.isArray(existingRows)?existingRows:[];const existingById=new Map(existingOrganizations.filter((organization)=>organization.id).map((organization)=>[String(organization.id),organization.id]));const existingByName=new Map(existingOrganizations.filter((organization)=>organization.organization_name).map((organization)=>[String(organization.organization_name).trim().toLowerCase(),organization.id]));for(const organization of store.organizations||[]){const sourceId=String(organization.id||'').trim();const organizationName=String(organization.organization_name||organization.name||'').trim();const resolvedId=existingById.get(sourceId)||existingByName.get(organizationName.toLowerCase())||uuidOrNull(sourceId);if(!resolvedId)continue;if(sourceId)organizationIds.set(`id:${sourceId}`,resolvedId);if(organizationName)organizationIds.set(`name:${organizationName.toLowerCase()}`,resolvedId)}if(!isAllowedAdminEmail(authenticatedEmail()))return organizationIds;const candidates=(store.organizations||[]).filter((org)=>org.id&&(org.organization_name||org.name)).map((org)=>({source_id:org.id,id:uuidOrNull(org.id),organization_name:String(org.organization_name||org.name).trim(),organization_type:org.organization_type||org.type||'Organization',updated_at:org.updated_at||new Date().toISOString()}));const byName=new Map();candidates.forEach((organization)=>{const key=organization.organization_name.toLowerCase();const existing=byName.get(key);if(!existing||new Date(organization.updated_at)>=new Date(existing.updated_at))byName.set(key,organization)});for(const organization of byName.values()){const resolvedExistingId=existingByName.get(organization.organization_name.toLowerCase())||organization.id;const payload={...(resolvedExistingId?{id:resolvedExistingId}:{}),organization_name:organization.organization_name,organization_type:organization.organization_type||'Organization',updated_at:organization.updated_at||new Date().toISOString()};const saved=await request('/rest/v1/organizations?on_conflict=organization_name',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},body:body(payload)},true);const savedRow=Array.isArray(saved)?saved[0]:saved;const resolvedId=savedRow?.id||resolvedExistingId;if(!resolvedId)continue;organizationIds.set(`id:${organization.source_id}`,resolvedId);organizationIds.set(`name:${organization.organization_name.toLowerCase()}`,resolvedId)}return organizationIds}
async function syncCalendarItemsTable(store,organizationIds=new Map()){const user=currentUser(store),authUserId=authenticatedUserId(),now=new Date().toISOString();const schedules=(store.events||[]).filter((event)=>event.record_type==='schedule'&&!isConferenceRoomScheduleRecord(event)).filter(isRelationalScheduleReady).filter((event)=>isSuperAdmin(store)||event.created_by===user.id||event.created_by===authUserId||(!uuidOrNull(event.created_by)&&normalizedScheduleSource(event)==='organization')).map((event)=>{const eventId=uuidOrNull(event.id)||createUuid();event.id=eventId;const scheduleSource=normalizedScheduleSource(event);const approvalStatus=normalizedApprovalStatus(event,scheduleSource);const eventStatus=normalizedEventStatus(event.event_status);const privacyLevel=normalizedPrivacyLevel(event.privacy_level);const recurrenceType=normalizedRepeatRule(event.recurrence_type);return calendarItemRow({id:eventId,record_type:'schedule',schedule_source:scheduleSource,created_by_role:scheduleSource,requires_approval:scheduleSource!=='admin',organization_id:uuidOrNull(organizationIds.get(`id:${event.organization_id}`)||organizationIds.get(`name:${String(event.organization_name||'').trim().toLowerCase()}`)||event.organization_id||null),organization_name:String(event.organization_name||'').trim()||null,category_id:event.category_id,title:event.title,venue:event.venue,schedule_type:recurrenceType?'single_day':(event.schedule_type||(Array.isArray(event.occurrences)&&event.occurrences.length>1?'multi_day':'single_day')),start_time:event.start_time,end_time:event.end_time,occurrences:Array.isArray(event.occurrences)?event.occurrences:[],expected_attendees:normalizedAttendeeCount(event.expected_attendees),privacy_level:privacyLevel,contact_person:event.contact_person,contact_info:event.contact_info,public_description:event.public_description,purpose:event.purpose,repeat_until:event.recurrence_until||event.repeat_until||null,recurrence_type:recurrenceType,recurrence_until:event.recurrence_until||event.repeat_until||null,approval_status:approvalStatus,admin_recommendation:event.admin_recommendation||null,approval_date:scheduleSource==='admin'?(event.approval_date||event.created_at||now):(event.approval_date||null),approved_by:uuidOrNull(event.approved_by),reviewed_by:uuidOrNull(event.reviewed_by),revision_of:event.revision_of||null,original_schedule_id:event.original_schedule_id||null,revision_status:event.revision_status||null,request_type:event.request_type||null,request_reason:event.request_reason||null,requester_id:uuidOrNull(event.requester_id),revision_created_at:event.revision_created_at||null,revision_submitted_at:event.revision_submitted_at||null,revision_history:Array.isArray(event.revision_history)?event.revision_history:[],event_status:eventStatus,notification_status:event.notification_status||null,notification_read_by:event.notification_read_by&&typeof event.notification_read_by==='object'?event.notification_read_by:null,created_by:uuidOrNull(event.created_by)||uuidOrNull(user.id)||uuidOrNull(authUserId),created_at:event.created_at||now,updated_at:event.updated_at||event.created_at||now})});const blocks=(store.blockedTimes||[]).filter((block)=>uuidOrNull(block.id)&&block.record_type==='blocked_time').map((block)=>calendarItemRow({id:block.id,record_type:'blocked_time',block_source:'admin',created_by_role:'admin',requires_approval:false,title:block.title,block_type:block.block_type,start_time:block.start_time,end_time:block.end_time,reason:block.reason||null,approval_status:'approved',event_status:'planned',created_by:uuidOrNull(block.created_by)||uuidOrNull(user.id),created_at:block.created_at||now,updated_at:block.updated_at||block.created_at||now}));await upsertCalendarItemRows(schedules);if(isSuperAdmin(store))await upsertCalendarItemRows(blocks)}
async function syncAnnouncementsTable(store){
  if(!session()?.access_token)return;
  const now=new Date().toISOString();
  const user=currentUser(store);
  const announcements=(store.announcements||[])
    .filter((announcement)=>announcement&&announcement.id&&announcement.title&&announcement.content)
    .map((announcement)=>({
      id:String(announcement.id),
      title:String(announcement.title||'').trim(),
      content:String(announcement.content||'').trim(),
      visibility_status:announcement.visibility_status||'show',
      created_by:uuidOrNull(announcement.created_by)||uuidOrNull(user.id)||null,
      created_by_email:announcement.created_by_email||announcement.source_email||authenticatedEmail()||null,
      source_council:announcement.source_council||announcement.council_name||null,
      source_email:announcement.source_email||announcement.created_by_email||authenticatedEmail()||null,
      posted_by:announcement.posted_by||(!uuidOrNull(announcement.created_by)?announcement.created_by:'')||user.full_name||user.username||null,
      posted_at:announcement.posted_at||announcement.created_at||now,
      created_at:announcement.created_at||announcement.posted_at||now,
      updated_at:announcement.updated_at||announcement.created_at||now
    }));
  await upsertAnnouncementRows(announcements);
}
async function upsertAnnouncementRows(rows){
  if(!rows.length)return;
  let retryRows=rows;
  const strippedColumns=new Set();
  for(let attempt=0;attempt<10;attempt++){
    try{
      await request('/rest/v1/announcements?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:body(retryRows)},true);
      if(strippedColumns.size)console.warn('CONNECT announcements save skipped unsupported columns:',[...strippedColumns]);
      return;
    }catch(error){
      const missing=missingAnnouncementsColumn(error);
      if(!missing||strippedColumns.has(missing))throw error;
      strippedColumns.add(missing);
      retryRows=retryRows.map((row)=>{const next={...row};delete next[missing];return next});
    }
  }
  throw new Error(`Announcement save failed after removing unsupported columns: ${[...strippedColumns].join(', ')}`);
}
function missingAnnouncementsColumn(error){const text=`${error?.message||''} ${JSON.stringify(error?.details||{})}`;const match=text.match(/'([^']+)' column of 'announcements'|Could not find the '([^']+)' column/i);return match?.[1]||match?.[2]||''}async function syncConcernsTable(store,organizationIds=new Map()){
  if(!session()?.access_token)return;
  const user=currentUser(store),now=new Date().toISOString();
  const concerns=dedupeConcernRecordsForPersistence(store.concerns||[])
    .filter((concern)=>uuidOrNull(concern.id))
    .filter((concern)=>isSuperAdmin(store)||concern.created_by===user.id||concern.organization_id===user.organization_id)
    .map((concern)=>{
      const organizationName=String(concern.organization_name||'').trim();
      const organizationId=uuidOrNull(organizationIds.get(`id:${concern.organization_id}`)||organizationIds.get(`name:${organizationName.toLowerCase()}`)||concern.organization_id||user.organization_id||null);
      return{
        id:concern.id,
        organization_id:organizationId,
        organization_name:organizationName||null,
        title:concern.title||'Untitled concern',
        category:concern.category||'Other concerns',
        priority:concern.priority||'normal',
        description:concern.description||'',
        status:concern.status||'pending',
        admin_response:concern.admin_response||null,
        resolved_by:concern.resolved_by||null,
        resolved_at:concern.resolved_at||null,
        created_by:uuidOrNull(concern.created_by)||uuidOrNull(user.id),
        created_at:concern.created_at||now,
        updated_at:concern.updated_at||concern.created_at||now
      };
    });
  if(!concerns.length)return;
  await request('/rest/v1/concerns?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:body(concerns)},true);
}
function dedupeConcernRecordsForPersistence(concerns=[]){
  const byKey=new Map();
  concerns.filter(Boolean).forEach((concern)=>{
    const key=concernPersistenceKey(concern);
    const existing=byKey.get(key);
    byKey.set(key,existing?mergeConcernForPersistence(existing,concern):{...concern});
  });
  return[...byKey.values()];
}
function concernPersistenceKey(concern={}){
  const createdMinute=String(concern.created_at||'').slice(0,16);
  return[
    String(concern.organization_name||'').trim().toLowerCase(),
    String(concern.title||'').trim().toLowerCase(),
    String(concern.category||'').trim().toLowerCase(),
    String(concern.description||'').trim().toLowerCase(),
    createdMinute
  ].join('|');
}
function mergeConcernForPersistence(existing={},incoming={}){
  const identitySource=concernIdentityScore(incoming)>concernIdentityScore(existing)?incoming:existing;
  const statusSource=concernStatusRank(incoming.status)>concernStatusRank(existing.status)?incoming:existing;
  const newestSource=new Date(incoming.updated_at||incoming.created_at||0)>new Date(existing.updated_at||existing.created_at||0)?incoming:existing;
  return{
    ...existing,
    ...newestSource,
    id:uuidOrNull(identitySource.id)||uuidOrNull(existing.id)||uuidOrNull(incoming.id)||existing.id||incoming.id,
    organization_id:uuidOrNull(identitySource.organization_id)||uuidOrNull(existing.organization_id)||uuidOrNull(incoming.organization_id)||null,
    organization_name:identitySource.organization_name||existing.organization_name||incoming.organization_name||'',
    created_by:uuidOrNull(identitySource.created_by)||uuidOrNull(existing.created_by)||uuidOrNull(incoming.created_by)||null,
    status:statusSource.status||newestSource.status||existing.status||incoming.status||'pending',
    admin_response:statusSource.admin_response||newestSource.admin_response||existing.admin_response||incoming.admin_response||null,
    resolved_by:uuidOrNull(statusSource.resolved_by)||uuidOrNull(newestSource.resolved_by)||uuidOrNull(existing.resolved_by)||uuidOrNull(incoming.resolved_by)||null,
    resolved_at:statusSource.resolved_at||newestSource.resolved_at||existing.resolved_at||incoming.resolved_at||null
  };
}
function concernIdentityScore(concern={}){
  return(uuidOrNull(concern.id)?4:0)+(uuidOrNull(concern.created_by)?3:0)+(uuidOrNull(concern.organization_id)?2:0)+(String(concern.organization_name||'').trim()?1:0);
}
function concernStatusRank(status=''){
  const value=String(status||'').toLowerCase();
  if(value==='resolved'||value==='solved')return 4;
  if(value==='in_review'||value==='reviewing')return 3;
  if(value==='rejected'||value==='dismissed')return 2;
  return 1;
}
function calendarItemRow(values){const row={...CALENDAR_DEFAULTS,...values};if(!Array.isArray(row.occurrences))row.occurrences=[];if(!Array.isArray(row.revision_history))row.revision_history=[];return Object.fromEntries(Object.entries(row).map(([key,value])=>[key,value===undefined?null:value]))}
async function upsertCalendarItemRows(rows){if(!rows.length)return;let retryRows=rows;const strippedColumns=new Set();for(let attempt=0;attempt<12;attempt++){try{await request('/rest/v1/calendar_items?on_conflict=id',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal'},body:body(retryRows)},true);if(strippedColumns.size)console.warn('CONNECT calendar_items save skipped unsupported columns:',[...strippedColumns]);return}catch(error){const missing=missingSchemaColumn(error);if(missing&&!strippedColumns.has(missing)){strippedColumns.add(missing);retryRows=retryRows.map((row)=>{const next={...row};delete next[missing];return next});continue}await upsertCalendarItemRowsIndividually(retryRows);return}}throw new Error(`Calendar save failed after removing unsupported columns: ${[...strippedColumns].join(', ')}`)}
async function upsertCalendarItemRowsIndividually(rows){let retryRows=rows;const strippedColumns=new Set();for(let attempt=0;attempt<12;attempt++){try{for(const row of retryRows){const id=encodeURIComponent(row.id);const patched=await request(`/rest/v1/calendar_items?id=eq.${id}`,{method:'PATCH',headers:{Prefer:'return=representation'},body:body(row)},true);if(Array.isArray(patched)&&patched.length)continue;await request('/rest/v1/calendar_items',{method:'POST',headers:{Prefer:'return=minimal'},body:body(row)},true)}return}catch(error){const missing=missingSchemaColumn(error);if(!missing||strippedColumns.has(missing))throw error;strippedColumns.add(missing);retryRows=retryRows.map((row)=>{const next={...row};delete next[missing];return next})}}}
function missingSchemaColumn(error){const text=`${error?.message||''} ${JSON.stringify(error?.details||{})}`;const match=text.match(/'([^']+)' column of 'calendar_items'|Could not find the '([^']+)' column/i);return match?.[1]||match?.[2]||''}
function uuidOrNull(value){const text=String(value||'');return/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(text)?text:null}
function createUuid(){const cryptoApi=globalThis.crypto;if(cryptoApi&&typeof cryptoApi.randomUUID==='function')return cryptoApi.randomUUID();const bytes=cryptoApi&&typeof cryptoApi.getRandomValues==='function'?cryptoApi.getRandomValues(new Uint8Array(16)):Array.from({length:16},()=>Math.floor(Math.random()*256));bytes[6]=(bytes[6]&15)|64;bytes[8]=(bytes[8]&63)|128;const hex=Array.from(bytes,(byte)=>byte.toString(16).padStart(2,'0')).join('');return`${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`}
function normalizedAttendeeCount(value){const count=Number.parseInt(String(value??'').trim(),10);return Number.isInteger(count)&&count>=1?count:1}
const APPROVAL_STATUSES=['pending','approved','rejected'];
const EVENT_STATUSES=['planned','finalized','cancelled','disabled','completed'];
const PRIVACY_LEVELS=['basic','public','internal'];
function normalizedScheduleSource(event={}){const source=String(event.schedule_source||event.source||event.created_by_role||event.createdByRole||'').trim().toLowerCase();if(source==='admin'||source==='super_admin'||source==='csc')return'admin';if(source==='organization'||source==='org'||source==='organization_manager'||source==='oic')return'organization';if(event.requires_approval===false)return'admin';return'organization'}
function normalizedApprovalStatus(event={},scheduleSource=normalizedScheduleSource(event)){const status=String(event.approval_status||'').trim().toLowerCase();if(scheduleSource==='admin')return'approved';return APPROVAL_STATUSES.includes(status)?status:'pending'}
function normalizedEventStatus(value){const status=String(value||'').trim().toLowerCase();return EVENT_STATUSES.includes(status)?status:'planned'}
function normalizedPrivacyLevel(value){const privacy=String(value||'').trim().toLowerCase();return PRIVACY_LEVELS.includes(privacy)?privacy:'basic'}
function isConferenceRoomScheduleRecord(event={}){const scheduleType=String(event.schedule_type||'').trim().toLowerCase();const venue=String(event.venue||'').trim().toLowerCase();const title=String(event.title||'').trim().toLowerCase();return scheduleType==='conference_room_booking'||venue==='conference room'||title==='conference room booking'}
function isRelationalScheduleReady(event={}){return Number(event.schedule_schema_version||0)>=2&&Boolean(event.title&&event.category_id&&event.venue)&&normalizedAttendeeCount(event.expected_attendees)>=1&&PRIVACY_LEVELS.includes(normalizedPrivacyLevel(event.privacy_level))&&Boolean(event.contact_person)&&/^\d{11}$/.test(String(event.contact_info||''))&&Boolean(event.public_description&&event.purpose)&&Boolean(event.start_time&&event.end_time)&&new Date(event.end_time)>new Date(event.start_time)}
function shouldTryLegacyAuthFallback(error){return /invalid login credentials|invalid credentials|user not found/i.test(String(error?.message||''))}
export async function authenticate(username,password){const login=username.trim().toLowerCase();const email=login.includes('@')?login:`${login}@core.local`;let payload;try{payload=await request('/auth/v1/token?grant_type=password',{method:'POST',body:body({email,password})})}catch(error){const fallbackUsername=login.endsWith('@aup.edu.ph')?login.split('@')[0].toLowerCase().replace(/[^a-z0-9_.-]+/g,'.').replace(/^[.-]+|[.-]+$/g,'').slice(0,32):'';if(!fallbackUsername||!shouldTryLegacyAuthFallback(error))throw error;try{payload=await request('/auth/v1/token?grant_type=password',{method:'POST',body:body({email:`${fallbackUsername}@core.local`,password})})}catch(fallbackError){if(shouldTryLegacyAuthFallback(fallbackError))throw error;throw fallbackError}}sessionStorage.setItem(SESSION_KEY,JSON.stringify(payload));return payload}
export function authenticatedEmail(){return String(session()?.user?.email||'').trim().toLowerCase()}
export function authenticatedUserId(){return session()?.user?.id||''}
async function refreshSession(){const refreshToken=session()?.refresh_token;if(!refreshToken)throw new Error('Your session has expired. Please log in again.');const payload=await request('/auth/v1/token?grant_type=refresh_token',{method:'POST',body:body({refresh_token:refreshToken}),skipRefresh:true});sessionStorage.setItem(SESSION_KEY,JSON.stringify(payload));return payload}
export async function requestAccount({username,password,fullName,organizationName,email='',phoneNumber='',organizationCode=''}){const normalizedEmail=String(email).trim().toLowerCase();let signup;try{signup=await request('/auth/v1/signup',{method:'POST',body:body({email:normalizedEmail,password,data:{full_name:fullName,username,organization_name:organizationName,organization_code:organizationCode||username,contact_number:phoneNumber,account_type:'organization',email_category:'aup'}})})}catch(error){const isDuplicateAccount=/user_already_exists|already registered|user already exists/i.test(`${error?.code||''} ${error?.message||''}`);const message=isDuplicateAccount?'This AUP email is already registered. Wait for admin approval, or ask an admin to review the existing request.':(error?.message||'Organization signup failed.');console.error('Organization signup error:',{message,status:error?.status,code:error?.code,details:error?.details});if(typeof alert==='function')alert(message);if(isDuplicateAccount)throw new Error(message);throw error}const userId=signup?.user?.id;if(!userId)throw new Error('Supabase could not create the organization account.');const signupHeaders=signup?.access_token?{Authorization:`Bearer ${signup.access_token}`}:{ };await request('/rest/v1/profiles',{method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=minimal',...signupHeaders},body:body({id:userId,username,full_name:fullName,email:normalizedEmail,role:'organization_manager',account_type:'org',organization_name:organizationName,contact_number:phoneNumber,approval_status:'pending',is_enabled:false})});return signup}
export async function decideAccountRequest(id,decision){return rpc('approve_organization_profile',{p_profile_id:id,p_decision:decision},true)}
const DELETE_COLLECTION_ALIASES={activityLogs:['activity_logs','activityLogs']};
export async function deleteRecord(collection,id){
  if(['events','blockedTimes','categories'].includes(collection)){
    await request(`/rest/v1/calendar_items?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'},true);
    return;
  }
  if(collection==='announcements'){
    await request(`/rest/v1/announcements?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'},true);
    return;
  }
  if(collection==='concerns'){
    await request(`/rest/v1/concerns?id=eq.${encodeURIComponent(id)}`,{method:'DELETE'},true);
    return;
  }
  const candidateCollections=DELETE_COLLECTION_ALIASES[collection]||[collection];
  const errors=[];
  for(const candidate of candidateCollections){
    try{return await rpc('delete_scheduler_record',{p_collection:candidate,p_id:id},true)}
    catch(error){errors.push(`${candidate}: ${error.message}`)}
  }
  throw new Error(`Supabase rejected delete for ${collection} ${id}: ${errors.join('; ')}`)
}
export function clearSession(){sessionStorage.removeItem(SESSION_KEY)}
