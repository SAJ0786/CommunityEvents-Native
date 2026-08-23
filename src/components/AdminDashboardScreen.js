import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import * as XLSX from 'xlsx';
import RNShare from 'react-native-share';
import { collection, getDocs, orderBy, query, where } from '@react-native-firebase/firestore';
import { colors, radius, shadow, spacing } from '../theme';
import NativeDateTimeField from './NativeDateTimeField';
import {
  getHijriDisplay,
  getHijriParts,
  HIJRI_MONTHS,
  hijriDisplayFromParts,
  hijriToGregorian,
} from '../services/hijri';
import { db } from '../firebase/firebase';
import {
  getHijriSettings,
  getYouTubeConnectionStatus,
  getYouTubeOAuthUrl,
  refreshYouTubeThumbnails,
  removeMonthOverride,
  sendCommunityUpdateMessage,
  sendReminderEmailJob,
  sendStoreAnnouncement,
  saveHijriSettings,
  saveMonthOverride,
} from '../services/settings';
import {
  DEFAULT_HIJRI_OBSERVANCES,
  getHijriObservances,
  saveHijriObservances,
  sortHijriObservances,
} from '../services/hijriObservances';
import {
  attachOrganisationLogosToEvents,
  compareEventsByDateTime,
  importBulkEvents,
  deleteEventSubmission,
  recalculateHijriEventMetadata,
  setEventVisibility,
  transferEventOwnership,
  updateEventSubmission,
} from '../services/events';
import {
  listUsers,
  updateUserContactProfile,
  updateUserRole,
} from '../services/users';
import {
  addOrganisation,
  deleteOrganisation,
  getOrganisations,
  invalidateOrganisationCache,
  ORGANISATION_TYPES,
  organisationTypeLabel,
  updateOrganisation,
} from '../services/organisations';
import EventCard from './EventCard';
import EventDetailsModal from './EventDetailsModal';
import CompactSelect from './CompactSelect';
import { CITY_OPTIONS, DEFAULT_CITY, cityCode, cityLabel, getEventMetroArea, normalizeCity } from '../utils/cities';
import { listenAdminFeedbackThreads } from '../services/messaging';
import { addDynamicEventOption } from '../services/eventOptionsAdmin';

const HIJRI_OBSERVANCE_CATEGORIES = ['Wiladat', 'Shahadat', 'Wafat', 'Eid', 'Ayyam-e-Aza', 'Amaal', 'Season', 'Event'];
const BULK_IMPORT_TEMPLATE_URL = 'https://communityevents.siza.info/Community_Events_Import_Template.xlsx';
const ROLE_OPTIONS = [
  { value: 'user', label: 'User' },
  { value: 'admin', label: 'Admin' },
  { value: 'superAdmin', label: 'Super Admin' },
];

const PWA_MODULES = [];

const ADMIN_ACTION_GROUPS = [
  {
    key: 'people-events',
    title: 'People & Events',
    actions: ['users', 'events', 'orgs'],
  },
  {
    key: 'operations',
    title: 'Operations',
    actions: ['settings', 'messaging', 'troubleshooting', 'tools'],
  },
];

const ADMIN_ACTION_META = {
  businesses: { icon: '\u{1F3EA}', tone: '#e4f7f2' },
  users: { icon: '👥', tone: '#e8f4ff' },
  orgs: { icon: '🏢', tone: '#eef0ff' },
  feedback: { icon: '✦', tone: '#fff1ea' },
  inbox: { icon: '✉', tone: '#f0ecff' },
  events: { icon: '🗓', tone: '#e4f7f2' },
  import: { icon: '⇧', tone: '#e8f4ff' },
  bulk_share: { icon: '↗', tone: '#fff1ea' },
  streams: { icon: '▶', tone: '#ffebef' },
  settings: { icon: '⚙', tone: '#edf0f4' },
  repair: { icon: '⚒', tone: '#fff6df' },
  'hijri-calendar': { icon: '☾', tone: '#eeeaff' },
  messaging: { icon: '\u{1F4E8}', tone: '#fff1ea' },
  troubleshooting: { icon: '\u{1F6E0}', tone: '#edf0f4' },
  tools: { icon: '\u{1F9F0}', tone: '#fff6df' },
};

const LIVE_ACTIONS = [
  {
    key: 'users',
    title: 'User Management',
    description: 'User management, search, city scoping, and contact detail updates.',
    local: true,
  },
  {
    key: 'events',
    title: 'Event Management',
    description: 'Admin event list, active and archived views, filtering, and visibility control.',
    local: true,
  },
  {
    key: 'orgs',
    title: 'Organisation Management',
    description: 'Manage organisation names, IDs, locations, and types used across event creation.',
    local: true,
  },
  {
    key: 'settings', title: 'Calendar Settings', description: 'Manage Hijri calendar adjustment only.', local: true,
  },
  {
    key: 'messaging', title: 'Community Messaging', description: 'Community Update and Email Reminders.', local: true,
  },
  {
    key: 'troubleshooting', title: 'Troubleshooting Management', description: 'Diagnostics, crash monitoring and support tools.', local: true,
  },
  {
    key: 'tools', title: 'Tools', description: 'YouTube Live Connection, event import/export and future utilities.', local: true,
  },
];

const blankHijriObservanceForm = {
  id: '',
  name: '',
  day: '1',
  month: '1',
  category: 'Event',
  notes: '',
  enabled: true,
  priority: '50',
};

