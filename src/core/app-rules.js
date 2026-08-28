// Extracted from the embedded moduleSources object inside legacy/original-compacted/admin-dashboard.html.
// This copy is placed by responsibility for Codex readability.
// NOTE: Because it was moved into a feature folder, relative imports may need adjustment before this specific copy is runnable.

export const PUBLIC_USER={id:'public',full_name:'Public Viewer',role:'public_viewer',organization_id:null};
export const APPROVAL_STATUSES=['pending','approved','rejected'];
export const EVENT_STATUSES=['planned','finalized','postponed','cancelled','disabled','completed'];
export const ADMIN_ACCESS_EMAILS=[
  'president@aup.edu.ph',
  'vicepresident@aup.edu.ph',
  'gensec@aup.edu.ph',
  'finance@aup.edu.ph',
  'assocgensec@aup.edu.ph',
  'cscadviser@aup.edu.ph',
  'physdevcouncil@aup.edu.ph',
  'socdevcouncil@aup.edu.ph',
  'spritdevcouncil@aup.edu.ph',
  'eacouncil@aup.edu.ph',
  'arccouncil@aup.edu.ph',
  'swbscouncil@aup.edu.ph',
  'idttcouncil@aup.edu.ph'
];
const ADMIN_ACCESS_EMAIL_SET=new Set(ADMIN_ACCESS_EMAILS);
const ADMIN_PERMISSIONS={enabled:true,manageAccounts:true,approveEvents:true,editAllEvents:true,deleteAllEvents:true,manageBlockedTimes:true,manageAnnouncements:true,updatePresidentStatus:false,updateOfficeStatus:false,manageCategories:false};
const STATUS_ADMIN_PROFILES={
  'president@aup.edu.ph':{full_name:'President',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:true,manageAdminTabs:true},
  'vicepresident@aup.edu.ph':{full_name:'Vice President',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false,manageAdminTabs:true},
  'gensec@aup.edu.ph':{full_name:'General Secretary',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:true,manageAdminTabs:true},
  'finance@aup.edu.ph':{full_name:'Finance',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:true,manageAdminTabs:true},
  'assocgensec@aup.edu.ph':{full_name:'Associate Secretary',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'cscadviser@aup.edu.ph':{full_name:'Adviser',account_type:'OIC',updateOfficeStatus:true,updatePresidentStatus:false,manageAdminTabs:true},
  'physdevcouncil@aup.edu.ph':{full_name:'Physical Development Council',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'socdevcouncil@aup.edu.ph':{full_name:'Social Development Council',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'spritdevcouncil@aup.edu.ph':{full_name:'Spiritual Development Council',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'eacouncil@aup.edu.ph':{full_name:'External Affairs Council',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'arccouncil@aup.edu.ph':{full_name:'Academics & Research Council',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'swbscouncil@aup.edu.ph':{full_name:'Student Welfare & Basic Services',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false},
  'idttcouncil@aup.edu.ph':{full_name:'Information Dissemination & Technical Team',account_type:'CSC',updateOfficeStatus:false,updatePresidentStatus:false}
};
const CALENDAR_TIME_ZONE='Asia/Manila';
const DATE_PARTS=new Intl.DateTimeFormat('en-CA',{timeZone:CALENDAR_TIME_ZONE,year:'numeric',month:'2-digit',day:'2-digit'});
const TIME_PARTS=new Intl.DateTimeFormat('en-GB',{timeZone:CALENDAR_TIME_ZONE,hour:'2-digit',minute:'2-digit',hour12:false});
export function currentUser(store){if(store.currentUserId==='public')return PUBLIC_USER;return store.users.find((user)=>user.id===store.currentUserId)||PUBLIC_USER}
export function isPublic(store){return currentUser(store).role==='public_viewer'}
export function isManager(store){return currentUser(store).role==='organization_manager'}
export function isSuperAdmin(store){return currentUser(store).role==='super_admin'}
export function accountLoginEmail(user){const email=String(user?.email||'').trim().toLowerCase();if(email)return email;const username=String(user?.username||'').trim().toLowerCase();return username.includes('@')?username:''}
export function isAllowedAdminEmail(email){return ADMIN_ACCESS_EMAIL_SET.has(String(email||'').trim().toLowerCase())}
export function isAllowedAdminAccount(user){return user?.role==='super_admin'&&isAllowedAdminEmail(accountLoginEmail(user))}
export function ensureAllowedAdminStore(store,email,id=''){const adminEmail=String(email||'').trim().toLowerCase();if(!isAllowedAdminEmail(adminEmail))return store;const localPart=adminEmail.split('@')[0]||'admin';const fallbackId=id||`admin-${localPart}`;const statusProfile=STATUS_ADMIN_PROFILES[adminEmail]||{};let user=store.users.find((item)=>item.id===id||accountLoginEmail(item)===adminEmail||String(item.username||'').trim().toLowerCase()===adminEmail);if(!user){user={id:fallbackId,username:adminEmail,email:adminEmail,full_name:statusProfile.full_name||localPart};store.users.push(user)}Object.assign(user,{id:user.id||fallbackId,username:adminEmail,email:adminEmail,aup_email:adminEmail,full_name:statusProfile.full_name||user.full_name||localPart,role:'super_admin',account_preset:'manager',account_type:statusProfile.account_type||user.account_type||'CSC',suspended_status:false,suspension_status:false,deleted_at:'',permissions:{...(user.permissions||{}),...ADMIN_PERMISSIONS,updateOfficeStatus:Boolean(statusProfile.updateOfficeStatus),updatePresidentStatus:Boolean(statusProfile.updatePresidentStatus)}});store.currentUserId=user.id;return store}
export function userPermission(user,permission){if(!user||user.role==='public_viewer')return false;if(isAllowedAdminAccount(user)){const email=accountLoginEmail(user);if(permission==='updateOfficeStatus')return Boolean(STATUS_ADMIN_PROFILES[email]?.updateOfficeStatus);if(permission==='updatePresidentStatus')return Boolean(STATUS_ADMIN_PROFILES[email]?.updatePresidentStatus);if(permission==='manageAccounts'||permission==='manageAnnouncements')return Boolean(STATUS_ADMIN_PROFILES[email]?.manageAdminTabs);return true}if(permission==='enabled')return user.permissions?.enabled!==false;return Boolean(user.permissions?.[permission])}
export function hasPermission(store,permission){return userPermission(currentUser(store),permission)}
const superAdminPermission=(store,permission)=>isSuperAdmin(store)&&hasPermission(store,permission);
export const canManageAccounts=(store)=>superAdminPermission(store,'manageAccounts');
export const canApproveEvents=(store)=>superAdminPermission(store,'approveEvents');
export const canManageBlockedTimes=(store)=>superAdminPermission(store,'manageBlockedTimes');
export const canManageAnnouncements=(store)=>superAdminPermission(store,'manageAnnouncements');
export const canManageCategories=()=>false;
export const canUpdatePresidentStatus=(store)=>superAdminPermission(store,'updatePresidentStatus');
export const canUpdateOfficeStatus=(store)=>superAdminPermission(store,'updateOfficeStatus');
export function canCreateEvents(store){return userPermission(currentUser(store),'enabled')&&(isManager(store)||isSuperAdmin(store))}
export function canViewPrivateEvent(store,event){return userPermission(currentUser(store),'enabled')&&(isSuperAdmin(store)||(isManager(store)&&currentUser(store).organization_id===event.organization_id))}
export function canEditEvent(store,event){if(!event)return canCreateEvents(store);const user=currentUser(store);if(!userPermission(user,'enabled'))return false;if(isSuperAdmin(store)&&hasPermission(store,'editAllEvents'))return event.schedule_source!=='admin'&&event.created_by_role!=='admin'||event.created_by===user.id;return isManager(store)&&user.organization_id===event.organization_id&&event.created_by===user.id}
export function canDeleteEvent(store,event){if(!event)return false;const user=currentUser(store);if(!userPermission(user,'enabled'))return false;if(isSuperAdmin(store)&&hasPermission(store,'deleteAllEvents'))return event.schedule_source!=='admin'&&event.created_by_role!=='admin'||event.created_by===user.id;return isManager(store)&&user.organization_id===event.organization_id&&event.created_by===user.id}
export function isPublicEvent(event){return!event.revision_of&&event.privacy_level!=='internal'&&!['draft','cancelled','disabled','completed'].includes(event.event_status)}
export function normalizeVenue(value){return String(value||'').trim().toLowerCase().replace(/\s+/g,' ')}
export function overlaps(startA,endA,startB,endB){return new Date(startA)<new Date(endB)&&new Date(endA)>new Date(startB)}
function datePart(value){if(!value)return'';const date=new Date(value);if(Number.isNaN(date.getTime()))return String(value||'').slice(0,10);const parts=Object.fromEntries(DATE_PARTS.formatToParts(date).map((part)=>[part.type,part.value]));return `${parts.year}-${parts.month}-${parts.day}`}
function timePart(value){if(!value)return'00:00';const text=String(value);const raw=text.match(/T(\d{2}:\d{2})/)||text.match(/^(\d{2}:\d{2})/);if(!text.endsWith('Z')&&!/[+-]\d{2}:?\d{2}$/.test(text)&&raw)return raw[1];const date=new Date(value);if(Number.isNaN(date.getTime()))return raw?raw[1]:'00:00';return TIME_PARTS.format(date)}
function floatingTime(date,time){return `${date}T${time.length===5?`${time}:00`:time}`}
function normalizedOccurrence(event,occurrence,index){const storedDate=String(occurrence.date||'').slice(0,10);const startDate=storedDate||datePart(occurrence.start_time||event.start_time);const startClock=timePart(occurrence.start_time||event.start_time);const endClock=timePart(occurrence.end_time||event.end_time);const rawEndDate=datePart(occurrence.end_time||event.end_time);const endDate=event.schedule_type==='multi_day'&&rawEndDate&&rawEndDate>=startDate?rawEndDate:startDate;return{...occurrence,id:occurrence.id||`${event.id||'event'}-occurrence-${index+1}`,date:startDate,start_time:floatingTime(startDate,startClock),end_time:floatingTime(endDate,endClock)}}
export function eventOccurrences(event){const rows=Array.isArray(event.occurrences)&&event.occurrences.length?event.occurrences:[{id:`${event.id||'event'}-occurrence`,date:datePart(event.start_time),start_time:event.start_time,end_time:event.end_time}];return rows.map((occurrence,index)=>normalizedOccurrence(event,occurrence,index))}
export function findBlockingTime(store,start,end,excludeId=''){return store.blockedTimes.find((block)=>block.id!==excludeId&&overlaps(start,end,block.start_time,block.end_time))}
function sameOrganization(left={},right={}){const leftId=String(left.organization_id||'').trim();const rightId=String(right.organization_id||'').trim();if(leftId&&rightId)return leftId===rightId;const leftName=String(left.organization_name||left.organizationName||'').trim().toLowerCase();const rightName=String(right.organization_name||right.organizationName||'').trim().toLowerCase();return Boolean(leftName&&rightName&&leftName===rightName)}
export function findVenueConflicts(store,candidate,approvalStatuses=['pending','approved']){const candidateVenue=normalizeVenue(candidate.venue);const excludedStatuses=['cancelled','disabled','rejected','completed'];return store.events.filter((event)=>event.id!==candidate.id&&event.id!==candidate.revision_of&&event.revision_of!==candidate.id&&candidateVenue&&normalizeVenue(event.venue)===candidateVenue&&approvalStatuses.includes(event.approval_status)&&!excludedStatuses.includes(event.event_status)&&eventOccurrences(candidate).some((candidateOccurrence)=>eventOccurrences(event).some((eventOccurrence)=>overlaps(candidateOccurrence.start_time,candidateOccurrence.end_time,eventOccurrence.start_time,eventOccurrence.end_time))))}
export function findApprovedVenueConflict(store,candidate){return findVenueConflicts(store,candidate,['approved'])[0]||null}
export function activeAnnouncements(store){const now=new Date();return store.announcements.filter((item)=>(item.visibility_status||'show')==='show').sort((a,b)=>new Date(b.updated_at||b.created_at||b.posted_at||now)-new Date(a.updated_at||a.created_at||a.posted_at||now))}
export function categoryById(store,id){return store.categories.find((category)=>category.id===id)||{name:'Uncategorized',color:'#64748B',active:true}}