function todayIso() {
  const value = new Date();
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function dateAfterIso(days = 0) {
  const value = new Date();
  value.setHours(12, 0, 0, 0);
  value.setDate(value.getDate() + days);
  value.setMinutes(value.getMinutes() - value.getTimezoneOffset());
  return value.toISOString().slice(0, 10);
}

function exportDateLabel(value) {
  const match = String(value || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : String(value || '');
}

function formatSubmissionDate(value) {
  if (!value) return '';
  const date = typeof value?.toDate === 'function'
    ? value.toDate()
    : typeof value?.seconds === 'number'
      ? new Date(value.seconds * 1000)
      : value instanceof Date
        ? value
        : new Date(value);
  if (!date || Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function slugHijriObservance(value) {
  return (
    String(value || 'observance')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || `observance-${Date.now()}`
  );
}

function sortOverrides(overrides = []) {
  return [...overrides].sort((a, b) =>
    Number(a.hYear) - Number(b.hYear)
    || Number(a.hMonth) - Number(b.hMonth)
  );
}

function getAdminCity(profile) {
  return normalizeCity(profile?.adminCity || profile?.defaultCity || DEFAULT_CITY);
}

function getInitials(value) {
  const parts = String(value || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'AD';
  return parts.slice(0, 2).map(part => part.charAt(0).toUpperCase()).join('');
}

function canAdminAccessEvent(profile, event) {
  if (profile?.role === 'superAdmin') return true;
  if (profile?.role !== 'admin') return false;
  return getEventMetroArea(event) === getAdminCity(profile);
}

function canAdminAccessUser(profile, userRecord) {
  if (profile?.role === 'superAdmin') return true;
  if (profile?.role !== 'admin') return false;
  return normalizeCity(userRecord?.adminCity || userRecord?.defaultCity || DEFAULT_CITY) === getAdminCity(profile);
}

function normalisePhone(value) {
  let digits = String(value || '').replace(/\D/g, '');
  if (digits.startsWith('0061')) digits = digits.slice(2);
  if (digits.startsWith('61') && digits.length >= 10) digits = `0${digits.slice(2)}`;
  return digits;
}

function userMatchesSearch(userRecord, queryText) {
  const textQuery = String(queryText || '').trim().toLowerCase();
  if (!textQuery) return true;

  const textFields = [
    userRecord.fullName,
    userRecord.displayName,
    userRecord.name,
    userRecord.email,
  ];
  if (textFields.some(value => String(value || '').toLowerCase().includes(textQuery))) return true;

  const phoneQuery = normalisePhone(textQuery);
  if (!phoneQuery) return false;
  return [userRecord.phone, userRecord.phoneNumber, userRecord.mobile, userRecord.mobileNumber]
    .some(value => normalisePhone(value).includes(phoneQuery));
}

function hasUserPhone(userRecord = {}) {
  return !!String(userRecord.phone || userRecord.phoneNumber || userRecord.mobile || userRecord.mobileNumber || '').trim();
}

function addressForGeocode(address = {}) {
  return [
    address.fullAddress,
    [address.street, address.suburb, address.state, address.postcode, 'Australia'].filter(Boolean).join(', '),
  ].find(value => String(value || '').trim().length >= 8) || '';
}

async function geocodeImportAddress(address = {}) {
  const queryText = addressForGeocode(address);
  if (!queryText) return null;

  const results = await Location.geocodeAsync(queryText);
  const match = results.find(result => (
    Number(result.latitude) >= -45
    && Number(result.latitude) <= -9
    && Number(result.longitude) >= 110
    && Number(result.longitude) <= 155
  ));
  if (!match) return null;

  return {
    latitude: Number(match.latitude),
    longitude: Number(match.longitude),
    fullAddress: address.fullAddress || queryText,
  };
}

async function geocodeImportRows(rows = []) {
  const cache = new Map();
  const output = [];

  for (const row of rows) {
    const address = {
      street: row.street,
      suburb: row.suburb,
      state: row.state,
      postcode: row.postcode,
      fullAddress: [row.street, row.suburb, row.state, row.postcode, 'Australia'].filter(Boolean).join(', '),
    };
    const cacheKey = addressForGeocode(address).toLowerCase();
    let gps = cacheKey ? cache.get(cacheKey) : null;

    if (!gps && cacheKey) {
      try {
        gps = await geocodeImportAddress(address);
        cache.set(cacheKey, gps);
      } catch {
        gps = null;
      }
    }

    output.push({
      ...row,
      latitude: gps?.latitude ?? null,
      longitude: gps?.longitude ?? null,
      fullAddress: gps?.fullAddress || address.fullAddress,
    });
  }

  return output;
}

function isStaleMigratedPhoneProfile(userRecord = {}) {
  return userRecord.isActive !== false && !!userRecord.migratedToUid && hasUserPhone(userRecord);
}

function isOldMigratedProfile(userRecord = {}) {
  return !!userRecord.migratedToUid && !isStaleMigratedPhoneProfile(userRecord);
}

function isInactiveUserProfile(userRecord = {}) {
  return userRecord.isActive === false && !userRecord.migratedToUid;
}

function isActiveUserProfile(userRecord = {}) {
  return userRecord.isActive !== false && !isOldMigratedProfile(userRecord);
}

function StatCard({ label, value, tone = 'neutral' }) {
  return (
    <View style={[styles.statCard, tone === 'teal' && styles.statCardTeal]}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

export default function AdminDashboardScreen({
  user,
  profile,
  events = [],
  onNavigate,
  onEditEvent,
  onCopyEvent,
  onEditSeries,
}) {
  const [panel, setPanel] = useState('overview');
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [observanceSaving, setObservanceSaving] = useState(false);
  const [hijriSettings, setHijriSettings] = useState({ overrides: [] });
  const [hijriObservances, setHijriObservances] = useState(DEFAULT_HIJRI_OBSERVANCES);
  const [status, setStatus] = useState({ message: '', error: false });
  const [anchorDate, setAnchorDate] = useState(todayIso());
  const [anchorMonth, setAnchorMonth] = useState('');
  const [anchorYear, setAnchorYear] = useState('');
  const [reminderMode, setReminderMode] = useState('date');
  const [reminderDate, setReminderDate] = useState(todayIso());
  const [reminderFrom, setReminderFrom] = useState(todayIso());
  const [reminderTo, setReminderTo] = useState(todayIso());
  const [reminderMonth, setReminderMonth] = useState(todayIso().slice(0, 7));
  const [sendingReminder, setSendingReminder] = useState(false);
  const [reminderResult, setReminderResult] = useState(null);
  const [communityMsg, setCommunityMsg] = useState('');
  const [youtubeStatus, setYouTubeStatus] = useState('checking');
  const [youtubeBusy, setYouTubeBusy] = useState(false);
  const [thumbnailBusy, setThumbnailBusy] = useState(false);
  const [thumbnailResult, setThumbnailResult] = useState('');
  const [editingHijriObsId, setEditingHijriObsId] = useState(null);
  const [hijriObsSelection, setHijriObsSelection] = useState('');
  const [hijriObsForm, setHijriObsForm] = useState(blankHijriObservanceForm);
  const [adminEventsLoading, setAdminEventsLoading] = useState(false);
  const [adminEventsError, setAdminEventsError] = useState('');
  const [adminEvents, setAdminEvents] = useState([]);
  const [archivedAdminEvents, setArchivedAdminEvents] = useState([]);
  const [adminEventView, setAdminEventView] = useState('active');
  const [adminEventQuery, setAdminEventQuery] = useState('');
  const [adminEventType, setAdminEventType] = useState('all');
  const [adminSeriesFilter, setAdminSeriesFilter] = useState('all');
  const [adminStatusFilter, setAdminStatusFilter] = useState('all');
  const [adminOwnerFilterUid, setAdminOwnerFilterUid] = useState('');
  const [adminOwnerFilterName, setAdminOwnerFilterName] = useState('');
  const [adminVisibilityBusyId, setAdminVisibilityBusyId] = useState('');
  const [adminDeletingId, setAdminDeletingId] = useState('');
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [transferEvent, setTransferEvent] = useState(null);
  const [transferQuery, setTransferQuery] = useState('');
  const [transferUser, setTransferUser] = useState(null);
  const [transferBusy, setTransferBusy] = useState(false);
  const [repairLoading, setRepairLoading] = useState(false);
  const [repairEvents, setRepairEvents] = useState([]);
  const [repairMessage, setRepairMessage] = useState('');
  const [repairSelectedId, setRepairSelectedId] = useState('');
  const [fixDay, setFixDay] = useState('');
  const [fixMonth, setFixMonth] = useState('');
  const [fixYear, setFixYear] = useState('');
  const [fixingId, setFixingId] = useState('');
  const [usersLoading, setUsersLoading] = useState(false);
  const [usersLoaded, setUsersLoaded] = useState(false);
  const [usersError, setUsersError] = useState('');
  const [usersList, setUsersList] = useState([]);
  const [userQuery, setUserQuery] = useState('');
  const [userCityFilter, setUserCityFilter] = useState('all');
  const [userRoleFilter, setUserRoleFilter] = useState('all');
  const [userCalendarSyncedOnly, setUserCalendarSyncedOnly] = useState(false);
  const [editingUserId, setEditingUserId] = useState('');
  const [editUserName, setEditUserName] = useState('');
  const [editUserEmail, setEditUserEmail] = useState('');
  const [editUserCity, setEditUserCity] = useState(DEFAULT_CITY);
  const [savingUserEdit, setSavingUserEdit] = useState(false);
  const [savingUserRoleId, setSavingUserRoleId] = useState('');
  const [orgsLoading, setOrgsLoading] = useState(false);
  const [orgsError, setOrgsError] = useState('');
  const [orgsList, setOrgsList] = useState([]);
  const [newOrgName, setNewOrgName] = useState('');
  const [newOrgSlug, setNewOrgSlug] = useState('');
  const [newOrgLocation, setNewOrgLocation] = useState('');
  const [newOrgType, setNewOrgType] = useState('centre');
  const [newOrgLogo, setNewOrgLogo] = useState('');
  const [editingOrgId, setEditingOrgId] = useState('');
  const [editOrgName, setEditOrgName] = useState('');
  const [editOrgSlug, setEditOrgSlug] = useState('');
  const [editOrgLocation, setEditOrgLocation] = useState('');
  const [editOrgType, setEditOrgType] = useState('centre');
  const [editOrgLogo, setEditOrgLogo] = useState('');
  const [savingOrgEdit, setSavingOrgEdit] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [importError, setImportError] = useState('');
  const [exportCity, setExportCity] = useState(profile?.role === 'superAdmin' ? 'all' : getAdminCity(profile));
  const [exportFrom, setExportFrom] = useState(todayIso());
  const [exportTo, setExportTo] = useState(dateAfterIso(30));
  const [exporting, setExporting] = useState(false);
  const [exportResult, setExportResult] = useState({ message: '', error: false });
  const [feedbackThreads, setFeedbackThreads] = useState([]);
  const [newEventType, setNewEventType] = useState('');
  const [newReciterType, setNewReciterType] = useState('');
  const [optionStatus, setOptionStatus] = useState('');
  const [optionBusy, setOptionBusy] = useState(false);

  const roleLabel = profile?.role === 'superAdmin' ? 'Super Admin' : 'Admin';
  const adminDisplayName = profile?.fullName || user?.displayName || user?.email || 'Admin user';
  const adminScopeLabel = profile?.role === 'superAdmin'
    ? 'All Australia'
    : cityLabel(getAdminCity(profile)).replace(', Australia', '');
  const canAccess = profile?.role === 'admin' || profile?.role === 'superAdmin';
  const canManageHijriSettings = profile?.role === 'superAdmin';

  useEffect(() => {
    if (profile?.role !== 'superAdmin') setExportCity(getAdminCity(profile));
  }, [profile?.adminCity, profile?.defaultCity, profile?.role]);

  const stats = useMemo(() => {
    const totalEvents = events.length;
    const hiddenEvents = events.filter(event => event.hidden).length;
    const visibleEvents = totalEvents - hiddenEvents;
    const recurringEvents = events.filter(event => event.seriesId || event.recurringSeriesId).length;
    return { totalEvents, visibleEvents, hiddenEvents, recurringEvents };
  }, [events]);

  useEffect(() => {
    if (!canAccess) return undefined;
    return listenAdminFeedbackThreads(profile, setFeedbackThreads);
  }, [canAccess, profile]);

  useEffect(() => {
    if (!canManageHijriSettings) {
      setSettingsLoading(false);
      return;
    }

    let active = true;
    async function load() {
      setSettingsLoading(true);
      const [nextSettings, nextObservances] = await Promise.all([
        getHijriSettings(),
        getHijriObservances(),
      ]);
      if (!active) return;
      const currentHijri = getHijriParts(todayIso(), nextSettings.overrides || []);
      setHijriSettings(nextSettings);
      setHijriObservances(sortHijriObservances(nextObservances));
      setAnchorDate(nextSettings.anchorDate || todayIso());
      setAnchorMonth(String(nextSettings.anchorMonth || currentHijri.month || ''));
      setAnchorYear(String(nextSettings.anchorYear || currentHijri.year || ''));
      setSettingsLoading(false);
    }
    load().catch(() => {
      if (active) {
        setSettingsLoading(false);
        setStatus({ message: 'Could not load admin Hijri settings.', error: true });
      }
    });
    return () => {
      active = false;
    };
  }, [canManageHijriSettings]);

  const currentHijriDisplay = getHijriDisplay(todayIso(), hijriSettings.overrides || []);
  const sortedObservances = useMemo(
    () => sortHijriObservances(hijriObservances),
    [hijriObservances]
  );
  const scopedUsers = useMemo(
    () => usersList.filter(userRecord => canAdminAccessUser(profile, userRecord)),
    [profile, usersList]
  );
  const usersById = useMemo(
    () => new Map(usersList.map(userRecord => [userRecord.id, userRecord])),
    [usersList]
  );
  const activeEventCountByOwner = useMemo(() => {
    const counts = new Map();
    adminEvents.forEach(event => {
      const submitterUid = event.submittedByUserId || event.createdByUserId || event.ownerUid || '';
      if (submitterUid) counts.set(submitterUid, (counts.get(submitterUid) || 0) + 1);
    });
    return counts;
  }, [adminEvents]);
  const filteredUsers = useMemo(() => {
    return scopedUsers
      .filter(userRecord => userMatchesSearch(userRecord, userQuery))
      .filter(userRecord => userRoleFilter === 'all' || userRecord.role === userRoleFilter)
      .filter(userRecord => !userCalendarSyncedOnly || userRecord.calendarSynced === true || userRecord.calendarSyncEnabled === true)
      .filter(userRecord => {
        const city = normalizeCity(userRecord.defaultCity || DEFAULT_CITY);
        return userCityFilter === 'all' || city === userCityFilter;
      });
  }, [scopedUsers, userCalendarSyncedOnly, userCityFilter, userQuery, userRoleFilter]);
  const sortedFilteredUsers = useMemo(
    () => filteredUsers.slice().sort((a, b) => {
      const left = a.createdAt?.toMillis?.() || a.createdAt?.seconds * 1000 || Date.parse(a.createdAt || a.joinedAt || '') || 0;
      const right = b.createdAt?.toMillis?.() || b.createdAt?.seconds * 1000 || Date.parse(b.createdAt || b.joinedAt || '') || 0;
      return right - left || String(a.fullName || a.email || '').localeCompare(String(b.fullName || b.email || ''));
    }),
    [filteredUsers]
  );
  const adminEventSource = adminEventView === 'archived' ? archivedAdminEvents : adminEvents;

  const exportUsersCsv = async () => {
    const escapeCsv = value => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Email', 'Phone', 'Role', 'City', 'Calendar Synced', 'Date Joined'], ...sortedFilteredUsers.map(item => [
      item.fullName || item.displayName || '', item.email || '', item.phone || item.phoneNumber || '', item.role || 'user', cityLabel(normalizeCity(item.defaultCity || DEFAULT_CITY)), item.calendarSynced === true || item.calendarSyncEnabled === true ? 'Yes' : 'No', item.createdAt?.toDate?.()?.toISOString?.() || item.createdAt || item.joinedAt || '',
    ])];
    await Share.share({ title: 'Community Events users CSV', message: rows.map(row => row.map(escapeCsv).join(',')).join('\n') });
  };
  const displayedAdminEvents = useMemo(() => {
    const textQuery = adminEventQuery.trim().toLowerCase();
    return adminEventSource
      .filter(event => !adminOwnerFilterUid || (event.submittedByUserId || event.createdByUserId || event.ownerUid) === adminOwnerFilterUid)
      .filter(event => {
        if (adminEventType === 'centre') return (event.organiserType || event.organisationType) !== 'private';
        if (adminEventType === 'private') return (event.organiserType || event.organisationType) === 'private';
        return true;
      })
      .filter(event => {
        if (adminStatusFilter === 'visible') return !event.hidden;
        if (adminStatusFilter === 'hidden') return event.hidden === true;
        if (adminStatusFilter === 'live') return event.isLive === true;
        if (adminStatusFilter === 'stale') return event.isLive === true && event.eventDate < todayIso();
        return true;
      })
      .filter(event => {
        const isSeries = Boolean(event.isSeries || event.seriesId || event.recurringSeriesId);
        const isRecurring = Boolean(event.isRecurring || event.recurringSeriesId);
        if (adminSeriesFilter === 'single') return !isSeries;
        if (adminSeriesFilter === 'recurring') return isRecurring;
        if (adminSeriesFilter === 'legacySeries') return isSeries && !isRecurring;
        return true;
      })
      .filter(event => {
        if (!textQuery) return true;
        const haystack = [
          event.eventTypeDisplay,
          event.customEventType,
          event.eventType,
          event.hostName,
          event.organiserName,
          event.organizationName,
          event.eventSubject,
          event.suburb,
          event.address?.suburb,
          event.address?.fullAddress,
          event.notes,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(textQuery);
      })
      .sort(compareEventsByDateTime);
  }, [adminEventQuery, adminEventSource, adminEventType, adminOwnerFilterUid, adminSeriesFilter, adminStatusFilter]);

  const transferCandidates = useMemo(() => {
    const queryText = transferQuery.trim().toLowerCase();
    if (queryText.length < 2) return [];
    return scopedUsers
      .filter(item => item.id !== (transferEvent?.createdByUserId || transferEvent?.ownerUid))
      .filter(item => [item.fullName, item.displayName, item.email, item.phone, item.phoneNumber].some(value => String(value || '').toLowerCase().includes(queryText)))
      .slice(0, 8);
  }, [scopedUsers, transferEvent?.createdByUserId, transferEvent?.ownerUid, transferQuery]);

  const openTransfer = event => {
    setTransferEvent(current => current?.id === event.id ? null : event);
    setTransferQuery('');
    setTransferUser(null);
    if (!usersLoaded && !usersLoading) loadUsers();
  };
  const openUserEvents = userRecord => {
    setAdminOwnerFilterUid(userRecord.id);
    setAdminOwnerFilterName(userRecord.fullName || userRecord.displayName || userRecord.email || 'Selected user');
    setAdminEventView('active');
    setAdminEventQuery('');
    setAdminEventType('all');
    setAdminSeriesFilter('all');
    setAdminStatusFilter('all');
    setTransferEvent(null);
    setPanel('events');
  };
  const getSubmissionLine = event => {
    const submitterUid = event.submittedByUserId || event.createdByUserId || event.ownerUid || '';
    const submitter = usersById.get(submitterUid);
    const submitterName = event.submittedByName
      || submitter?.fullName
      || submitter?.displayName
      || event.createdByName
      || event.createdByUserEmail
      || event.createdByUserPhone
      || 'Unknown user';
    const submittedDate = formatSubmissionDate(event.submittedAt || event.createdAt || event.addedAt);
    return submittedDate
      ? `Event submitted by ${submitterName} on ${submittedDate}`
      : `Event submitted by ${submitterName}`;
  };
  const confirmTransfer = async () => {
    if (!transferEvent || !transferUser) return;
    setTransferBusy(true);
    try {
      const targetName = transferUser.fullName || transferUser.displayName || transferUser.email || 'the selected user';
      await transferEventOwnership(transferEvent, transferUser);
      setTransferEvent(null);
      setTransferUser(null);
      setTransferQuery('');
      await loadAdminEvents(adminEventView);
      Alert.alert('Event transferred', `Event ownership was transferred to ${targetName}.`);
    } catch (nextError) {
      Alert.alert('Transfer failed', nextError?.message || 'Could not transfer this event.');
    } finally {
      setTransferBusy(false);
    }
  };

  const addEventOption = async (kind, value, clear) => {
    setOptionBusy(true);
    setOptionStatus('');
    try { await addDynamicEventOption(kind, value); clear(''); setOptionStatus(`${value.trim()} added. It is now available in Add/Edit Event.`); }
    catch (nextError) { setOptionStatus(nextError?.message || 'Could not add this option.'); }
    finally { setOptionBusy(false); }
  };

  const resetHijriObservanceForm = (nextSelection = '') => {
    setHijriObsForm(blankHijriObservanceForm);
    setEditingHijriObsId(null);
    setHijriObsSelection(nextSelection);
  };

  const editHijriObservance = item => {
    setHijriObsForm({
      id: item.id || '',
      name: item.name || '',
      day: String(item.day || 1),
      month: String(item.month || 1),
      category: item.category || 'Event',
      notes: item.notes || '',
      enabled: item.enabled !== false,
      priority: String(item.priority || 50),
    });
    setEditingHijriObsId(item.id);
    setHijriObsSelection(item.id);
  };

  const handleAction = key => {
    if (key === 'messaging') {
      setPanel('messaging');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'troubleshooting') {
      setPanel('troubleshooting');
      return;
    }
    if (key === 'tools') {
      setPanel('tools');
      return;
    }
    if (key === 'settings') {
      setPanel('settings');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'events') {
      setAdminOwnerFilterUid('');
      setAdminOwnerFilterName('');
      setPanel('events');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'import') {
      setPanel('import');
      setImportError('');
      return;
    }
    if (key === 'users') {
      setPanel('users');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'businesses') {
      setPanel('businesses');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'repair') {
      setPanel('repair');
      setStatus({ message: '', error: false });
      return;
    }
    if (key === 'orgs') {
      setPanel('orgs');
      setStatus({ message: '', error: false });
      return;
    }
    onNavigate?.(key);
  };

  const loadAdminEvents = async (view = adminEventView) => {
    setAdminEventsLoading(true);
    setAdminEventsError('');
    try {
      const sourceQuery = view === 'archived'
        ? collection(db, 'archivedEvents')
        : query(collection(db, 'events'), where('status', '==', 'active'), orderBy('eventDate', 'asc'));
      const snapshot = await getDocs(sourceQuery);
      const rawItems = snapshot.docs
        .map(item => ({ id: item.id, ...item.data(), __archived: view === 'archived' }))
        .filter(event => canAdminAccessEvent(profile, event))
        .sort(compareEventsByDateTime);
      const items = await attachOrganisationLogosToEvents(rawItems);
      if (view === 'archived') setArchivedAdminEvents(items);
      else setAdminEvents(items);
    } catch (error) {
      setAdminEventsError(error.message || 'Could not load admin events.');
    } finally {
      setAdminEventsLoading(false);
    }
  };

  const loadUsers = async () => {
    setUsersLoading(true);
    setUsersError('');
    try {
      const nextUsers = await listUsers({ includeHidden: true });
      setUsersList(nextUsers);
    } catch (error) {
      setUsersError(error.message || 'Could not load users.');
    } finally {
      setUsersLoaded(true);
      setUsersLoading(false);
    }
  };

  useEffect(() => {
    if ((panel === 'overview' || panel === 'users') && !usersLoaded && !usersLoading) {
      loadUsers();
    }
  }, [panel, usersLoaded, usersLoading]);

  useEffect(() => {
    if (panel !== 'events') return;
    if (adminEventView === 'active' && adminEvents.length === 0 && !adminEventsLoading) {
      loadAdminEvents('active');
      return;
    }
    if (adminEventView === 'archived' && archivedAdminEvents.length === 0 && !adminEventsLoading) {
      loadAdminEvents('archived');
    }
  }, [adminEventView, adminEvents.length, adminEventsLoading, archivedAdminEvents.length, panel]);

  useEffect(() => {
    if (panel === 'users' && adminEvents.length === 0 && !adminEventsLoading) {
      loadAdminEvents('active');
    }
  }, [adminEvents.length, adminEventsLoading, panel]);

  const handleToggleAdminVisibility = async event => {
    setAdminVisibilityBusyId(event.id);
    setAdminEventsError('');
    try {
      await setEventVisibility(event.id, !event.hidden);
      setAdminEvents(current => current.map(item => (
        item.id === event.id ? { ...item, hidden: !item.hidden } : item
      )));
      if (selectedEvent?.id === event.id) {
        setSelectedEvent(current => current ? { ...current, hidden: !current.hidden } : current);
      }
    } catch (error) {
      setAdminEventsError(error.message || 'Could not change event visibility.');
    } finally {
      setAdminVisibilityBusyId('');
    }
  };

  const confirmDeleteAdminEvent = event => {
    Alert.alert(
      'Delete event?',
      'This removes the selected event.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setAdminDeletingId(event.id);
            setAdminEventsError('');
            try {
              await deleteEventSubmission(event.id);
              setAdminEvents(current => current.filter(item => item.id !== event.id));
              if (selectedEvent?.id === event.id) setSelectedEvent(null);
            } catch (error) {
              setAdminEventsError(error.message || 'Could not delete event.');
            } finally {
              setAdminDeletingId('');
            }
          },
        },
      ]
    );
  };

  const loadRepairEvents = async () => {
    if (!canManageHijriSettings) {
      setRepairMessage('Only Super Admins can use the Hijri repair tool.');
      return;
    }
    setRepairLoading(true);
    setRepairMessage('');
    try {
      const snapshot = await getDocs(query(
        collection(db, 'events'),
        where('enteredAsHijri', '==', true)
      ));
      const items = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(event => canAdminAccessEvent(profile, event))
        .sort(compareEventsByDateTime);
      setRepairEvents(items);
      if (!items.length) {
        setRepairMessage('No Hijri-entered events found.');
      }
    } catch (error) {
      setRepairMessage(error.message || 'Could not load Hijri-entered events.');
    } finally {
      setRepairLoading(false);
    }
  };

  useEffect(() => {
    if (panel === 'repair' && canManageHijriSettings && !repairEvents.length && !repairLoading) {
      loadRepairEvents();
    }
  }, [canManageHijriSettings, panel, repairEvents.length, repairLoading]);

  useEffect(() => {
    if (panel !== 'settings') return;
    refreshYouTubeStatus();
  }, [panel]);

  const selectedRepairEvent = useMemo(
    () => repairEvents.find(event => event.id === repairSelectedId) || null,
    [repairEvents, repairSelectedId]
  );

  useEffect(() => {
    if (!selectedRepairEvent) return;
    setFixDay(String(selectedRepairEvent.hijriDay || ''));
    setFixMonth(String(selectedRepairEvent.hijriMonth || ''));
    setFixYear(String(selectedRepairEvent.hijriYear || ''));
  }, [selectedRepairEvent]);

  const saveRepair = async () => {
    if (!selectedRepairEvent) {
      setRepairMessage('Select a Hijri-entered event first.');
      return;
    }
    const day = Number(fixDay);
    const month = Number(fixMonth);
    const year = Number(fixYear);
    if (!day || !month || !year) {
      setRepairMessage('Please enter a valid Hijri day, month, and year.');
      return;
    }
    const overrides = hijriSettings.overrides || [];
    const nextEventDate = hijriToGregorian(day, month, year, overrides);
    if (!nextEventDate) {
      setRepairMessage('Could not convert that Hijri date to Gregorian.');
      return;
    }

    setFixingId(selectedRepairEvent.id);
    setRepairMessage('');
    try {
      await updateEventSubmission(selectedRepairEvent.id, {
        eventDate: nextEventDate,
        hijriDate: hijriDisplayFromParts(day, month, year),
        hijriDay: day,
        hijriMonth: month,
        hijriYear: year,
        enteredAsHijri: true,
      });
      setRepairEvents(current => current.map(item => (
        item.id === selectedRepairEvent.id
          ? {
            ...item,
            eventDate: nextEventDate,
            hijriDate: hijriDisplayFromParts(day, month, year),
            hijriDay: day,
            hijriMonth: month,
            hijriYear: year,
            enteredAsHijri: true,
          }
          : item
      )));
      setRepairMessage(`Repair saved. Event now points to ${nextEventDate}.`);
    } catch (error) {
      setRepairMessage(error.message || 'Could not save the Hijri repair.');
    } finally {
      setFixingId('');
    }
  };

  const openUserEditor = target => {
    setEditingUserId(target.id);
    setEditUserName(target.fullName || '');
    setEditUserEmail(target.email || '');
    setEditUserCity(normalizeCity(target.defaultCity || DEFAULT_CITY));
  };

  const saveUserEditor = async () => {
    const target = usersList.find(item => item.id === editingUserId);
    if (!target) return;
    const fullName = editUserName.trim().replace(/\s+/g, ' ');
    const email = editUserEmail.trim().toLowerCase();
    if (fullName.length < 2) {
      setUsersError('Enter a valid full name.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setUsersError('Enter a valid email address.');
      return;
    }

    setSavingUserEdit(true);
    setUsersError('');
    try {
      const updated = await updateUserContactProfile(
        target.id,
        fullName,
        email,
        profile?.role === 'superAdmin' ? editUserCity : undefined
      );
      setUsersList(current => current.map(item => (
        item.id === target.id ? { ...item, ...(updated || {}), fullName, email, defaultCity: profile?.role === 'superAdmin' ? editUserCity : item.defaultCity } : item
      )));
      setEditingUserId('');
      setStatus({ message: 'User details updated.', error: false });
    } catch (error) {
      setUsersError(error.message || 'Could not update user details.');
    } finally {
      setSavingUserEdit(false);
    }
  };

  const changeUserRole = async (target, role) => {
    setSavingUserRoleId(target.id);
    setUsersError('');
    try {
      const updated = await updateUserRole(target.id, role);
      setUsersList(current => current.map(item => item.id === target.id ? { ...item, ...(updated || {}), role } : item));
      setStatus({ message: `${target.fullName || target.email || 'User'} is now ${ROLE_OPTIONS.find(item => item.value === role)?.label || role}.`, error: false });
    } catch (error) {
      setUsersError(error.message || 'Could not update user role.');
    } finally {
      setSavingUserRoleId('');
    }
  };

  const loadOrganisations = async () => {
    setOrgsLoading(true);
    setOrgsError('');
    try {
      const nextOrgs = await getOrganisations({ force: true });
      setOrgsList(nextOrgs);
    } catch (error) {
      setOrgsError(error.message || 'Could not load organisations.');
    } finally {
      setOrgsLoading(false);
    }
  };

  useEffect(() => {
    if ((panel === 'overview' || panel === 'orgs') && !orgsList.length && !orgsLoading) {
      loadOrganisations();
    }
  }, [orgsList.length, orgsLoading, panel]);

  const startEditOrg = org => {
    setEditingOrgId(org.id);
    setEditOrgName(org.name || '');
    setEditOrgSlug(org.slug || '');
    setEditOrgLocation(org.location || '');
    setEditOrgType(org.type || 'centre');
    setEditOrgLogo(org.logoBase64 || '');
  };

  const pickOrganisationLogo = async onSelect => {
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) throw new Error('Allow photo access to choose an organisation logo.');
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
        base64: true,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) throw new Error('Could not read the selected image.');
      if (asset.fileSize && asset.fileSize > 2 * 1024 * 1024) {
        throw new Error('Please choose an organisation logo smaller than 2 MB.');
      }
      const mimeType = asset.mimeType || 'image/jpeg';
      const dataUri = `data:${mimeType};base64,${asset.base64}`;
      if (dataUri.length > 900000) {
        throw new Error('This logo is too large after compression. Please choose a smaller image.');
      }
      onSelect?.(dataUri);
      setOrgsError('');
    } catch (error) {
      setOrgsError(error?.message || 'Could not choose an organisation logo.');
    }
  };

  const saveNewOrg = async () => {
    const name = newOrgName.trim();
    const slug = (newOrgSlug.trim() || name.toLowerCase().replace(/[^a-z0-9]/g, '')).trim();
    if (!name) {
      setOrgsError('Organisation name is required.');
      return;
    }
    if (!slug) {
      setOrgsError('Organisation ID is required.');
      return;
    }

    setSavingOrgEdit(true);
    setOrgsError('');
    try {
      await addOrganisation({
        name,
        slug,
        location: newOrgLocation.trim(),
        type: newOrgType,
        logoBase64: newOrgLogo,
      });
      setNewOrgName('');
      setNewOrgSlug('');
      setNewOrgLocation('');
      setNewOrgType('centre');
      setNewOrgLogo('');
      invalidateOrganisationCache();
      await loadOrganisations();
      setStatus({ message: `Organisation added: ${name}`, error: false });
    } catch (error) {
      setOrgsError(error.message || 'Could not add organisation.');
    } finally {
      setSavingOrgEdit(false);
    }
  };

  const saveEditedOrg = async () => {
    if (!editingOrgId) return;
    const name = editOrgName.trim();
    const slug = editOrgSlug.trim();
    if (!name || !slug) {
      setOrgsError('Organisation name and ID are required.');
      return;
    }

    setSavingOrgEdit(true);
    setOrgsError('');
    try {
      await updateOrganisation(editingOrgId, {
        name,
        slug,
        location: editOrgLocation.trim(),
        type: editOrgType,
        logoBase64: editOrgLogo,
      });
      setOrgsList(current => current.map(item => item.id === editingOrgId ? {
        ...item,
        name,
        slug,
        location: editOrgLocation.trim(),
        type: editOrgType,
        logoBase64: editOrgLogo,
      } : item));
      setEditingOrgId('');
      setEditOrgLogo('');
      invalidateOrganisationCache();
      setStatus({ message: `Updated: ${name}`, error: false });
    } catch (error) {
      setOrgsError(error.message || 'Could not update organisation.');
    } finally {
      setSavingOrgEdit(false);
    }
  };

  const openBulkImportTemplate = async () => {
    try {
      await Linking.openURL(BULK_IMPORT_TEMPLATE_URL);
    } catch (error) {
      setImportError(error?.message || 'Could not open the import template link.');
    }
  };

  const handleBulkImport = async () => {
    setImportError('');
    setImportResult(null);

    try {
      const picked = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-excel',
        ],
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (picked.canceled) return;

      const asset = picked.assets?.[0];
      if (!asset?.uri) {
        setImportError('No spreadsheet file was selected.');
        return;
      }

      setImporting(true);
      const base64 = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const workbook = XLSX.read(base64, { type: 'base64' });
      const requiredHeaders = ['hostName', 'startTime', 'eventType', 'audienceType', 'street', 'suburb', 'state', 'postcode'];
      const sheets = workbook.SheetNames.map(name => {
        const rows = XLSX.utils.sheet_to_json(workbook.Sheets[name], { header: 1, defval: '' });
        const headers = (rows[0] || []).map(value => String(value || '').trim());
        return {
          name,
          rows,
          headers,
          hasEventHeaders: requiredHeaders.every(header => headers.includes(header)),
        };
      });
      const selectedSheet = sheets.find(sheet => sheet.name.toLowerCase() === 'events' && sheet.hasEventHeaders)
        || sheets.find(sheet => sheet.hasEventHeaders);
      if (!selectedSheet) {
        setImportError('No Events worksheet with valid event-import headers was found. Please use the current PWA template.');
        return;
      }
      const rows = selectedSheet.rows;
      const dataRows = rows.slice(2)
        .map((row, index) => ({ row, rowNumber: index + 3 }))
        .filter(item => Array.isArray(item.row) && item.row.some(cell => String(cell ?? '').trim() !== ''));

      if (!dataRows.length) {
        setImportError('No data rows were found. Start your event data from Row 3 like the PWA template.');
        return;
      }

      const headers = selectedSheet.headers;
      const indexOfHeader = name => headers.findIndex(header => header === name);
      const readCell = (row, name, fallback = '') => {
        const idx = indexOfHeader(name);
        return idx >= 0 ? row[idx] : fallback;
      };

      const rawEvents = dataRows.map(({ row, rowNumber }) => ({
        _rowNumber: rowNumber,
        hostName: String(readCell(row, 'hostName')).trim(),
        hostPhone: String(readCell(row, 'hostPhone')).trim(),
        hostContact: String(readCell(row, 'hostContact')).trim(),
        eventDate: readCell(row, 'eventDate'),
        startTime: readCell(row, 'startTime'),
        endTime: readCell(row, 'endTime'),
        eventType: String(readCell(row, 'eventType')).trim(),
        customEventType: String(readCell(row, 'customEventType')).trim(),
        eventSubject: String(readCell(row, 'eventSubject')).trim(),
        audienceType: String(readCell(row, 'audienceType')).trim(),
        organiserType: String(readCell(row, 'organiserType', 'Private')).trim(),
        organisationSlug: String(readCell(row, 'organisationSlug')).trim(),
        street: String(readCell(row, 'street')).trim(),
        suburb: String(readCell(row, 'suburb')).trim(),
        state: String(readCell(row, 'state')).trim(),
        postcode: String(readCell(row, 'postcode')).trim(),
        speakerName: String(readCell(row, 'speakerName')).trim(),
        reciter1Type: String(readCell(row, 'reciter1Type')).trim(),
        reciter1Name: String(readCell(row, 'reciter1Name')).trim(),
        reciter2Type: String(readCell(row, 'reciter2Type')).trim(),
        reciter2Name: String(readCell(row, 'reciter2Name')).trim(),
        reciter3Type: String(readCell(row, 'reciter3Type')).trim(),
        reciter3Name: String(readCell(row, 'reciter3Name')).trim(),
        notes: String(readCell(row, 'notes')).trim(),
        enteredAsHijri: String(readCell(row, 'enteredAsHijri')).trim().toUpperCase() === 'TRUE',
        hijriDay: String(readCell(row, 'hijriDay')).trim(),
        hijriMonth: String(readCell(row, 'hijriMonth')).trim(),
        hijriYear: String(readCell(row, 'hijriYear')).trim(),
      }));

      const geocodedEvents = await geocodeImportRows(rawEvents);
      const result = await importBulkEvents(geocodedEvents);
      setImportResult(result);
      if (result?.errors?.length) {
        setImportError(result.message || 'Some rows need fixing before import can complete.');
      }
    } catch (error) {
      setImportError(error?.message || 'Import failed.');
    } finally {
      setImporting(false);
    }
  };

  const handleExportUpcomingEvents = async () => {
    const today = todayIso();
    const from = exportFrom < today ? today : exportFrom;
    const to = exportTo < today ? today : exportTo;
    if (from > to) {
      setExportResult({ message: 'The start date cannot be after the end date.', error: true });
      return;
    }

    setExporting(true);
    setExportResult({ message: '', error: false });
    try {
      const snapshot = await getDocs(collection(db, 'events'));
      const selectedCity = profile?.role === 'superAdmin' ? exportCity : getAdminCity(profile);
      const selectedEvents = snapshot.docs
        .map(item => ({ id: item.id, ...item.data() }))
        .filter(event => event.status === 'active' && event.hidden !== true)
        .filter(event => canAdminAccessEvent(profile, event))
        .filter(event => {
          const date = String(event.eventDate || '');
          if (!date || date < today || date < from || date > to) return false;
          return selectedCity === 'all' || getEventMetroArea(event) === selectedCity;
        })
        .sort(compareEventsByDateTime);

      if (!selectedEvents.length) {
        setExportResult({ message: 'No active upcoming events match this date range and location.', error: true });
        return;
      }

      const rows = selectedEvents.map(event => ({
        'Gregorian Date': exportDateLabel(event.eventDate),
        'Hijri Date': event.hijriDate || '',
        'Host Name': event.hostName || '',
        'Start Time': event.startTime || '',
        'End Time': event.endTime || '',
        'Event Type': event.eventTypeDisplay || event.customEventType || event.eventType || '',
        Subject: event.eventSubject || '',
        'Speaker Name': event.speakerName || '',
        'Audience Type': event.audienceType || '',
        Suburb: event.address?.suburb || event.suburb || '',
      }));
      const worksheet = XLSX.utils.json_to_sheet(rows);
      worksheet['!cols'] = [
        { wch: 15 }, { wch: 22 }, { wch: 28 }, { wch: 12 }, { wch: 12 },
        { wch: 18 }, { wch: 36 }, { wch: 24 }, { wch: 18 }, { wch: 20 },
      ];
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Upcoming Events');
      const locationName = selectedCity === 'all' ? 'All_Cities' : cityCode(selectedCity);
      const fileName = `Community_Events_Upcoming_${locationName}_${from}_to_${to}.xlsx`;
      const fileUri = `${FileSystem.cacheDirectory}${fileName}`;
      const fileBase64 = XLSX.write(workbook, { type: 'base64', bookType: 'xlsx' });
      await FileSystem.writeAsStringAsync(fileUri, fileBase64, { encoding: FileSystem.EncodingType.Base64 });
      await RNShare.open({
        title: 'Export upcoming events',
        url: fileUri,
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        filename: fileName,
        failOnCancel: false,
      });
      setExportResult({ message: `Prepared ${selectedEvents.length} upcoming event${selectedEvents.length === 1 ? '' : 's'} for export.`, error: false });
    } catch (error) {
      setExportResult({ message: error?.message || 'Could not export upcoming events.', error: true });
    } finally {
      setExporting(false);
    }
  };

  const confirmDeleteOrg = org => {
    Alert.alert(
      'Delete organisation?',
      `Delete ${org.name}? Existing events will simply stop using this organisation record.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setSavingOrgEdit(true);
            setOrgsError('');
            try {
              await deleteOrganisation(org.id);
              setOrgsList(current => current.filter(item => item.id !== org.id));
              if (editingOrgId === org.id) setEditingOrgId('');
              setStatus({ message: `Deleted: ${org.name}`, error: false });
            } catch (error) {
              setOrgsError(error.message || 'Could not delete organisation.');
            } finally {
              setSavingOrgEdit(false);
            }
          },
        },
      ]
    );
  };

  const saveHijriAdjustment = async () => {
    if (!canManageHijriSettings) {
      setStatus({ message: 'Only Super Admins can manage Hijri settings.', error: true });
      return;
    }
    const month = Number(anchorMonth);
    const year = Number(anchorYear);
    if (!month || month < 1 || month > 12) {
      setStatus({ message: 'Please select a valid Hijri month.', error: true });
      return;
    }
    if (!year || year < 1400) {
      setStatus({ message: 'Please enter a valid Hijri year.', error: true });
      return;
    }
    if (!anchorDate) {
      setStatus({ message: 'Please enter the Gregorian anchor date.', error: true });
      return;
    }

    setSettingsSaving(true);
    try {
      const overrides = await saveMonthOverride(year, month, anchorDate);
      const nextSettings = {
        ...(hijriSettings || {}),
        adjustmentDays: 0,
        anchorDate,
        anchorMonth: month,
        anchorYear: year,
        overrides,
      };
      await saveHijriSettings(nextSettings);
      const result = await recalculateHijriEventMetadata(overrides);
      setHijriSettings(nextSettings);
      setStatus({
        message: `Hijri setting saved. Recalculated ${result.updated} events — ${result.hijriEvents} Hijri-entered and ${result.gregEvents} Gregorian-entered.`,
        error: false,
      });
    } catch (error) {
      setStatus({ message: error.message || 'Could not save Hijri settings.', error: true });
    } finally {
      setSettingsSaving(false);
    }
  };

  const reminderCityScope = profile?.role === 'superAdmin' ? 'all' : getAdminCity(profile);

  const sendReminderNow = async () => {
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const payload = { mode: reminderMode, city: reminderCityScope };
      if (reminderMode === 'date') payload.date = reminderDate;
      if (reminderMode === 'range') {
        payload.from = reminderFrom;
        payload.to = reminderTo;
      }
      if (reminderMode === 'month') payload.month = reminderMonth;
      const result = await sendReminderEmailJob(payload);
      setReminderResult({ message: result.message || 'Reminder email queued.', error: false });
    } catch (error) {
      setReminderResult({ message: error?.message || 'Failed to queue reminder email.', error: true });
    } finally {
      setSendingReminder(false);
    }
  };

  const sendCommunityMessageNow = async () => {
    if (!communityMsg.trim()) {
      setReminderResult({ message: 'Enter a message before sending the community update.', error: true });
      return;
    }
    setSendingReminder(true);
    setReminderResult(null);
    try {
      const result = await sendCommunityUpdateMessage({
        message: communityMsg.trim(),
        city: reminderCityScope,
      });
      setReminderResult({ message: result.message || 'Community update queued.', error: false });
      setCommunityMsg('');
    } catch (error) {
      setReminderResult({ message: error?.message || 'Failed to queue the community update.', error: true });
    } finally {
      setSendingReminder(false);
    }
  };

  const confirmStoreAnnouncement = () => {
    Alert.alert(
      'Send store announcement?',
      'This will queue the App Store and Microsoft Store announcement for users with email reminders enabled.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          onPress: async () => {
            setSendingReminder(true);
            setReminderResult(null);
            try {
              const result = await sendStoreAnnouncement({ city: reminderCityScope });
              setReminderResult({ message: result.message || 'Store announcement queued.', error: false });
            } catch (error) {
              setReminderResult({ message: error?.message || 'Failed to queue the store announcement.', error: true });
            } finally {
              setSendingReminder(false);
            }
          },
        },
      ]
    );
  };

  const refreshYouTubeStatus = async () => {
    setYouTubeBusy(true);
    try {
      const result = await getYouTubeConnectionStatus();
      setYouTubeStatus(result.connected ? 'connected' : 'disconnected');
    } catch {
      setYouTubeStatus('disconnected');
    } finally {
      setYouTubeBusy(false);
    }
  };

  const connectYouTubeChannel = async () => {
    setYouTubeBusy(true);
    setThumbnailResult('');
    try {
      const url = await getYouTubeOAuthUrl();
      if (!url) throw new Error('Could not generate the YouTube connection link.');
      await Linking.openURL(url);
      setThumbnailResult('Browser opened for YouTube sign-in. After approval, return here and tap Refresh Connection.');
      setYouTubeStatus('disconnected');
    } catch (error) {
      setThumbnailResult(error?.message || 'Could not open the YouTube connection flow.');
    } finally {
      setYouTubeBusy(false);
    }
  };

  const updateStreamThumbnails = async () => {
    setThumbnailBusy(true);
    setThumbnailResult('');
    try {
      const result = await refreshYouTubeThumbnails({ limit: 10, force: true });
      const failed = Array.isArray(result.errors) && result.errors.length
        ? ` ${result.errors.length} failed.`
        : '';
      setThumbnailResult(`${result.message || 'Thumbnail update finished.'}${failed}`);
    } catch (error) {
      setThumbnailResult(error?.message || 'Thumbnail update failed.');
    } finally {
      setThumbnailBusy(false);
    }
  };

  const confirmRemoveOverride = override => {
    Alert.alert(
      'Remove month override?',
      `${HIJRI_MONTHS.find(item => item.value === Number(override.hMonth))?.name || 'Selected month'} ${override.hYear} will revert to automatic calculation.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            setSettingsSaving(true);
            try {
              const overrides = await removeMonthOverride(override.hYear, override.hMonth);
              const nextSettings = {
                ...(hijriSettings || {}),
                overrides,
              };
              await saveHijriSettings(nextSettings);
              const result = await recalculateHijriEventMetadata(overrides);
              setHijriSettings(nextSettings);
              setStatus({
                message: `Month override removed. Recalculated ${result.updated} events.`,
                error: false,
              });
            } catch (error) {
              setStatus({ message: error.message || 'Could not remove month override.', error: true });
            } finally {
              setSettingsSaving(false);
            }
          },
        },
      ]
    );
  };

  const persistHijriObservances = async nextItems => {
    const sorted = sortHijriObservances(nextItems);
    setHijriObservances(sorted);
    await saveHijriObservances(sorted);
  };

  const saveObservance = async () => {
    if (!canManageHijriSettings) {
      setStatus({ message: 'Only Super Admins can manage important Hijri dates.', error: true });
      return;
    }
    if (!hijriObsForm.name.trim()) {
      setStatus({ message: 'Please enter the important date name.', error: true });
      return;
    }

    const nextItem = {
      ...hijriObsForm,
      id: editingHijriObsId || hijriObsForm.id || slugHijriObservance(hijriObsForm.name),
      name: hijriObsForm.name.trim(),
      day: Math.max(1, Math.min(30, Number(hijriObsForm.day) || 1)),
      month: Math.max(1, Math.min(12, Number(hijriObsForm.month) || 1)),
      category: hijriObsForm.category || 'Event',
      priority: Number(hijriObsForm.priority || 50),
      enabled: hijriObsForm.enabled !== false,
      notes: hijriObsForm.notes || '',
    };

    setObservanceSaving(true);
    try {
      const merged = editingHijriObsId
        ? hijriObservances.map(item => item.id === editingHijriObsId ? nextItem : item)
        : [...hijriObservances.filter(item => item.id !== nextItem.id), nextItem];
      await persistHijriObservances(merged);
      resetHijriObservanceForm();
      setStatus({ message: 'Important Hijri date saved.', error: false });
    } catch (error) {
      setStatus({ message: error.message || 'Unable to save Hijri date.', error: true });
    } finally {
      setObservanceSaving(false);
    }
  };

  const toggleObservance = async item => {
    setObservanceSaving(true);
    try {
      await persistHijriObservances(hijriObservances.map(entry =>
        entry.id === item.id ? { ...entry, enabled: entry.enabled === false } : entry
      ));
      setStatus({
        message: item.enabled === false ? 'Important date enabled.' : 'Important date disabled.',
        error: false,
      });
    } catch (error) {
      setStatus({ message: error.message || 'Unable to update Hijri date.', error: true });
    } finally {
      setObservanceSaving(false);
    }
  };

  const confirmDeleteObservance = item => {
    Alert.alert(
      'Delete important date?',
      `Delete "${item.name}" from important Hijri dates?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setObservanceSaving(true);
            try {
              await persistHijriObservances(hijriObservances.filter(entry => entry.id !== item.id));
              if (editingHijriObsId === item.id) resetHijriObservanceForm();
              setStatus({ message: 'Important Hijri date deleted.', error: false });
            } catch (error) {
              setStatus({ message: error.message || 'Unable to delete Hijri date.', error: true });
            } finally {
              setObservanceSaving(false);
            }
          },
        },
      ]
    );
  };

  if (!canAccess) {
    return (
      <View style={styles.lockedWrap}>
        <Text style={styles.lockedTitle}>Admin Dashboard</Text>
        <Text style={styles.lockedText}>This area is available to admin accounts only.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      removeClippedSubviews={panel === 'events' || panel === 'users'}
      scrollEventThrottle={16}
    >
      {panel === 'overview' ? (
        <>
          <View style={styles.dashboardProfileCard}>
            <View style={styles.dashboardGlowLarge} />
            <View style={styles.dashboardGlowSmall} />
            <View style={styles.dashboardProfileTop}>
              <View style={styles.dashboardAvatar}>
                <Text style={styles.dashboardAvatarText}>{getInitials(adminDisplayName)}</Text>
              </View>
              <View style={styles.dashboardIdentity}>
                <Text style={styles.dashboardEyebrow}>WELCOME BACK</Text>
                <Text style={styles.dashboardName} numberOfLines={1}>{adminDisplayName}</Text>
                <View style={styles.dashboardRolePill}>
                  <Text style={styles.dashboardRoleIcon}>◆</Text>
                  <Text style={styles.dashboardRoleText}>{roleLabel}</Text>
                </View>
              </View>
            </View>
            <View style={styles.dashboardScopePill}>
              <Text style={styles.dashboardScopeIcon}>⌖</Text>
              <View style={styles.dashboardScopeTextWrap}>
                <Text style={styles.dashboardScopeLabel}>ADMIN SCOPE</Text>
                <Text style={styles.dashboardScopeValue}>{adminScopeLabel}</Text>
              </View>
            </View>
          </View>

          <View style={styles.dashboardIntroRow}>
            <View>
              <Text style={styles.dashboardTitle}>Admin Dashboard</Text>
              <Text style={styles.dashboardSubtitle}>Community overview and management</Text>
            </View>
            <View style={styles.dashboardLivePill}>
              <View style={styles.dashboardLiveDot} />
              <Text style={styles.dashboardLiveText}>LIVE</Text>
            </View>
          </View>

          <View style={styles.dashboardMetricsCard}>
            <View style={styles.dashboardMetricsRow}>
              {[
                { label: 'Users', value: usersLoading && !usersLoaded ? '…' : scopedUsers.length },
                { label: 'Active Events', value: stats.visibleEvents },
                { label: 'Organisations', value: orgsList.length },
                { label: 'Pending Feedback', value: feedbackThreads.filter(item => item.status !== 'resolved').length },
                { label: 'Inbox Items', value: feedbackThreads.length },
                { label: 'Videos Streamed', value: events.filter(item => item.liveUrl || item.liveSource || item.youtubeVideoId).length },
              ].map((metric, index) => (
                <React.Fragment key={metric.label}>
                  {index > 0 ? <View style={styles.dashboardMetricDivider} /> : null}
                  <View style={styles.dashboardMetric}>
                    <Text style={styles.dashboardMetricValue}>{metric.value}</Text>
                    <Text style={styles.dashboardMetricLabel}>{metric.label}</Text>
                  </View>
                </React.Fragment>
              ))}
            </View>
            <View style={styles.dashboardStatusRow}>
              <View style={styles.dashboardStatusCopy}>
                <View style={styles.dashboardStatusDot} />
                <Text style={styles.dashboardStatusText}>All systems live</Text>
              </View>
              <Text style={styles.dashboardStatusMeta}>
                {stats.visibleEvents} visible · {stats.hiddenEvents} hidden
              </Text>
            </View>
          </View>

          <View style={styles.dashboardToolsHead}>
            <Text style={styles.dashboardToolsTitle}>Admin tools</Text>
            <Text style={styles.dashboardToolsMeta}>{LIVE_ACTIONS.length} modules</Text>
          </View>

          {ADMIN_ACTION_GROUPS.map(group => (
            <View key={group.key} style={styles.dashboardGroup}>
              <Text style={styles.dashboardGroupTitle}>{group.title}</Text>
              <View style={styles.dashboardGroupCard}>
                {group.actions.map((actionKey, index) => {
                  const action = LIVE_ACTIONS.find(item => item.key === actionKey);
                  const meta = ADMIN_ACTION_META[actionKey] || { icon: '•', tone: colors.tealSoft };
                  if (!action) return null;
                  return (
                    <React.Fragment key={action.key}>
                      {index > 0 ? <View style={styles.dashboardActionDivider} /> : null}
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${action.title}`}
                        onPress={() => handleAction(action.key)}
                        style={({ pressed }) => [styles.dashboardActionRow, pressed && styles.dashboardActionPressed]}
                      >
                        <View style={[styles.dashboardActionIcon, { backgroundColor: meta.tone }]}>
                          <Text style={styles.dashboardActionIconText}>{meta.icon}</Text>
                        </View>
                        <View style={styles.dashboardActionCopy}>
                          <Text style={styles.dashboardActionTitle}>{action.title}</Text>
                          <Text style={styles.dashboardActionDescription} numberOfLines={2}>
                            {action.description}
                          </Text>
                        </View>
                        <Text style={styles.dashboardActionChevron}>›</Text>
                      </Pressable>
                    </React.Fragment>
                  );
                })}
              </View>
            </View>
          ))}

          {PWA_MODULES.length ? (
            <View style={styles.dashboardGroup}>
              <Text style={styles.dashboardGroupTitle}>Coming next</Text>
              <View style={styles.dashboardGroupCard}>
                {PWA_MODULES.map((module, index) => (
                  <React.Fragment key={module.key}>
                    {index > 0 ? <View style={styles.dashboardActionDivider} /> : null}
                    <View style={styles.dashboardActionRow}>
                      <View style={[styles.dashboardActionIcon, { backgroundColor: colors.background }]}>
                        <Text style={styles.dashboardActionIconText}>•</Text>
                      </View>
                      <View style={styles.dashboardActionCopy}>
                        <Text style={styles.dashboardActionTitle}>{module.title}</Text>
                        <Text style={styles.dashboardActionDescription}>{module.description}</Text>
                      </View>
                    </View>
                  </React.Fragment>
                ))}
              </View>
            </View>
          ) : null}
        </>
      ) : panel === 'users' ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Users</Text>
              <Text style={styles.sectionMeta}>User management and contact updates</Text>
            </View>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
              </Pressable>
              <Pressable onPress={loadUsers} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
              <Pressable onPress={exportUsersCsv} style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>⇩ Export CSV</Text>
              </Pressable>
            </View>
          </View>

          {false ? <><View style={styles.eventMetricGrid}>
            {[
              ['Active', adminEvents.length, () => { setAdminEventView('active'); setAdminStatusFilter('all'); setAdminSeriesFilter('all'); }],
              ['Archived', archivedAdminEvents.length, () => { setAdminEventView('archived'); setAdminStatusFilter('all'); }],
              ['Visible', adminEvents.filter(item => !item.hidden).length, () => { setAdminEventView('active'); setAdminStatusFilter('visible'); }],
              ['Hidden', adminEvents.filter(item => item.hidden).length, () => { setAdminEventView('active'); setAdminStatusFilter('hidden'); }],
              ['Live', adminEvents.filter(item => item.isLive).length, () => { setAdminEventView('active'); setAdminStatusFilter('live'); }],
              ['Recurring', adminEvents.filter(item => item.isRecurring || item.recurringSeriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('recurring'); }],
              ['Single', adminEvents.filter(item => !item.isRecurring && !item.recurringSeriesId && !item.seriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('single'); }],
              ['Old Series', adminEvents.filter(item => item.seriesId && !item.recurringSeriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('legacySeries'); }],
            ].map(([label, value, action]) => <Pressable key={label} onPress={action} style={styles.eventMetric}><Text style={styles.eventMetricValue}>{value}</Text><Text style={styles.eventMetricLabel}>{label}</Text></Pressable>)}
          </View>

          {transferEvent ? <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Transfer Event</Text>
            <Text style={styles.cardDescription}>Search for the new owner. Confirm Transfer stays disabled until a user is selected.</Text>
            <TextInput value={transferQuery} onChangeText={value => { setTransferQuery(value); setTransferUser(null); }} placeholder="Search user name, email or phone" placeholderTextColor={colors.muted} style={styles.input} />
            <View style={styles.stack}>{transferCandidates.map(item => { const selected = transferUser?.id === item.id; return <Pressable key={item.id} onPress={() => setTransferUser(item)} style={[styles.listRow, selected && styles.chipActive]}><View style={styles.listTextWrap}><Text style={[styles.listTitle, selected && styles.chipTextActive]}>{item.fullName || item.email || 'Unnamed user'}</Text><Text style={[styles.listMeta, selected && styles.chipTextActive]}>{item.email || item.phone || item.phoneNumber || cityLabel(normalizeCity(item.defaultCity || DEFAULT_CITY))}</Text></View>{selected ? <Text style={styles.chipTextActive}>✓</Text> : null}</Pressable>; })}</View>
            <View style={styles.rowWrap}><Pressable disabled={!transferUser || transferBusy} onPress={confirmTransfer} style={[styles.primaryButton, styles.rowButton, (!transferUser || transferBusy) && styles.disabledButton]}><Text style={styles.primaryButtonText}>{transferBusy ? 'Transferring…' : 'Confirm Transfer'}</Text></Pressable><Pressable onPress={() => { setTransferEvent(null); setTransferUser(null); }} style={[styles.secondaryButton, styles.rowButton]}><Text style={styles.secondaryButtonText}>Cancel</Text></Pressable></View>
          </View> : null}</> : null}

          <View style={styles.actionCard}>
            <View style={styles.statsRow}>
              <StatCard label="Total Users" value={scopedUsers.length} tone="teal" />
              <StatCard label="Showing" value={sortedFilteredUsers.length} />
              <StatCard label="Admins" value={scopedUsers.filter(item => item.role === 'admin').length} />
              <StatCard label="Super Admins" value={scopedUsers.filter(item => item.role === 'superAdmin').length} />
            </View>
          </View>

          <View style={styles.actionCard}>
            <TextInput
              value={userQuery}
              onChangeText={setUserQuery}
              placeholder="Search name, email or phone..."
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Role filter</Text>
            <View style={styles.rowWrap}>
              {[{ value: 'all', label: 'All' }, ...ROLE_OPTIONS].map(option => {
                const active = userRoleFilter === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setUserRoleFilter(option.value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.inputLabel}>Location filter</Text>
            <CompactSelect
              value={profile?.role === 'superAdmin' ? userCityFilter : getAdminCity(profile)}
              onChange={setUserCityFilter}
              options={(profile?.role === 'superAdmin' ? [{ value: 'all', label: 'All locations' }, ...CITY_OPTIONS] : CITY_OPTIONS.filter(city => city.value === getAdminCity(profile))).map(city => ({ value: city.value, label: city.value === 'all' ? city.label : `${cityCode(city.value)} - ${city.label.replace(', Australia', '')}` }))}
            />

            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: userCalendarSyncedOnly }}
              accessibilityLabel="Filter users who synced the calendar"
              onPress={() => setUserCalendarSyncedOnly(current => !current)}
              style={({ pressed }) => [
                styles.calendarSyncFilter,
                userCalendarSyncedOnly && styles.calendarSyncFilterActive,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.calendarSyncFilterIcon, userCalendarSyncedOnly && styles.calendarSyncFilterIconActive]}>
                <Text style={styles.calendarSyncFilterIconText}>{'\uD83D\uDCC5'}</Text>
              </View>
              <View style={styles.listTextWrap}>
                <Text style={[styles.calendarSyncFilterTitle, userCalendarSyncedOnly && styles.calendarSyncFilterTitleActive]}>
                  {userCalendarSyncedOnly ? 'Showing Synced Users' : `Calendar Sync (${scopedUsers.filter(item => item.calendarSynced === true || item.calendarSyncEnabled === true).length})`}
                </Text>
                <Text style={[styles.calendarSyncFilterMeta, userCalendarSyncedOnly && styles.calendarSyncFilterMetaActive]}>
                  {userCalendarSyncedOnly ? 'Tap to show all users' : 'Tap to filter synced users'}
                </Text>
              </View>
              <Text style={[styles.calendarSyncFilterArrow, userCalendarSyncedOnly && styles.calendarSyncFilterTitleActive]}>{'\u203A'}</Text>
            </Pressable>
          </View>

          {usersError ? (
            <View style={[styles.noticeBox, styles.noticeError]}>
              <Text style={[styles.noticeText, styles.noticeTextError]}>{usersError}</Text>
            </View>
          ) : null}

          {usersLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.tealDark} />
              <Text style={styles.cardDescription}>Loading users…</Text>
            </View>
          ) : sortedFilteredUsers.length ? (
            <View style={styles.cardList}>
              {sortedFilteredUsers.map(userRecord => {
                const isEditing = editingUserId === userRecord.id;
                const isCurrentUser = userRecord.id === user?.uid;
                const userCity = normalizeCity(userRecord.defaultCity || DEFAULT_CITY);
                const ownedEventCount = activeEventCountByOwner.get(userRecord.id) || 0;
                return (
                  <View key={userRecord.id} style={styles.actionCard}>
                    <View style={styles.cardTop}>
                      <View style={styles.listTextWrap}>
                        <Text style={styles.cardTitle}>
                          {userRecord.fullName || userRecord.displayName || 'Unnamed user'}{isCurrentUser ? ' (you)' : ''}
                        </Text>
                        <Text style={styles.cardDescription}>{userRecord.email || 'No email'}</Text>
                        {userRecord.phone || userRecord.phoneNumber ? (
                          <Text style={styles.listMeta}>{userRecord.phone || userRecord.phoneNumber}</Text>
                        ) : null}
                        <Text style={styles.listMeta}>{cityCode(userCity)} - {cityLabel(userCity).replace(', Australia', '')}</Text>
                        <View style={styles.rowWrap}>
                          <View style={styles.statusPill}><Text style={styles.statusPillText}>{cityCode(userCity)}</Text></View>
                          {userRecord.calendarSynced === true || userRecord.calendarSyncEnabled === true ? <View style={[styles.statusPill, styles.statusLive]}><Text style={styles.statusPillText}>Calendar Synced</Text></View> : null}
                        </View>
                      </View>
                      <View style={styles.rowWrap}>
                        <View style={[styles.statusPill, userRecord.role === 'superAdmin' ? styles.statusLive : undefined]}>
                          <Text style={styles.statusPillText}>{ROLE_OPTIONS.find(item => item.value === userRecord.role)?.label || userRecord.role || 'User'}</Text>
                        </View>
                        {isInactiveUserProfile(userRecord) ? (
                          <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>Inactive</Text>
                          </View>
                        ) : null}
                        {isOldMigratedProfile(userRecord) ? (
                          <View style={styles.statusPill}>
                            <Text style={styles.statusPillText}>Old Migrated</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    {!isEditing ? (
                      <View style={styles.rowWrap}>
                        <Pressable onPress={() => openUserEvents(userRecord)} style={styles.userEventsLink}>
                          <Text style={styles.userEventsLinkText}>View Events ({ownedEventCount})</Text>
                          <Text style={styles.userEventsLinkArrow}>{'\u203A'}</Text>
                        </Pressable>
                        <Pressable onPress={() => openUserEditor(userRecord)} style={styles.secondaryButton}>
                          <Text style={styles.secondaryButtonText}>Edit Details</Text>
                        </Pressable>
                        {profile?.role === 'superAdmin' && !isCurrentUser ? (
                          ROLE_OPTIONS.map(option => (
                            <Pressable
                              key={option.value}
                              onPress={() => changeUserRole(userRecord, option.value)}
                              disabled={savingUserRoleId === userRecord.id || userRecord.role === option.value}
                              style={[
                                styles.chip,
                                userRecord.role === option.value && styles.chipActive,
                                savingUserRoleId === userRecord.id && styles.disabledButton,
                              ]}
                            >
                              <Text style={[styles.chipText, userRecord.role === option.value && styles.chipTextActive]}>
                                {option.label}
                              </Text>
                            </Pressable>
                          ))
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.formCard}>
                        <Text style={styles.subsectionTitle}>Edit User</Text>

                        <Text style={styles.inputLabel}>Full name</Text>
                        <TextInput
                          value={editUserName}
                          onChangeText={setEditUserName}
                          placeholder="Full name"
                          style={styles.input}
                        />

                        <Text style={styles.inputLabel}>Email</Text>
                        <TextInput
                          value={editUserEmail}
                          onChangeText={setEditUserEmail}
                          placeholder="Email"
                          autoCapitalize="none"
                          keyboardType="email-address"
                          style={styles.input}
                        />

                        {profile?.role === 'superAdmin' ? (
                          <>
                            <Text style={styles.inputLabel}>Default location</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                              {CITY_OPTIONS.map(city => {
                                const active = editUserCity === city.value;
                                return (
                                  <Pressable
                                    key={city.value}
                                    onPress={() => setEditUserCity(city.value)}
                                    style={[styles.chip, active && styles.chipActive]}
                                  >
                                    <Text style={[styles.chipText, active && styles.chipTextActive]}>
                                      {cityCode(city.value)} - {city.label.replace(', Australia', '')}
                                    </Text>
                                  </Pressable>
                                );
                              })}
                            </ScrollView>
                          </>
                        ) : null}

                        <View style={styles.rowWrap}>
                          <Pressable
                            onPress={saveUserEditor}
                            disabled={savingUserEdit}
                            style={[styles.primaryButton, styles.rowButton, savingUserEdit && styles.disabledButton]}
                          >
                            <Text style={styles.primaryButtonText}>{savingUserEdit ? 'Saving…' : 'Save User'}</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => setEditingUserId('')}
                            style={[styles.secondaryButton, styles.rowButton]}
                          >
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>No users found</Text>
              <Text style={styles.cardDescription}>
                {scopedUsers.length ? 'No users match the current filters.' : 'No users are available for this admin scope yet.'}
              </Text>
            </View>
          )}
        </View>
      ) : panel === 'businesses' ? (
        <View style={styles.section}>
          <BusinessApprovalPanel onBack={() => setPanel('overview')} />
        </View>
      ) : panel === 'import' ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Import & Export</Text>
              <Text style={styles.sectionMeta}>Bulk event spreadsheets and upcoming-event reports</Text>
            </View>
            <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
            </Pressable>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Export Upcoming Events</Text>
            <Text style={styles.cardDescription}>Create an Excel report of active upcoming events for a date range and location. Archived, inactive and hidden events are excluded.</Text>
            <View style={styles.exportFields}>
              <View style={styles.exportField}>
                <Text style={styles.inputLabel}>From date</Text>
                <NativeDateTimeField value={exportFrom} minimumDate={new Date()} onChange={value => {
                  setExportFrom(value);
                  if (exportTo < value) setExportTo(value);
                  setExportResult({ message: '', error: false });
                }} compact />
              </View>
              <View style={styles.exportField}>
                <Text style={styles.inputLabel}>To date</Text>
                <NativeDateTimeField value={exportTo} minimumDate={new Date(`${exportFrom}T12:00:00`)} onChange={value => {
                  setExportTo(value);
                  setExportResult({ message: '', error: false });
                }} compact />
              </View>
            </View>
            <View style={styles.exportField}>
              <Text style={styles.inputLabel}>Location</Text>
              {profile?.role === 'superAdmin' ? (
                <CompactSelect
                  title="Choose export location"
                  value={exportCity}
                  onChange={value => {
                    setExportCity(value);
                    setExportResult({ message: '', error: false });
                  }}
                  options={[{ value: 'all', label: 'All cities' }, ...CITY_OPTIONS]}
                />
              ) : (
                <View style={styles.readOnlyField}><Text style={styles.readOnlyFieldText}>{cityLabel(getAdminCity(profile))}</Text></View>
              )}
            </View>
            <Pressable disabled={exporting} onPress={handleExportUpcomingEvents} style={[styles.primaryButton, exporting && styles.disabledButton]}>
              {exporting ? <ActivityIndicator color={colors.surface} size="small" /> : <Text style={styles.primaryButtonText}>Export Upcoming Events (.xlsx)</Text>}
            </Pressable>
            {exportResult.message ? (
              <View style={[styles.noticeBox, exportResult.error ? styles.noticeError : styles.noticeSuccess]}>
                <Text style={[styles.noticeText, exportResult.error && styles.noticeTextError]}>{exportResult.message}</Text>
              </View>
            ) : null}
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Import events from the PWA template</Text>
            <Text style={styles.cardDescription}>
              Download the template, fill it in, then upload it here. Native uses the same backend import function as the PWA.
            </Text>

            {[
              {
                number: '1',
                title: 'Download the Excel template',
                body: (
                  <Pressable onPress={openBulkImportTemplate} style={styles.secondaryButton}>
                    <Text style={styles.secondaryButtonText}>Download Template (.xlsx)</Text>
                  </Pressable>
                ),
              },
              {
                number: '2',
                title: 'Fill in the template',
                body: (
                  <Text style={styles.cardDescription}>
                    Start event data from Row 3. Required fields match the PWA import: Host Name, Event Date, Start Time, Event Type, Audience Type, and Address.
                  </Text>
                ),
              },
              {
                number: '3',
                title: 'Upload completed file',
                body: (
                  <Pressable
                    onPress={handleBulkImport}
                    disabled={importing}
                    style={[styles.primaryButton, importing && styles.disabledButton]}
                  >
                    <Text style={styles.primaryButtonText}>{importing ? 'Importing...' : 'Upload & Import'}</Text>
                  </Pressable>
                ),
              },
            ].map(step => (
              <View key={step.number} style={styles.importStepRow}>
                <View style={styles.importStepBadge}>
                  <Text style={styles.importStepBadgeText}>{step.number}</Text>
                </View>
                <View style={styles.importStepBody}>
                  <Text style={styles.subsectionTitle}>{step.title}</Text>
                  {step.body}
                </View>
              </View>
            ))}
          </View>

          {importError ? (
            <View style={[styles.noticeBox, styles.noticeError]}>
              <Text style={[styles.noticeText, styles.noticeTextError]}>{importError}</Text>
            </View>
          ) : null}

          {importResult ? (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>Import result</Text>
              <View style={[
                styles.noticeBox,
                importResult.errors?.length ? styles.noticeError : styles.noticeSuccess,
              ]}>
                <Text style={[
                  styles.noticeText,
                  importResult.errors?.length ? styles.noticeTextError : null,
                ]}>
                  {importResult.message || 'Import finished.'}
                </Text>
              </View>

              {importResult.errors?.length ? (
                <View style={styles.stack}>
                  {importResult.errors.map((item, index) => (
                    <View key={`${item.row}-${index}`} style={styles.listRowTall}>
                      <Text style={styles.listTitle}>Row {item.row}</Text>
                      <Text style={styles.cardDescription}>{item.errors.join(' • ')}</Text>
                    </View>
                  ))}
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : panel === 'events' ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Events</Text>
              <Text style={styles.sectionMeta}>Admin event management</Text>
            </View>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
              </Pressable>
              <Pressable onPress={() => loadAdminEvents(adminEventView)} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.eventMetricGrid}>
            {[
              ['Active', adminEvents.length, () => { setAdminEventView('active'); setAdminStatusFilter('all'); setAdminSeriesFilter('all'); }],
              ['Archived', archivedAdminEvents.length, () => { setAdminEventView('archived'); setAdminStatusFilter('all'); }],
              ['Visible', adminEvents.filter(item => !item.hidden).length, () => { setAdminEventView('active'); setAdminStatusFilter('visible'); }],
              ['Hidden', adminEvents.filter(item => item.hidden).length, () => { setAdminEventView('active'); setAdminStatusFilter('hidden'); }],
              ['Live', adminEvents.filter(item => item.isLive).length, () => { setAdminEventView('active'); setAdminStatusFilter('live'); }],
              ['Recurring', adminEvents.filter(item => item.isRecurring || item.recurringSeriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('recurring'); }],
              ['Single', adminEvents.filter(item => !item.isRecurring && !item.recurringSeriesId && !item.seriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('single'); }],
              ['Old Series', adminEvents.filter(item => item.seriesId && !item.recurringSeriesId).length, () => { setAdminEventView('active'); setAdminSeriesFilter('legacySeries'); }],
            ].map(([label, value, action]) => <Pressable key={label} onPress={action} style={styles.eventMetric}><Text style={styles.eventMetricValue}>{value}</Text><Text style={styles.eventMetricLabel}>{label}</Text></Pressable>)}
          </View>

          {adminOwnerFilterUid ? (
            <View style={styles.ownerFilterBanner}>
              <View style={styles.listTextWrap}>
                <Text style={styles.ownerFilterTitle}>Events submitted by {adminOwnerFilterName}</Text>
                <Text style={styles.ownerFilterMeta}>{displayedAdminEvents.length} matching active event{displayedAdminEvents.length === 1 ? '' : 's'}</Text>
              </View>
              <Pressable onPress={() => { setAdminOwnerFilterUid(''); setAdminOwnerFilterName(''); }} style={styles.ownerFilterClear}>
                <Text style={styles.ownerFilterClearText}>Show All</Text>
              </Pressable>
            </View>
          ) : null}

          <View style={styles.actionCard}>
            <View style={styles.rowWrap}>
              <Pressable
                onPress={() => setAdminEventView('active')}
                style={[styles.secondaryButton, adminEventView === 'active' && styles.secondaryButtonActive]}
              >
                <Text style={[styles.secondaryButtonText, adminEventView === 'active' && styles.secondaryButtonTextActive]}>
                  Active Events ({adminEvents.length})
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setAdminEventView('archived')}
                style={[styles.secondaryButton, adminEventView === 'archived' && styles.secondaryButtonActive]}
              >
                <Text style={[styles.secondaryButtonText, adminEventView === 'archived' && styles.secondaryButtonTextActive]}>
                  Archived Events ({archivedAdminEvents.length})
                </Text>
              </Pressable>
            </View>

            <TextInput
              value={adminEventQuery}
              onChangeText={setAdminEventQuery}
              placeholder="Search events, hosts, suburbs..."
              placeholderTextColor={colors.muted}
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Organiser type</Text>
            <CompactSelect value={adminEventType} onChange={setAdminEventType} options={[{ value: 'all', label: 'All organisers' }, { value: 'centre', label: 'Centre / Organisation' }, { value: 'private', label: 'Private host' }]} />
            {false ? <View style={styles.rowWrap}>
              {[
                ['all', 'All'],
                ['centre', 'Centre'],
                ['private', 'Private'],
              ].map(([value, label]) => {
                const active = adminEventType === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setAdminEventType(value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View> : null}

            <Text style={styles.inputLabel}>Event set type</Text>
            <CompactSelect value={adminSeriesFilter} onChange={setAdminSeriesFilter} options={[{ value: 'all', label: 'All event sets' }, { value: 'single', label: 'Single events' }, { value: 'recurring', label: 'Recurring events' }, { value: 'legacySeries', label: 'Old series' }]} />
            {false ? <View style={styles.rowWrap}>
              {[
                ['all', 'All'],
                ['single', 'Single'],
                ['recurring', 'Recurring'],
                ['legacySeries', 'Old Series'],
              ].map(([value, label]) => {
                const active = adminSeriesFilter === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setAdminSeriesFilter(value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View> : null}
          </View>

          {adminEventsError ? (
            <View style={[styles.noticeBox, styles.noticeError]}>
              <Text style={[styles.noticeText, styles.noticeTextError]}>{adminEventsError}</Text>
            </View>
          ) : null}

          {adminEventsLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.tealDark} />
              <Text style={styles.cardDescription}>Loading admin events…</Text>
            </View>
          ) : displayedAdminEvents.length ? (
            <View style={styles.cardList}>
              {displayedAdminEvents.map(event => {
                const series = Boolean(event.isSeries || event.seriesId || event.recurringSeriesId);
                const recurring = Boolean(event.isRecurring || event.recurringSeriesId);
                return (
                  <View key={event.id} style={styles.actionCard}>
                    <View style={styles.rowWrap}>
                      {adminEventView === 'archived' ? (
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>Archived</Text>
                        </View>
                      ) : (
                        <View style={[styles.statusPill, event.hidden ? undefined : styles.statusLive]}>
                          <Text style={styles.statusPillText}>{event.hidden ? 'Hidden' : 'Visible'}</Text>
                        </View>
                      )}
                      {series ? (
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>{recurring ? 'Recurring' : 'Series'}</Text>
                        </View>
                      ) : null}
                      {event.isLive ? (
                        <View style={styles.statusPill}>
                          <Text style={styles.statusPillText}>Live</Text>
                        </View>
                      ) : null}
                    </View>

                    <EventCard event={event} onPress={() => setSelectedEvent(event)} />
                    <Text style={styles.submissionAttribution}>{getSubmissionLine(event)}</Text>

                    {adminEventView !== 'archived' ? (
                      <View style={styles.rowWrap}>
                        <Pressable
                          onPress={() => handleToggleAdminVisibility(event)}
                          disabled={adminVisibilityBusyId === event.id}
                          style={[styles.secondaryButton, adminVisibilityBusyId === event.id && styles.disabledButton]}
                        >
                          <Text style={styles.secondaryButtonText}>
                            {adminVisibilityBusyId === event.id
                              ? 'Updating...'
                              : event.hidden ? 'Make Visible' : 'Hide Event'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => confirmDeleteAdminEvent(event)}
                          disabled={adminDeletingId === event.id}
                          style={[styles.ghostButtonDanger, adminDeletingId === event.id && styles.disabledButton]}
                        >
                          <Text style={styles.ghostButtonDangerText}>
                            {adminDeletingId === event.id ? 'Deleting...' : 'Delete'}
                          </Text>
                        </Pressable>
                        <Pressable onPress={() => openTransfer(event)} style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>⇄ Transfer</Text></Pressable>
                        {event.isLive && event.eventDate < todayIso() ? <Pressable onPress={() => updateEventSubmission(event.id, { isLive: false, liveUrl: '', liveEndedAt: new Date().toISOString() }).then(() => loadAdminEvents(adminEventView)).catch(nextError => Alert.alert('Could not remove stale live status', nextError?.message || 'Please try again.'))} style={styles.ghostButtonDanger}><Text style={styles.ghostButtonDangerText}>Remove Live Stale</Text></Pressable> : null}
                      </View>
                    ) : null}

                    {transferEvent?.id === event.id ? (
                      <View style={styles.inlineTransferPanel}>
                        <Text style={styles.inlineTransferTitle}>Transfer Event</Text>
                        <Text style={styles.inlineTransferMeta}>Type at least two characters, then select the new owner.</Text>
                        <TextInput
                          autoCapitalize="none"
                          autoCorrect={false}
                          value={transferQuery}
                          onChangeText={value => { setTransferQuery(value); setTransferUser(null); }}
                          placeholder="Search user name, email or phone"
                          placeholderTextColor={colors.muted}
                          style={styles.input}
                        />
                        {usersLoading ? (
                          <View style={styles.inlineTransferLoading}>
                            <ActivityIndicator color={colors.tealDark} size="small" />
                            <Text style={styles.inlineTransferMeta}>Loading users…</Text>
                          </View>
                        ) : null}
                        {!usersLoading && transferQuery.trim().length < 2 ? (
                          <Text style={styles.inlineTransferHint}>Enter at least two characters to search.</Text>
                        ) : null}
                        {!usersLoading && transferQuery.trim().length >= 2 && transferCandidates.length === 0 ? (
                          <Text style={styles.inlineTransferHint}>No matching users found.</Text>
                        ) : null}
                        {transferCandidates.length ? (
                          <View style={styles.transferDropdown}>
                            {transferCandidates.map(item => {
                              const selected = transferUser?.id === item.id;
                              return (
                                <Pressable
                                  key={item.id}
                                  onPress={() => setTransferUser(item)}
                                  style={[styles.transferResult, selected && styles.transferResultSelected]}
                                >
                                  <View style={styles.listTextWrap}>
                                    <Text style={[styles.transferResultName, selected && styles.transferResultTextSelected]}>{item.fullName || item.displayName || item.email || 'Unnamed user'}</Text>
                                    <Text style={[styles.transferResultMeta, selected && styles.transferResultTextSelected]}>{item.email || item.phone || item.phoneNumber || cityLabel(normalizeCity(item.defaultCity || DEFAULT_CITY))}</Text>
                                  </View>
                                  {selected ? <Text style={styles.transferResultCheck}>✓</Text> : null}
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}
                        <View style={styles.rowWrap}>
                          <Pressable
                            disabled={!transferUser || transferBusy}
                            onPress={confirmTransfer}
                            style={[styles.primaryButton, styles.rowButton, (!transferUser || transferBusy) && styles.disabledButton]}
                          >
                            <Text style={styles.primaryButtonText}>{transferBusy ? 'Transferring…' : transferUser ? `Transfer to ${transferUser.fullName || transferUser.displayName || transferUser.email}` : 'Select a User'}</Text>
                          </Pressable>
                          <Pressable onPress={() => { setTransferEvent(null); setTransferUser(null); setTransferQuery(''); }} style={[styles.secondaryButton, styles.rowButton]}>
                            <Text style={styles.secondaryButtonText}>Cancel</Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ) : (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>No events found</Text>
              <Text style={styles.cardDescription}>
                {adminEventSource.length
                  ? 'No events match the current filters.'
                  : adminEventView === 'archived'
                    ? 'No archived events are available for this admin view yet.'
                    : 'No active events are available for this admin view yet.'}
              </Text>
            </View>
          )}
        </View>
      ) : panel === 'repair' ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Hijri Repair Tool</Text>
              <Text style={styles.sectionMeta}>Super-admin repair for Hijri-entered events</Text>
            </View>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
              </Pressable>
              <Pressable onPress={loadRepairEvents} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          {!canManageHijriSettings ? (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>Repair tool access</Text>
              <Text style={styles.cardDescription}>This tool follows the PWA rule and is available to super admins only.</Text>
            </View>
          ) : (
            <>
              {repairMessage ? (
                <View style={[styles.noticeBox, repairMessage.toLowerCase().includes('could not') || repairMessage.toLowerCase().includes('only super admins') ? styles.noticeError : styles.noticeSuccess]}>
                  <Text style={[styles.noticeText, (repairMessage.toLowerCase().includes('could not') || repairMessage.toLowerCase().includes('only super admins')) && styles.noticeTextError]}>
                    {repairMessage}
                  </Text>
                </View>
              ) : null}

              {repairLoading ? (
                <View style={styles.loadingCard}>
                  <ActivityIndicator color={colors.tealDark} />
                  <Text style={styles.cardDescription}>Loading Hijri-entered events…</Text>
                </View>
              ) : (
                <>
                  <View style={styles.actionCard}>
                    <Text style={styles.cardTitle}>Select event to repair</Text>
                    <Text style={styles.cardDescription}>
                      Choose a Hijri-entered event, then correct the stored Hijri components and re-save the Gregorian event date.
                    </Text>

                    <View style={styles.stack}>
                      {repairEvents.map(event => {
                        const active = repairSelectedId === event.id;
                        return (
                          <Pressable
                            key={event.id}
                            onPress={() => setRepairSelectedId(event.id)}
                            style={[styles.listRowTall, active && styles.chipActive]}
                          >
                            <Text style={[styles.listTitle, active && styles.chipTextActive]}>
                              {(event.eventTypeDisplay || event.eventType || 'Event')} - {event.hostName || event.organiserName || 'Host'}
                            </Text>
                            <Text style={[styles.listMeta, active && styles.chipTextActive]}>
                              Stored Hijri: {event.hijriDate || 'Unavailable'} • Gregorian: {event.eventDate || 'Unavailable'}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>

                  {selectedRepairEvent ? (
                    <View style={styles.actionCard}>
                      <Text style={styles.cardTitle}>Repair selected event</Text>
                      <Text style={styles.cardDescription}>
                        Update the Hijri components, then native will regenerate the Gregorian event date from the active month overrides.
                      </Text>

                      <View style={styles.formRow}>
                        <View style={styles.flexField}>
                          <Text style={styles.inputLabel}>Day</Text>
                          <TextInput
                            value={fixDay}
                            onChangeText={value => setFixDay(value.replace(/\D/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            style={styles.input}
                          />
                        </View>
                        <View style={styles.flexField}>
                          <Text style={styles.inputLabel}>Month</Text>
                          <TextInput
                            value={fixMonth}
                            onChangeText={value => setFixMonth(value.replace(/\D/g, '').slice(0, 2))}
                            keyboardType="number-pad"
                            style={styles.input}
                          />
                        </View>
                        <View style={styles.flexField}>
                          <Text style={styles.inputLabel}>Year</Text>
                          <TextInput
                            value={fixYear}
                            onChangeText={value => setFixYear(value.replace(/\D/g, '').slice(0, 4))}
                            keyboardType="number-pad"
                            style={styles.input}
                          />
                        </View>
                      </View>

                      <Pressable
                        onPress={saveRepair}
                        disabled={fixingId === selectedRepairEvent.id}
                        style={[styles.primaryButton, fixingId === selectedRepairEvent.id && styles.disabledButton]}
                      >
                        <Text style={styles.primaryButtonText}>
                          {fixingId === selectedRepairEvent.id ? 'Saving repair…' : 'Save Hijri Repair'}
                        </Text>
                      </Pressable>
                    </View>
                  ) : null}
                </>
              )}
            </>
          )}
        </View>
      ) : panel === 'orgs' ? (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>Organisation Management</Text>
              <Text style={styles.sectionMeta}>Organisation names, IDs, locations, and types</Text>
            </View>
            <View style={styles.rowWrap}>
              <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
              </Pressable>
              <Pressable onPress={loadOrganisations} style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>Refresh</Text>
              </Pressable>
            </View>
          </View>

          <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Add Organisation</Text>
            <Text style={styles.cardDescription}>
              Add organisations here. Their logo appears on event cards when no poster is uploaded.
            </Text>

            <Text style={styles.inputLabel}>Organisation logo</Text>
            {newOrgLogo ? (
              <View style={styles.logoPreviewRow}>
                <Image source={{ uri: newOrgLogo }} style={styles.logoPreview} resizeMode="contain" />
                <View style={styles.logoPreviewActions}>
                  <Text style={styles.listMeta}>Logo ready</Text>
                  <View style={styles.rowWrap}>
                    <Pressable onPress={() => pickOrganisationLogo(setNewOrgLogo)} style={styles.secondaryButton}>
                      <Text style={styles.secondaryButtonText}>Change Logo</Text>
                    </Pressable>
                    <Pressable onPress={() => setNewOrgLogo('')} style={styles.ghostButtonDanger}>
                      <Text style={styles.ghostButtonDangerText}>Remove</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : (
              <Pressable onPress={() => pickOrganisationLogo(setNewOrgLogo)} style={styles.logoPickerBox}>
                <Text style={styles.logoPickerTitle}>Upload logo</Text>
                <Text style={styles.logoPickerText}>PNG with transparent background is preferred.</Text>
              </Pressable>
            )}

            <Text style={styles.inputLabel}>Organisation name</Text>
            <TextInput
              value={newOrgName}
              onChangeText={setNewOrgName}
              placeholder="Organisation name"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Organisation ID</Text>
            <TextInput
              value={newOrgSlug}
              onChangeText={setNewOrgSlug}
              placeholder="organisation-id"
              autoCapitalize="none"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Location</Text>
            <TextInput
              value={newOrgLocation}
              onChangeText={setNewOrgLocation}
              placeholder="Sydney, NSW"
              style={styles.input}
            />

            <Text style={styles.inputLabel}>Organisation type</Text>
            <View style={styles.rowWrap}>
              {ORGANISATION_TYPES.map(option => {
                const active = newOrgType === option.value;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setNewOrgType(option.value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>

            <Pressable
              onPress={saveNewOrg}
              disabled={savingOrgEdit}
              style={[styles.primaryButton, savingOrgEdit && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>{savingOrgEdit ? 'Saving…' : 'Add Organisation'}</Text>
            </Pressable>
          </View>

          {orgsError ? (
            <View style={[styles.noticeBox, styles.noticeError]}>
              <Text style={[styles.noticeText, styles.noticeTextError]}>{orgsError}</Text>
            </View>
          ) : null}

          {orgsLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.tealDark} />
              <Text style={styles.cardDescription}>Loading organisations…</Text>
            </View>
          ) : orgsList.length ? (
            <View style={styles.cardList}>
              {orgsList
                .slice()
                .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')))
                .map(org => {
                  const isEditing = editingOrgId === org.id;
                  return (
                    <View key={org.id} style={styles.actionCard}>
                      {!isEditing ? (
                        <>
                          <View style={styles.cardTop}>
                            <View style={styles.orgLogoSlot}>
                              {org.logoBase64 ? (
                                <Image source={{ uri: org.logoBase64 }} style={styles.orgLogoImage} resizeMode="contain" />
                              ) : (
                                <Text style={styles.orgLogoFallback}>Logo</Text>
                              )}
                            </View>
                            <View style={styles.listTextWrap}>
                              <Text style={styles.cardTitle}>{org.name}</Text>
                              <Text style={styles.listMeta}>ID: {org.slug || '—'}</Text>
                              <Text style={styles.listMeta}>Location: {org.location || '—'}</Text>
                            </View>
                            <View style={styles.statusPill}>
                              <Text style={styles.statusPillText}>{organisationTypeLabel(org.type)}</Text>
                            </View>
                          </View>
                          <View style={styles.rowWrap}>
                            <Pressable onPress={() => startEditOrg(org)} style={styles.secondaryButton}>
                              <Text style={styles.secondaryButtonText}>Edit</Text>
                            </Pressable>
                            <Pressable onPress={() => confirmDeleteOrg(org)} style={styles.ghostButtonDanger}>
                              <Text style={styles.ghostButtonDangerText}>Delete</Text>
                            </Pressable>
                          </View>
                        </>
                      ) : (
                        <View style={styles.formCard}>
                          <Text style={styles.subsectionTitle}>Edit Organisation</Text>

                          <Text style={styles.inputLabel}>Organisation logo</Text>
                          {editOrgLogo ? (
                            <View style={styles.logoPreviewRow}>
                              <Image source={{ uri: editOrgLogo }} style={styles.logoPreview} resizeMode="contain" />
                              <View style={styles.logoPreviewActions}>
                                <Text style={styles.listMeta}>Logo ready</Text>
                                <View style={styles.rowWrap}>
                                  <Pressable onPress={() => pickOrganisationLogo(setEditOrgLogo)} style={styles.secondaryButton}>
                                    <Text style={styles.secondaryButtonText}>Change Logo</Text>
                                  </Pressable>
                                  <Pressable onPress={() => setEditOrgLogo('')} style={styles.ghostButtonDanger}>
                                    <Text style={styles.ghostButtonDangerText}>Remove</Text>
                                  </Pressable>
                                </View>
                              </View>
                            </View>
                          ) : (
                            <Pressable onPress={() => pickOrganisationLogo(setEditOrgLogo)} style={styles.logoPickerBox}>
                              <Text style={styles.logoPickerTitle}>Upload logo</Text>
                              <Text style={styles.logoPickerText}>PNG with transparent background is preferred.</Text>
                            </Pressable>
                          )}

                          <Text style={styles.inputLabel}>Organisation name</Text>
                          <TextInput
                            value={editOrgName}
                            onChangeText={setEditOrgName}
                            placeholder="Organisation name"
                            style={styles.input}
                          />

                          <Text style={styles.inputLabel}>Organisation ID</Text>
                          <TextInput
                            value={editOrgSlug}
                            onChangeText={setEditOrgSlug}
                            placeholder="organisation-id"
                            autoCapitalize="none"
                            style={styles.input}
                          />

                          <Text style={styles.inputLabel}>Location</Text>
                          <TextInput
                            value={editOrgLocation}
                            onChangeText={setEditOrgLocation}
                            placeholder="Sydney, NSW"
                            style={styles.input}
                          />

                          <Text style={styles.inputLabel}>Organisation type</Text>
                          <View style={styles.rowWrap}>
                            {ORGANISATION_TYPES.map(option => {
                              const active = editOrgType === option.value;
                              return (
                                <Pressable
                                  key={option.value}
                                  onPress={() => setEditOrgType(option.value)}
                                  style={[styles.chip, active && styles.chipActive]}
                                >
                                  <Text style={[styles.chipText, active && styles.chipTextActive]}>{option.label}</Text>
                                </Pressable>
                              );
                            })}
                          </View>

                          <View style={styles.rowWrap}>
                            <Pressable
                              onPress={saveEditedOrg}
                              disabled={savingOrgEdit}
                              style={[styles.primaryButton, styles.rowButton, savingOrgEdit && styles.disabledButton]}
                            >
                              <Text style={styles.primaryButtonText}>{savingOrgEdit ? 'Saving…' : 'Save Organisation'}</Text>
                            </Pressable>
                            <Pressable onPress={() => setEditingOrgId('')} style={[styles.secondaryButton, styles.rowButton]}>
                              <Text style={styles.secondaryButtonText}>Cancel</Text>
                            </Pressable>
                          </View>
                        </View>
                      )}
                    </View>
                  );
                })}
            </View>
          ) : (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>No organisations yet</Text>
              <Text style={styles.cardDescription}>Add the first organisation to start using it in event creation.</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={styles.section}>
          <View style={styles.sectionHead}>
            <View>
              <Text style={styles.sectionTitle}>{panel === 'settings' ? 'Calendar Settings' : panel === 'messaging' ? 'Community Messaging' : panel === 'troubleshooting' ? 'Troubleshooting Management' : 'Tools'}</Text>
              <Text style={styles.sectionMeta}>{panel === 'settings' ? 'Hijri calendar adjustment only' : panel === 'messaging' ? 'Community updates and email reminders' : panel === 'troubleshooting' ? 'Diagnostics and tester support' : 'Live connections and utilities'}</Text>
            </View>
            <Pressable onPress={() => setPanel('overview')} style={styles.secondaryButton}>
              <Text style={styles.secondaryButtonText}>{'\u00AB'} Back</Text>
            </Pressable>
          </View>

          {status.message ? (
            <View style={[styles.noticeBox, status.error ? styles.noticeError : styles.noticeSuccess]}>
              <Text style={[styles.noticeText, status.error && styles.noticeTextError]}>{status.message}</Text>
            </View>
          ) : null}

          {panel === 'troubleshooting' ? <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Crash diagnostics</Text>
            <Text style={styles.cardDescription}>Production crash monitoring records the app version, screen context and anonymous diagnostic session. Typed messages, ABNs, phone numbers, email addresses and exact addresses are excluded.</Text>
            <Pressable onPress={() => Alert.alert('Report a Problem', 'Open Profile > Help & Policies, copy the Diagnostic Session ID, and include it with the steps that caused the problem.')} style={styles.primaryButton}><Text style={styles.primaryButtonText}>How to report a problem</Text></Pressable>
          </View> : null}

          {panel === 'messaging' ? <View style={[styles.actionCard, styles.messagingEmailCard]}>
            <Text style={styles.cardTitle}>Email Reminders</Text>
            <Text style={styles.cardDescription}>
              Queue reminder emails for a date, date range, or month. Admins send to their scoped city, while super admins can send to all cities.
            </Text>

            <Text style={styles.inputLabel}>Reminder mode</Text>
            <View style={styles.rowWrap}>
              {[
                ['date', 'Single Date'],
                ['range', 'Date Range'],
                ['month', 'Month'],
              ].map(([value, label]) => {
                const active = reminderMode === value;
                return (
                  <Pressable
                    key={value}
                    onPress={() => setReminderMode(value)}
                    style={[styles.chip, active && styles.chipActive]}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>

            {reminderMode === 'date' ? (
              <>
                <Text style={styles.inputLabel}>Date</Text>
                <NativeDateTimeField value={reminderDate} onChange={setReminderDate} accessibilityLabel="Select reminder date" />
              </>
            ) : null}

            {reminderMode === 'range' ? (
              <View style={styles.formRow}>
                <View style={styles.flexField}>
                  <Text style={styles.inputLabel}>From</Text>
                  <NativeDateTimeField value={reminderFrom} onChange={setReminderFrom} accessibilityLabel="Select reminder start date" />
                </View>
                <View style={styles.flexField}>
                  <Text style={styles.inputLabel}>To</Text>
                  <NativeDateTimeField value={reminderTo} onChange={setReminderTo} minimumDate={reminderFrom ? new Date(`${reminderFrom}T12:00:00`) : undefined} accessibilityLabel="Select reminder end date" />
                </View>
              </View>
            ) : null}

            {reminderMode === 'month' ? (
              <>
                <Text style={styles.inputLabel}>Month</Text>
                <NativeDateTimeField value={reminderMonth} valueFormat="month" onChange={setReminderMonth} accessibilityLabel="Select reminder month" />
              </>
            ) : null}

            <Pressable
              onPress={sendReminderNow}
              disabled={sendingReminder}
              style={[styles.primaryButton, sendingReminder && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>
                {sendingReminder ? 'Queueing reminder...' : 'Send Reminder Email Now'}
              </Text>
            </Pressable>
          </View> : null}

          {panel === 'messaging' ? <View style={[styles.actionCard, styles.messagingUpdateCard]}>
            <Text style={styles.cardTitle}>Community Update Message</Text>
            <Text style={styles.cardDescription}>
              Send a custom message to users with reminder emails enabled in the current admin scope.
            </Text>

            <Text style={styles.inputLabel}>Message</Text>
            <TextInput
              value={communityMsg}
              onChangeText={setCommunityMsg}
              placeholder="Write the update message to send to users..."
              multiline
              textAlignVertical="top"
              style={[styles.input, styles.multilineInput]}
            />

            <View style={styles.rowWrap}>
              <Pressable
                onPress={sendCommunityMessageNow}
                disabled={sendingReminder || !communityMsg.trim()}
                style={[styles.primaryButton, styles.rowButton, (sendingReminder || !communityMsg.trim()) && styles.disabledButton]}
              >
                <Text style={styles.primaryButtonText}>
                  {sendingReminder ? 'Queueing message...' : 'Send to All Users'}
                </Text>
              </Pressable>
            </View>

            {reminderResult ? (
              <View style={[styles.noticeBox, reminderResult.error ? styles.noticeError : styles.noticeSuccess]}>
                <Text style={[styles.noticeText, reminderResult.error && styles.noticeTextError]}>
                  {reminderResult.message}
                </Text>
              </View>
            ) : null}
          </View> : null}

          {panel === 'tools' ? <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>Event option management</Text>
            <Text style={styles.cardDescription}>Add approved Event Type and Reciter Type options. Existing values cannot be deleted, duplicates are blocked case-insensitively, and each addition records the administrator and time.</Text>
            <Text style={styles.inputLabel}>New Event Type</Text>
            <View style={styles.formRow}><View style={styles.flexField}><TextInput value={newEventType} onChangeText={setNewEventType} placeholder="Event type" placeholderTextColor={colors.muted} style={styles.input} /></View><Pressable disabled={optionBusy || newEventType.trim().length < 2} onPress={() => addEventOption('eventType', newEventType, setNewEventType)} style={[styles.primaryButton, (optionBusy || newEventType.trim().length < 2) && styles.disabledButton]}><Text style={styles.primaryButtonText}>＋ Add</Text></Pressable></View>
            <Text style={styles.inputLabel}>New Reciter Type</Text>
            <View style={styles.formRow}><View style={styles.flexField}><TextInput value={newReciterType} onChangeText={setNewReciterType} placeholder="Reciter type" placeholderTextColor={colors.muted} style={styles.input} /></View><Pressable disabled={optionBusy || newReciterType.trim().length < 2} onPress={() => addEventOption('reciterType', newReciterType, setNewReciterType)} style={[styles.primaryButton, (optionBusy || newReciterType.trim().length < 2) && styles.disabledButton]}><Text style={styles.primaryButtonText}>＋ Add</Text></Pressable></View>
            {optionStatus ? <Text style={styles.listMeta}>{optionStatus}</Text> : null}
          </View> : null}

          {panel === 'tools' ? <View style={styles.actionCard}>
            <Text style={styles.cardTitle}>YouTube Live Connection</Text>
            <Text style={styles.cardDescription}>
              Connect the Community Events YouTube channel and refresh stream thumbnails from native admin.
            </Text>

            <View style={styles.rowWrap}>
              <View style={[styles.statusPill, youtubeStatus === 'connected' ? styles.statusLive : undefined]}>
                <Text style={styles.statusPillText}>
                  {youtubeStatus === 'checking'
                    ? 'Checking'
                    : youtubeStatus === 'connected'
                      ? 'Connected'
                      : 'Disconnected'}
                </Text>
              </View>
              <Pressable
                onPress={refreshYouTubeStatus}
                disabled={youtubeBusy}
                style={[styles.secondaryButton, youtubeBusy && styles.disabledButton]}
              >
                <Text style={styles.secondaryButtonText}>
                  {youtubeBusy ? 'Checking...' : 'Refresh Connection'}
                </Text>
              </Pressable>
            </View>

            <Pressable
              onPress={connectYouTubeChannel}
              disabled={youtubeBusy}
              style={[styles.primaryButton, youtubeBusy && styles.disabledButton]}
            >
              <Text style={styles.primaryButtonText}>
                {youtubeBusy ? 'Opening...' : youtubeStatus === 'connected' ? 'Reconnect YouTube Channel' : 'Connect YouTube Channel'}
              </Text>
            </Pressable>

            <Text style={styles.listSubtle}>
              The sign-in opens in your browser. After approval, come back here and tap Refresh Connection.
            </Text>

            {profile?.role === 'superAdmin' ? (
              <Pressable
                onPress={updateStreamThumbnails}
                disabled={thumbnailBusy || youtubeStatus !== 'connected'}
                style={[styles.secondaryButton, (thumbnailBusy || youtubeStatus !== 'connected') && styles.disabledButton]}
              >
                <Text style={styles.secondaryButtonText}>
                  {thumbnailBusy ? 'Updating thumbnails...' : 'Update Stream Thumbnails'}
                </Text>
              </Pressable>
            ) : null}

            {thumbnailResult ? (
              <View style={[styles.noticeBox, thumbnailResult.toLowerCase().includes('failed') || thumbnailResult.toLowerCase().includes('could not') ? styles.noticeError : styles.noticeSuccess]}>
                <Text style={[styles.noticeText, (thumbnailResult.toLowerCase().includes('failed') || thumbnailResult.toLowerCase().includes('could not')) && styles.noticeTextError]}>
                  {thumbnailResult}
                </Text>
              </View>
            ) : null}
          </View> : null}

          {panel === 'settings' ? (!canManageHijriSettings ? (
            <View style={styles.actionCard}>
              <Text style={styles.cardTitle}>Hijri settings access</Text>
              <Text style={styles.cardDescription}>
                Hijri Calendar Adjustment follows the PWA access rule and is available to super admins only.
              </Text>
            </View>
          ) : settingsLoading ? (
            <View style={styles.loadingCard}>
              <ActivityIndicator color={colors.tealDark} />
              <Text style={styles.cardDescription}>Loading Hijri settings…</Text>
            </View>
          ) : (
            <>
              <View style={styles.actionCard}>
                <Text style={styles.cardTitle}>Hijri Calendar Adjustment</Text>
                <Text style={styles.cardDescription}>
                  Select the Gregorian date that corresponds to the 1st of the observed Hijri month. After saving, native recalculates stored event Hijri metadata too.
                </Text>

                <View style={styles.noticeInline}>
                  <Text style={styles.noticeInlineText}>Current Hijri month: {currentHijriDisplay || 'Unavailable'}</Text>
                </View>

                <Text style={styles.inputLabel}>Hijri month</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                  {HIJRI_MONTHS.map(month => {
                    const active = String(month.value) === String(anchorMonth);
                    return (
                      <Pressable
                        key={month.value}
                        onPress={() => setAnchorMonth(String(month.value))}
                        style={[styles.chip, active && styles.chipActive]}
                      >
                        <Text style={[styles.chipText, active && styles.chipTextActive]}>{month.name}</Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>

                <Text style={styles.inputLabel}>Hijri year</Text>
                <TextInput
                  value={anchorYear}
                  onChangeText={value => setAnchorYear(value.replace(/\D/g, '').slice(0, 4))}
                  keyboardType="number-pad"
                  placeholder="1448"
                  style={styles.input}
                />

                <Text style={styles.inputLabel}>Gregorian anchor date</Text>
                <NativeDateTimeField value={anchorDate} onChange={setAnchorDate} accessibilityLabel="Select Gregorian anchor date" />

                <Pressable
                  onPress={saveHijriAdjustment}
                  disabled={settingsSaving}
                  style={[styles.primaryButton, settingsSaving && styles.disabledButton]}
                >
                  <Text style={styles.primaryButtonText}>
                    {settingsSaving ? 'Saving and recalculating…' : 'Save Hijri Setting'}
                  </Text>
                </Pressable>

                {sortOverrides(hijriSettings.overrides || []).length ? (
                  <View style={styles.stack}>
                    <Text style={styles.subsectionTitle}>Saved Month Overrides</Text>
                    {sortOverrides(hijriSettings.overrides || []).map(item => (
                      <View key={`${item.hYear}-${item.hMonth}`} style={styles.listRow}>
                        <View style={styles.listTextWrap}>
                          <Text style={styles.listTitle}>
                            {HIJRI_MONTHS.find(month => month.value === Number(item.hMonth))?.name || `Month ${item.hMonth}`} {item.hYear}
                          </Text>
                          <Text style={styles.listMeta}>Gregorian start: {item.gDate}</Text>
                        </View>
                        <Pressable onPress={() => confirmRemoveOverride(item)} style={styles.ghostButton}>
                          <Text style={styles.ghostButtonText}>Remove</Text>
                        </Pressable>
                      </View>
                    ))}
                  </View>
                ) : null}
              </View>

              {false ? <View style={styles.actionCard}>
                <Text style={styles.cardTitle}>Important Hijri Dates</Text>
                <Text style={styles.cardDescription}>
                  Add, edit, disable, or delete the Islamic dates shown in the Hijri Calendar page.
                </Text>

                <View style={styles.rowWrap}>
                  <Pressable
                    onPress={() => resetHijriObservanceForm('__new__')}
                    style={[styles.secondaryButton, hijriObsSelection === '__new__' && styles.secondaryButtonActive]}
                  >
                    <Text style={[styles.secondaryButtonText, hijriObsSelection === '__new__' && styles.secondaryButtonTextActive]}>
                      New Important Date
                    </Text>
                  </Pressable>
                </View>

                <View style={styles.stack}>
                  {sortedObservances.map(item => (
                    <View key={item.id} style={styles.listRowTall}>
                      <Pressable style={styles.listTextWrap} onPress={() => editHijriObservance(item)}>
                        <Text style={styles.listTitle}>{item.name}</Text>
                        <Text style={styles.listMeta}>
                          {item.day} {HIJRI_MONTHS.find(month => month.value === Number(item.month))?.name || `Month ${item.month}`} • {item.category}
                        </Text>
                        {item.notes ? <Text style={styles.listSubtle}>{item.notes}</Text> : null}
                      </Pressable>
                      <View style={styles.rowWrap}>
                        <Pressable onPress={() => toggleObservance(item)} style={styles.ghostButton}>
                          <Text style={styles.ghostButtonText}>{item.enabled === false ? 'Enable' : 'Disable'}</Text>
                        </Pressable>
                        <Pressable onPress={() => confirmDeleteObservance(item)} style={styles.ghostButtonDanger}>
                          <Text style={styles.ghostButtonDangerText}>Delete</Text>
                        </Pressable>
                      </View>
                    </View>
                  ))}
                </View>

                {(hijriObsSelection === '__new__' || editingHijriObsId) ? (
                  <View style={styles.formCard}>
                    <Text style={styles.subsectionTitle}>{editingHijriObsId ? 'Edit Important Date' : 'New Important Date'}</Text>

                    <Text style={styles.inputLabel}>Name</Text>
                    <TextInput
                      value={hijriObsForm.name}
                      onChangeText={value => setHijriObsForm(current => ({ ...current, name: value }))}
                      placeholder="Important date name"
                      style={styles.input}
                    />

                    <View style={styles.formRow}>
                      <View style={styles.flexField}>
                        <Text style={styles.inputLabel}>Day</Text>
                        <TextInput
                          value={hijriObsForm.day}
                          onChangeText={value => setHijriObsForm(current => ({ ...current, day: value.replace(/\D/g, '').slice(0, 2) }))}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.flexField}>
                        <Text style={styles.inputLabel}>Month</Text>
                        <TextInput
                          value={hijriObsForm.month}
                          onChangeText={value => setHijriObsForm(current => ({ ...current, month: value.replace(/\D/g, '').slice(0, 2) }))}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </View>
                      <View style={styles.flexField}>
                        <Text style={styles.inputLabel}>Priority</Text>
                        <TextInput
                          value={hijriObsForm.priority}
                          onChangeText={value => setHijriObsForm(current => ({ ...current, priority: value.replace(/\D/g, '').slice(0, 3) }))}
                          keyboardType="number-pad"
                          style={styles.input}
                        />
                      </View>
                    </View>

                    <Text style={styles.inputLabel}>Category</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                      {HIJRI_OBSERVANCE_CATEGORIES.map(category => {
                        const active = hijriObsForm.category === category;
                        return (
                          <Pressable
                            key={category}
                            onPress={() => setHijriObsForm(current => ({ ...current, category }))}
                            style={[styles.chip, active && styles.chipActive]}
                          >
                            <Text style={[styles.chipText, active && styles.chipTextActive]}>{category}</Text>
                          </Pressable>
                        );
                      })}
                    </ScrollView>

                    <Text style={styles.inputLabel}>Notes</Text>
                    <TextInput
                      value={hijriObsForm.notes}
                      onChangeText={value => setHijriObsForm(current => ({ ...current, notes: value }))}
                      placeholder="Optional notes"
                      multiline
                      textAlignVertical="top"
                      style={[styles.input, styles.multilineInput]}
                    />

                    <Pressable
                      onPress={() => setHijriObsForm(current => ({ ...current, enabled: !current.enabled }))}
                      style={[styles.toggleBox, hijriObsForm.enabled && styles.toggleBoxActive]}
                    >
                      <Text style={[styles.toggleBoxText, hijriObsForm.enabled && styles.toggleBoxTextActive]}>
                        {hijriObsForm.enabled ? 'Shown to users' : 'Hidden from users'}
                      </Text>
                    </Pressable>

                    <View style={styles.rowWrap}>
                      <Pressable
                        onPress={saveObservance}
                        disabled={observanceSaving}
                        style={[styles.primaryButton, observanceSaving && styles.disabledButton, styles.rowButton]}
                      >
                        <Text style={styles.primaryButtonText}>{observanceSaving ? 'Saving…' : 'Save Important Date'}</Text>
                      </Pressable>
                      <Pressable onPress={() => resetHijriObservanceForm()} style={[styles.secondaryButton, styles.rowButton]}>
                        <Text style={styles.secondaryButtonText}>Cancel</Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View> : null}
            </>
          )) : null}
        </View>
      )}

      <EventDetailsModal
        event={selectedEvent}
        visible={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        isGuest={false}
        user={user}
        profile={profile}
        onEdit={adminEventView !== 'archived' && onEditEvent ? event => { setSelectedEvent(null); onEditEvent(event); } : undefined}
        onCopy={adminEventView !== 'archived' && onCopyEvent ? event => { setSelectedEvent(null); onCopyEvent(event); } : undefined}
        onEditSeries={adminEventView !== 'archived' && onEditSeries && (selectedEvent?.seriesId || selectedEvent?.recurringSeriesId) ? event => { setSelectedEvent(null); onEditSeries(event); } : undefined}
        onToggleVisibility={adminEventView !== 'archived' ? event => { setSelectedEvent(null); handleToggleAdminVisibility(event); } : undefined}
        onTransfer={adminEventView !== 'archived' ? event => { setSelectedEvent(null); openTransfer(event); } : undefined}
        onRemoveLiveStale={adminEventView !== 'archived' && selectedEvent?.isLive && selectedEvent?.eventDate < todayIso() ? event => { setSelectedEvent(null); updateEventSubmission(event.id, { isLive: false, liveUrl: '', liveEndedAt: new Date().toISOString() }).then(() => loadAdminEvents(adminEventView)).catch(nextError => Alert.alert('Could not remove stale live status', nextError?.message || 'Please try again.')); } : undefined}
        onDelete={adminEventView !== 'archived' ? event => {
          setSelectedEvent(null);
          confirmDeleteAdminEvent(event);
        } : undefined}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  messagingUpdateCard: { order: 1 },
  messagingEmailCard: { order: 2 },
  eventMetricGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  eventMetric: { width: '22%', minWidth: 72, flexGrow: 1, minHeight: 66, alignItems: 'center', justifyContent: 'center', padding: spacing.sm, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  eventMetricValue: { color: colors.tealDark, fontSize: 20, fontWeight: '900' },
  eventMetricLabel: { marginTop: 3, color: colors.muted, fontSize: 9, fontWeight: '900', textAlign: 'center' },
  dashboardProfileCard: {
    position: 'relative',
    overflow: 'hidden',
    padding: spacing.md,
    borderRadius: 20,
    backgroundColor: '#08786c',
    gap: spacing.sm,
    shadowColor: '#064b44',
    shadowOpacity: 0.2,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 5,
  },
  dashboardGlowLarge: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 999,
    right: -90,
    top: -105,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  dashboardGlowSmall: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 999,
    left: -45,
    bottom: -70,
    backgroundColor: 'rgba(0,45,40,0.14)',
  },
  dashboardProfileTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  dashboardAvatar: {
    width: 66,
    height: 66,
    borderRadius: 22,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.65)',
    backgroundColor: 'rgba(255,255,255,0.20)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardAvatarText: {
    color: '#ffffff',
    fontSize: 23,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  dashboardIdentity: {
    flex: 1,
    gap: 3,
  },
  dashboardEyebrow: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.4,
  },
  dashboardName: {
    color: '#ffffff',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '900',
  },
  dashboardRolePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 3,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: 'rgba(255,255,255,0.16)',
  },
  dashboardRoleIcon: {
    color: '#d9fff8',
    fontSize: 9,
  },
  dashboardRoleText: {
    color: '#ffffff',
    fontSize: 11,
    fontWeight: '900',
  },
  dashboardScopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
    backgroundColor: 'rgba(4,56,51,0.22)',
  },
  dashboardScopeIcon: {
    color: '#ffffff',
    fontSize: 22,
    fontWeight: '900',
  },
  dashboardScopeTextWrap: {
    flex: 1,
    gap: 1,
  },
  dashboardScopeLabel: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  dashboardScopeValue: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '900',
  },
  dashboardIntroRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  dashboardTitle: {
    color: colors.navy,
    fontSize: 25,
    lineHeight: 30,
    fontWeight: '900',
    letterSpacing: -0.5,
  },
  dashboardSubtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    marginTop: 2,
  },
  dashboardLivePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: colors.tealSoft,
  },
  dashboardLiveDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#19a974',
  },
  dashboardLiveText: {
    color: colors.tealDark,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  dashboardMetricsCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow,
  },
  dashboardMetricsRow: {
    minHeight: 96,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    paddingHorizontal: spacing.sm,
  },
  dashboardMetric: {
    width: '32%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  dashboardMetricDivider: {
    width: 0,
    height: 0,
    backgroundColor: colors.border,
  },
  dashboardMetricValue: {
    color: colors.navy,
    fontSize: 18,
    lineHeight: 21,
    fontWeight: '900',
  },
  dashboardMetricLabel: {
    color: colors.muted,
    fontSize: 8.5,
    fontWeight: '800',
    marginTop: 2,
  },
  dashboardStatusRow: {
    minHeight: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: '#fbfdfd',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  dashboardStatusCopy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  dashboardStatusDot: {
    width: 7,
    height: 7,
    borderRadius: 999,
    backgroundColor: '#19a974',
  },
  dashboardStatusText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '800',
  },
  dashboardStatusMeta: {
    color: colors.muted,
    fontSize: 10,
    fontWeight: '700',
  },
  dashboardToolsHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  dashboardToolsTitle: {
    color: colors.navy,
    fontSize: 20,
    fontWeight: '900',
  },
  dashboardToolsMeta: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  dashboardGroup: {
    gap: spacing.sm,
  },
  dashboardGroupTitle: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
    paddingLeft: 2,
  },
  dashboardGroupCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
    ...shadow,
  },
  dashboardActionRow: {
    minHeight: 82,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 11,
  },
  dashboardActionPressed: {
    backgroundColor: '#f1f8f7',
  },
  dashboardActionDivider: {
    height: 1,
    marginLeft: 76,
    backgroundColor: '#e8efee',
  },
  dashboardActionIcon: {
    width: 46,
    height: 46,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardActionIconText: {
    color: colors.tealDark,
    fontSize: 21,
    lineHeight: 26,
    fontWeight: '900',
  },
  dashboardActionCopy: {
    flex: 1,
    gap: 2,
  },
  dashboardActionTitle: {
    color: colors.navy,
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '900',
  },
  dashboardActionDescription: {
    color: colors.muted,
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '600',
  },
  dashboardActionChevron: {
    color: '#a7b5b3',
    fontSize: 28,
    lineHeight: 30,
    fontWeight: '500',
  },
  hero: {
    gap: spacing.sm,
  },
  title: {
    color: colors.navy,
    fontSize: 34,
    lineHeight: 38,
    fontWeight: '900',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    fontWeight: '600',
  },
  identityCard: {
    marginTop: spacing.sm,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadow,
  },
  identityName: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  rolePill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: colors.tealSoft,
    borderWidth: 1,
    borderColor: '#b7e8d7',
  },
  rolePillText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  statCard: {
    minWidth: '22%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    ...shadow,
  },
  statCardTeal: {
    backgroundColor: colors.tealSoft,
    borderColor: '#b7e8d7',
  },
  statValue: {
    color: colors.navy,
    fontSize: 22,
    fontWeight: '900',
  },
  statLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
    marginTop: spacing.xs,
  },
  section: {
    gap: spacing.md,
  },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: spacing.sm,
    alignItems: 'flex-end',
    flexWrap: 'wrap',
  },
  sectionTitle: {
    color: colors.navy,
    fontSize: 18,
    fontWeight: '900',
  },
  sectionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '800',
  },
  cardList: {
    gap: spacing.md,
  },
  submissionAttribution: { marginTop: -4, paddingHorizontal: 2, color: colors.muted, fontSize: 11, lineHeight: 16, fontStyle: 'italic', fontWeight: '700' },
  ownerFilterBanner: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  ownerFilterTitle: { color: colors.tealDark, fontSize: 14, lineHeight: 19, fontWeight: '900' },
  ownerFilterMeta: { color: colors.muted, fontSize: 11, fontWeight: '700' },
  ownerFilterClear: { minHeight: 38, justifyContent: 'center', paddingHorizontal: spacing.md, borderRadius: radius.sm, backgroundColor: colors.surface },
  ownerFilterClearText: { color: colors.tealDark, fontSize: 11, fontWeight: '900' },
  userEventsLink: { minHeight: 42, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: colors.tealSoft },
  userEventsLinkText: { color: colors.tealDark, fontSize: 12, fontWeight: '900' },
  userEventsLinkArrow: { color: colors.tealDark, fontSize: 20, lineHeight: 22, fontWeight: '900' },
  inlineTransferPanel: { gap: spacing.sm, marginTop: spacing.xs, padding: spacing.md, borderWidth: 1, borderColor: colors.teal, borderRadius: radius.md, backgroundColor: '#f2fbf9' },
  inlineTransferTitle: { color: colors.navy, fontSize: 16, fontWeight: '900' },
  inlineTransferMeta: { color: colors.muted, fontSize: 11, lineHeight: 16, fontWeight: '700' },
  inlineTransferHint: { paddingVertical: spacing.sm, color: colors.muted, fontSize: 11, fontStyle: 'italic', textAlign: 'center' },
  inlineTransferLoading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
  transferDropdown: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  transferResult: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.sm, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  transferResultSelected: { backgroundColor: colors.teal },
  transferResultName: { color: colors.navy, fontSize: 13, fontWeight: '900' },
  transferResultMeta: { color: colors.muted, fontSize: 10, lineHeight: 14, fontWeight: '700' },
  transferResultTextSelected: { color: colors.surface },
  transferResultCheck: { color: colors.surface, fontSize: 18, fontWeight: '900' },
  actionCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.sm,
    ...shadow,
  },
  loadingCard: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    gap: spacing.md,
    alignItems: 'center',
    ...shadow,
  },
  importStepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  importStepBadge: {
    width: 30,
    height: 30,
    borderRadius: 999,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  importStepBadgeText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: '900',
  },
  importStepBody: {
    flex: 1,
    gap: spacing.sm,
  },
  exportFields: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  exportField: {
    flex: 1,
    minWidth: 150,
    gap: spacing.xs,
  },
  readOnlyField: {
    minHeight: 50,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.background,
  },
  readOnlyFieldText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '800',
  },
  logoPickerBox: {
    minHeight: 96,
    borderRadius: radius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#b9ccc8',
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.md,
    gap: spacing.xs,
  },
  logoPickerTitle: {
    color: colors.tealDark,
    fontSize: 14,
    fontWeight: '900',
  },
  logoPickerText: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  logoPreviewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  logoPreview: {
    width: 72,
    height: 72,
    borderRadius: radius.md,
    backgroundColor: '#f4f9f8',
  },
  logoPreviewActions: {
    flex: 1,
    gap: spacing.sm,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  orgLogoSlot: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#f4f9f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  orgLogoImage: {
    width: '100%',
    height: '100%',
  },
  orgLogoFallback: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '800',
  },
  cardTitle: {
    flex: 1,
    color: colors.navy,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '900',
  },
  cardDescription: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '600',
  },
  statusPill: {
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: colors.background,
    borderWidth: 1,
    borderColor: colors.border,
  },
  statusLive: {
    backgroundColor: colors.tealSoft,
    borderColor: '#b7e8d7',
  },
  statusPillText: {
    color: colors.tealDark,
    fontSize: 11,
    fontWeight: '900',
  },
  calendarSyncFilter: {
    minHeight: 64,
    marginTop: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  calendarSyncFilterActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  calendarSyncFilterIcon: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: '#eef2ff',
  },
  calendarSyncFilterIconActive: {
    backgroundColor: colors.surface,
  },
  calendarSyncFilterIconText: {
    fontSize: 22,
  },
  calendarSyncFilterTitle: {
    color: colors.navy,
    fontSize: 13,
    fontWeight: '900',
  },
  calendarSyncFilterTitleActive: {
    color: colors.tealDark,
  },
  calendarSyncFilterMeta: {
    marginTop: 2,
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
  },
  calendarSyncFilterMetaActive: {
    color: colors.tealDark,
  },
  calendarSyncFilterArrow: {
    color: colors.muted,
    fontSize: 24,
    fontWeight: '900',
  },
  primaryButton: {
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  primaryButtonText: {
    color: colors.surface,
    fontSize: 14,
    fontWeight: '900',
  },
  secondaryButton: {
    minHeight: 42,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  secondaryButtonActive: {
    backgroundColor: colors.tealSoft,
    borderColor: colors.teal,
  },
  secondaryButtonText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  secondaryButtonTextActive: {
    color: colors.tealDark,
  },
  disabledButton: {
    opacity: 0.6,
  },
  noticeBox: {
    borderRadius: radius.md,
    padding: spacing.md,
    borderWidth: 1,
  },
  noticeSuccess: {
    backgroundColor: colors.tealSoft,
    borderColor: '#b7e8d7',
  },
  noticeError: {
    backgroundColor: '#fff1f0',
    borderColor: '#f3c6c2',
  },
  noticeText: {
    color: colors.tealDark,
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '700',
  },
  noticeTextError: {
    color: colors.danger,
  },
  noticeInline: {
    borderRadius: radius.md,
    padding: spacing.md,
    backgroundColor: colors.tealSoft,
  },
  noticeInlineText: {
    color: colors.tealDark,
    fontSize: 13,
    fontWeight: '800',
  },
  inputLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '900',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  input: {
    minHeight: 50,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  multilineInput: {
    minHeight: 96,
    paddingVertical: spacing.md,
  },
  chipRow: {
    gap: spacing.sm,
    paddingRight: spacing.sm,
  },
  chip: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
  },
  chipActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  chipText: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '800',
  },
  chipTextActive: {
    color: colors.surface,
  },
  stack: {
    gap: spacing.sm,
  },
  subsectionTitle: {
    color: colors.navy,
    fontSize: 15,
    fontWeight: '900',
  },
  listRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  listRowTall: {
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: spacing.md,
  },
  listTextWrap: {
    flex: 1,
    gap: spacing.xs,
  },
  listTitle: {
    color: colors.navy,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '900',
  },
  listMeta: {
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  listSubtle: {
    color: colors.muted,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
    fontWeight: '600',
  },
  ghostButton: {
    minHeight: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  ghostButtonText: {
    color: colors.tealDark,
    fontSize: 12,
    fontWeight: '900',
  },
  ghostButtonDanger: {
    minHeight: 38,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#f3c6c2',
    backgroundColor: '#fff1f0',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  ghostButtonDangerText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '900',
  },
  formCard: {
    marginTop: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: '#fbfffe',
    gap: spacing.sm,
  },
  formRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  flexField: {
    flex: 1,
    minWidth: 92,
    gap: spacing.xs,
  },
  rowWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  rowButton: {
    flex: 1,
    minWidth: 140,
  },
  toggleBox: {
    minHeight: 46,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  toggleBoxActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealSoft,
  },
  toggleBoxText: {
    color: colors.text,
    fontSize: 13,
    fontWeight: '800',
  },
  toggleBoxTextActive: {
    color: colors.tealDark,
  },
  lockedWrap: {
    flex: 1,
    padding: spacing.xl,
    gap: spacing.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  lockedTitle: {
    color: colors.navy,
    fontSize: 28,
    fontWeight: '900',
  },
  lockedText: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.82,
  },
});
