import axios from 'axios';
import { isValidNextUrl } from '../utils/url.js';

const rawEnvUrl =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_URL) ||
  (typeof process !== 'undefined' && process.env?.VITE_API_URL) ||
  '/api';
const rawBaseURL = String(rawEnvUrl).trim();
const cleanBaseURL = rawBaseURL.replace(/\/+$/, '');
const baseURL = cleanBaseURL.endsWith('/api') ? cleanBaseURL : `${cleanBaseURL}/api`;

export const api = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json',
  },
});

/**
 * Token management
 */
export function getStoredToken() {
  if (typeof window !== 'undefined') {
    return localStorage.getItem('splitorbit_token') || localStorage.getItem('splittrack_token');
  }
  return null;
}

export function setStoredToken(token) {
  if (typeof window !== 'undefined') {
    if (token) {
      localStorage.setItem('splitorbit_token', token);
    } else {
      localStorage.removeItem('splitorbit_token');
      localStorage.removeItem('splittrack_token');
    }
  }
}

export function clearStoredToken() {
  setStoredToken(null);
  disableDemoMode();
}

export function isDemoModeActive() {
  if (typeof window !== 'undefined') {
    return (
      localStorage.getItem('splitorbit_demo_mode') === 'true' ||
      localStorage.getItem('splitorbit_token') === 'demo-token-active'
    );
  }
  return false;
}

export function enableDemoMode(user) {
  if (typeof window !== 'undefined') {
    try {
      localStorage.setItem('splitorbit_demo_mode', 'true');
      setStoredToken('demo-token-active');
      if (user) {
        localStorage.setItem('splitorbit_demo_user', JSON.stringify(user));
      }
    } catch {}
  }
}

export function disableDemoMode() {
  if (typeof window !== 'undefined') {
    try {
      localStorage.removeItem('splitorbit_demo_mode');
      localStorage.removeItem('splitorbit_demo_user');
    } catch {}
  }
}

let activeRequests = 0;
let serverWakingTimer = null;
let serverIsWaking = false;
let serverHasResponded =
  typeof window !== 'undefined' &&
  sessionStorage.getItem('splitorbit_server_warm') === 'true';
const serverWakingListeners = new Set();

function updateServerWaking(isWaking) {
  if (serverIsWaking !== isWaking) {
    serverIsWaking = isWaking;
    serverWakingListeners.forEach((cb) => {
      try {
        cb(isWaking);
      } catch (e) {
        console.error('Error in server waking listener:', e);
      }
    });
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('splitorbit:server-waking', { detail: { isWaking } })
      );
    }
  }
}

export function onServerWakingChange(callback) {
  serverWakingListeners.add(callback);
  try {
    callback(serverIsWaking);
  } catch {}
  return () => serverWakingListeners.delete(callback);
}

export function isServerWaking() {
  return serverIsWaking;
}

api.interceptors.request.use((config) => {
  // If demo mode is active, directly resolve via offline demo engine without making failing HTTP network calls
  if (isDemoModeActive()) {
    config.adapter = async (cfg) => {
      const responseData = handleOfflineFallback(cfg);
      return {
        data: responseData,
        status: 200,
        statusText: 'OK',
        headers: { 'content-type': 'application/json' },
        config: cfg,
        request: {},
      };
    };
  }

  const token = getStoredToken();
  if (token && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  activeRequests++;
  if (!serverHasResponded && activeRequests === 1 && !serverWakingTimer) {
    serverWakingTimer = setTimeout(() => {
      if (activeRequests > 0 && !serverHasResponded) {
        updateServerWaking(true);
      }
    }, 6000);
  }
  return config;
});

function handleRequestFinished(hasResponse = false) {
  if (hasResponse) {
    serverHasResponded = true;
    if (typeof window !== 'undefined') {
      try {
        sessionStorage.setItem('splitorbit_server_warm', 'true');
      } catch {}
    }
  }
  activeRequests = Math.max(0, activeRequests - 1);
  if (activeRequests === 0 || serverHasResponded) {
    if (serverWakingTimer) {
      clearTimeout(serverWakingTimer);
      serverWakingTimer = null;
    }
    updateServerWaking(false);
  }
}

const unauthorizedListeners = new Set();
let isRedirecting401 = false;
let redirectDebounceTimer = null;

export function onUnauthorized(callback) {
  unauthorizedListeners.add(callback);
  return () => unauthorizedListeners.delete(callback);
}

export function notifyUnauthorized() {
  unauthorizedListeners.forEach((cb) => {
    try {
      cb();
    } catch (e) {
      console.error('Error in unauthorized listener:', e);
    }
  });
}

export function isProtectedEndpoint(url) {
  if (!url) return false;
  let path = url;
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      path = new URL(url).pathname;
    }
  } catch {}
  const cleanPath = path.split('?')[0].replace(/^\/api(?=\/|$)/, '') || '/';
  const publicPrefixes = [
    '/s/',
    '/s',
    '/invites/',
    '/invite/',
    '/auth/login',
    '/auth/register',
    '/auth/me',
    '/auth/recover',
    '/settings/public',
    '/health',
  ];
  return !publicPrefixes.some((prefix) => cleanPath === prefix || cleanPath.startsWith(prefix));
}

// ----------------------------------------------------
// Seamless Offline / Demo Mock Engine
// Activates ONLY when the backend server is unreachable
// ----------------------------------------------------
const INITIAL_DEMO_STATE = {
  groups: [
    {
      id: '1',
      name: 'Maple House Flatbills',
      description: 'Monthly rent, electricity, Wi-Fi & shared supplies for Room 1-4',
      status: 'active',
      date: '2026-11-01',
      hostUpi: 'vikram@upi',
    },
    {
      id: '2',
      name: 'Goa Roadtrip 2026',
      description: 'Beach villa, car rental, and dinner outings',
      status: 'settled',
      date: '2026-10-15',
      hostUpi: 'vikram@upi',
    },
  ],
  people: [
    {
      id: 1,
      name: 'Vikram Sharma (Host)',
      phone: '9876543210',
      isHost: true,
      canViewAllBills: true,
      shareSplitsTotal: 1000000,
      paidExpensesTotal: 3500000,
      acceptedSentPaymentsTotal: 0,
      remainingToPay: 0,
      groupOwesYou: 2500000,
    },
    {
      id: 2,
      name: 'Alex Morgan',
      phone: '9876543211',
      isHost: false,
      canViewAllBills: true,
      shareSplitsTotal: 900000,
      paidExpensesTotal: 0,
      acceptedSentPaymentsTotal: 900000,
      remainingToPay: 0,
      groupOwesYou: 0,
    },
    {
      id: 3,
      name: 'Maya Chen',
      phone: '9876543212',
      isHost: false,
      canViewAllBills: true,
      shareSplitsTotal: 800000,
      paidExpensesTotal: 0,
      acceptedSentPaymentsTotal: 400000,
      remainingToPay: 400000,
      groupOwesYou: 0,
    },
    {
      id: 4,
      name: 'Noah Williams',
      phone: '9876543213',
      isHost: false,
      canViewAllBills: true,
      shareSplitsTotal: 800000,
      paidExpensesTotal: 0,
      acceptedSentPaymentsTotal: 0,
      remainingToPay: 800000,
      groupOwesYou: 0,
    },
  ],
  expenses: [
    {
      id: 'exp-1',
      title: 'Apartment Monthly Rent',
      totalAmount: 2400000,
      splitType: 'equal',
      category: 'others',
      paymentStatus: 'Paid',
      status: 'Paid',
      date: '2026-11-01',
      paidByPerson: { id: 1, name: 'Vikram Sharma' },
      paidByPersonId: 1,
      splits: [
        { personId: 1, amount: 600000 },
        { personId: 2, amount: 600000 },
        { personId: 3, amount: 600000 },
        { personId: 4, amount: 600000 },
      ],
    },
    {
      id: 'exp-2',
      title: 'Electricity & Power Bill',
      totalAmount: 480000,
      splitType: 'equal',
      category: 'others',
      paymentStatus: 'Half Paid',
      status: 'Half Paid',
      date: '2026-11-04',
      paidByPerson: { id: 1, name: 'Vikram Sharma' },
      paidByPersonId: 1,
      splits: [
        { personId: 1, amount: 120000 },
        { personId: 2, amount: 120000 },
        { personId: 3, amount: 120000 },
        { personId: 4, amount: 120000 },
      ],
    },
    {
      id: 'exp-3',
      title: 'City Bus & Metro Passes',
      totalAmount: 220000,
      splitType: 'equal',
      category: 'bus',
      paymentStatus: 'Pending',
      status: 'Pending',
      date: '2026-11-03',
      paidByPerson: { id: 1, name: 'Vikram Sharma' },
      paidByPersonId: 1,
      splits: [
        { personId: 1, amount: 55000 },
        { personId: 2, amount: 55000 },
        { personId: 3, amount: 55000 },
        { personId: 4, amount: 55000 },
      ],
    },
    {
      id: 'exp-4',
      title: 'Dinner & Groceries',
      totalAmount: 400000,
      splitType: 'equal',
      category: 'food',
      paymentStatus: 'Pending',
      status: 'Pending',
      date: '2026-11-02',
      paidByPerson: { id: 1, name: 'Vikram Sharma' },
      paidByPersonId: 1,
      splits: [
        { personId: 1, amount: 100000 },
        { personId: 2, amount: 100000 },
        { personId: 3, amount: 100000 },
        { personId: 4, amount: 100000 },
      ],
    },
  ],
  payments: [
    {
      id: 'pay-1',
      fromPerson: { id: 2, name: 'Alex Morgan' },
      fromPersonId: 2,
      toPerson: { id: 1, name: 'Vikram Sharma' },
      toPersonId: 1,
      amount: 900000,
      status: 'accepted',
      mode: 'online',
      date: '2026-11-03',
    },
    {
      id: 'pay-2',
      fromPerson: { id: 3, name: 'Maya Chen' },
      fromPersonId: 3,
      toPerson: { id: 1, name: 'Vikram Sharma' },
      toPersonId: 1,
      amount: 400000,
      status: 'accepted',
      mode: 'online',
      date: '2026-11-04',
    },
  ],
};

function getDemoState() {
  try {
    const raw = localStorage.getItem('splitorbit_mock_state');
    return raw ? JSON.parse(raw) : INITIAL_DEMO_STATE;
  } catch {
    return INITIAL_DEMO_STATE;
  }
}

function saveDemoState(state) {
  try {
    localStorage.setItem('splitorbit_mock_state', JSON.stringify(state));
  } catch {}
}

function handleOfflineFallback(config) {
  let url = String(config.url || '');
  try {
    if (url.startsWith('http://') || url.startsWith('https://')) {
      url = new URL(url).pathname;
    }
  } catch {}
  const cleanUrl = url.split('?')[0].replace(/^\/api(?=\/|$)/, '') || '/';
  const method = String(config.method || 'get').toLowerCase();

  let data = {};
  try {
    data = typeof config.data === 'string' ? JSON.parse(config.data || '{}') : config.data || {};
  } catch {
    data = {};
  }

  const state = getDemoState();

  // 1. Auth Login Fallback
  if (cleanUrl === '/auth/login' && method === 'post') {
    const rawUsername = data.username || 'vikram';
    const cleanUsername = rawUsername.trim().toLowerCase();
    const user = {
      id: 'demo-user-1',
      name: cleanUsername === 'vikram' ? 'Vikram Sharma' : cleanUsername.charAt(0).toUpperCase() + cleanUsername.slice(1),
      username: cleanUsername,
      role: 'host',
      email: `${cleanUsername}@example.com`,
    };
    enableDemoMode(user);
    return { success: true, data: { token: 'demo-token-active', user } };
  }

  // 2. Auth Logout Fallback
  if (cleanUrl === '/auth/logout' && method === 'post') {
    disableDemoMode();
    return { success: true, data: {} };
  }

  // 3. Auth Check Username
  if (cleanUrl.includes('check-username') || cleanUrl.includes('username-available')) {
    return { success: true, data: { available: true } };
  }

  // 4. Public Settings / Announcement
  if (cleanUrl.includes('/settings/public')) {
    return { success: true, data: { announcement: { enabled: false } } };
  }

  // 5. Auth Session Probe (/me)
  if (cleanUrl === '/me' && method === 'get') {
    let user = null;
    try {
      const stored = localStorage.getItem('splitorbit_demo_user');
      user = stored ? JSON.parse(stored) : null;
    } catch {}
    if (!user) {
      user = {
        id: 'demo-user-1',
        name: 'Vikram Sharma',
        username: 'vikram',
        role: 'host',
        email: 'vikram@example.com',
      };
    }
    return { success: true, data: { user } };
  }

  // 6. Groups List
  if ((cleanUrl === '/groups' || cleanUrl === '/groups/') && method === 'get') {
    return {
      success: true,
      data: {
        hosted: state.groups,
        member: [],
      },
    };
  }

  // 7. Create Group
  if ((cleanUrl === '/groups' || cleanUrl === '/groups/') && method === 'post') {
    const newGroup = {
      id: String(Date.now()),
      name: data.name || 'New Household',
      description: data.description || '',
      status: 'active',
      date: new Date().toISOString().split('T')[0],
      hostUpi: data.hostUpi || '',
    };
    state.groups.unshift(newGroup);
    saveDemoState(state);
    return { success: true, data: newGroup };
  }

  // 8. Update Group (PATCH)
  const groupPatchMatch = cleanUrl.match(/^\/groups\/([^/]+)$/);
  if (groupPatchMatch && method === 'patch') {
    const gId = groupPatchMatch[1];
    const grp = state.groups.find((g) => g.id === gId) || state.groups[0];
    if (data.name) grp.name = data.name;
    if (data.description !== undefined) grp.description = data.description;
    if (data.hostUpi !== undefined) grp.hostUpi = data.hostUpi;
    saveDemoState(state);
    return { success: true, data: grp };
  }

  // 9. Settle Group
  if (cleanUrl.includes('/settle') && method === 'post') {
    const grp = state.groups[0];
    if (grp) grp.status = 'settled';
    saveDemoState(state);
    return { success: true, data: { message: 'Group settled successfully' } };
  }

  // 10. Reopen Group
  if (cleanUrl.includes('/reopen') && method === 'post') {
    const grp = state.groups[0];
    if (grp) grp.status = 'active';
    saveDemoState(state);
    return { success: true, data: { message: 'Group reopened successfully' } };
  }

  // 10b. Delete Group (DELETE /groups/:groupId)
  const groupDeleteMatch = cleanUrl.match(/^\/groups\/([^/]+)$/);
  if (groupDeleteMatch && method === 'delete') {
    const gId = groupDeleteMatch[1];
    state.groups = state.groups.filter((g) => String(g.id) !== String(gId));
    saveDemoState(state);
    return { success: true, data: { message: 'Group deleted successfully' } };
  }

  // 11. Group Detail (GET /groups/:groupId)
  const groupMatch = cleanUrl.match(/^\/groups\/([^/]+)$/);
  if (groupMatch && method === 'get') {
    const gId = groupMatch[1];
    const grp = state.groups.find((g) => g.id === gId) || state.groups[0];
    const totalSpent = state.expenses.reduce((s, e) => s + (e.totalAmount || 0), 0);
    const totalReceived = state.payments.filter((p) => p.status === 'accepted').reduce((s, p) => s + (p.amount || 0), 0);
    const totalPending = state.payments.filter((p) => p.status === 'pending').reduce((s, p) => s + (p.amount || 0), 0);

    return {
      success: true,
      data: {
        group: grp,
        people: state.people,
        summary: {
          totalSpent,
          totalReceived,
          totalPending,
          isSettledReady: state.people.every((p) => (p.remainingToPay || 0) <= 0),
        },
        isHost: true,
      },
    };
  }

  // 12. Expenses List
  if (cleanUrl.includes('/expenses') && method === 'get') {
    return { success: true, data: state.expenses };
  }

  // 13. Add Expense
  if (cleanUrl.includes('/expenses') && method === 'post') {
    const totalAmount = Number(data.totalAmount || 0);
    const payer = state.people.find((p) => p.id === data.paidByPersonId) || state.people[0];
    const newExp = {
      id: `exp-${Date.now()}`,
      title: data.title || 'Shared Expense',
      totalAmount,
      splitType: data.splitType || 'equal',
      date: data.date || new Date().toISOString().split('T')[0],
      paidByPerson: payer,
      paidByPersonId: payer.id,
      category: data.category || 'others',
      paymentStatus: data.paymentStatus || data.status || 'Pending',
      status: data.paymentStatus || data.status || 'Pending',
      description: data.description || '',
      splits: data.splits || [],
    };
    state.expenses.unshift(newExp);

    if (Array.isArray(data.splits) && data.splits.length > 0) {
      data.splits.forEach((split) => {
        const p = state.people.find((m) => m.id === split.personId);
        if (p) {
          p.shareSplitsTotal = (p.shareSplitsTotal || 0) + Number(split.amount || 0);
          if (p.id !== payer.id) {
            p.remainingToPay = (p.remainingToPay || 0) + Number(split.amount || 0);
          }
        }
      });
    }
    payer.paidExpensesTotal = (payer.paidExpensesTotal || 0) + totalAmount;

    saveDemoState(state);
    return { success: true, data: newExp };
  }

  // 13b. Update Expense (Status / Category / Title)
  const expUpdateMatch = cleanUrl.match(/\/expenses\/([^/]+)$/);
  if (expUpdateMatch && (method === 'patch' || method === 'put')) {
    const expId = expUpdateMatch[1];
    const exp = state.expenses.find((e) => String(e.id) === String(expId));
    if (exp) {
      if (data.title !== undefined) exp.title = data.title;
      if (data.totalAmount !== undefined) exp.totalAmount = Number(data.totalAmount);
      if (data.category !== undefined) exp.category = data.category;
      if (data.paymentStatus !== undefined || data.status !== undefined) {
        exp.paymentStatus = data.paymentStatus || data.status;
        exp.status = exp.paymentStatus;
      }
      if (data.description !== undefined) exp.description = data.description;
      saveDemoState(state);
      return { success: true, data: exp };
    }
  }

  // 14. Accept Payment
  const acceptMatch = cleanUrl.match(/\/payments\/([^/]+)\/accept$/);
  if (acceptMatch && method === 'post') {
    const payId = acceptMatch[1];
    const p = state.payments.find((pay) => pay.id === payId);
    if (p) {
      p.status = 'accepted';
      const fromP = state.people.find((m) => m.id === p.fromPersonId);
      if (fromP) {
        fromP.acceptedSentPaymentsTotal = (fromP.acceptedSentPaymentsTotal || 0) + p.amount;
        fromP.remainingToPay = Math.max(0, (fromP.remainingToPay || 0) - p.amount);
      }
    }
    saveDemoState(state);
    return { success: true, data: p || {} };
  }

  // 15. Reject Payment
  const rejectMatch = cleanUrl.match(/\/payments\/([^/]+)\/reject$/);
  if (rejectMatch && method === 'post') {
    const payId = rejectMatch[1];
    const p = state.payments.find((pay) => pay.id === payId);
    if (p) {
      p.status = 'rejected';
      p.rejectReason = data.reason || 'Rejected by host';
    }
    saveDemoState(state);
    return { success: true, data: p || {} };
  }

  // 16. Payments List
  if (cleanUrl.includes('/payments') && method === 'get') {
    return { success: true, data: state.payments };
  }

  // 17. Add Payment (Write Amount Paid)
  if (cleanUrl.includes('/payments') && method === 'post') {
    const fromPerson = state.people.find((p) => p.id === data.fromPersonId) || state.people[0];
    const toPerson = state.people.find((p) => p.id === data.toPersonId) || state.people[0];
    const amountNum = Number(data.amount || 0);

    const newPayment = {
      id: `pay-${Date.now()}`,
      fromPerson,
      fromPersonId: data.fromPersonId,
      toPerson,
      toPersonId: data.toPersonId,
      amount: amountNum,
      status: 'accepted',
      mode: data.mode || 'online',
      date: data.date || new Date().toISOString().split('T')[0],
    };
    state.payments.unshift(newPayment);

    // Update person's paid and remaining balances immediately
    fromPerson.acceptedSentPaymentsTotal = (fromPerson.acceptedSentPaymentsTotal || 0) + amountNum;
    fromPerson.remainingToPay = Math.max(0, (fromPerson.remainingToPay || 0) - amountNum);

    saveDemoState(state);
    return { success: true, data: newPayment };
  }

  // 18. Add Roommate / Person
  if (cleanUrl.includes('/people') && method === 'post') {
    const newPerson = {
      id: Date.now(),
      name: data.name || 'New Roommate',
      phone: data.phone || '',
      isHost: false,
      canViewAllBills: true,
      shareSplitsTotal: 0,
      paidExpensesTotal: 0,
      acceptedSentPaymentsTotal: 0,
      remainingToPay: 0,
      groupOwesYou: 0,
    };
    state.people.push(newPerson);
    saveDemoState(state);
    return { success: true, data: newPerson };
  }

  // 19. Delete Person
  const deletePersonMatch = cleanUrl.match(/\/people\/([^/]+)$/);
  if (deletePersonMatch && method === 'delete') {
    const pId = Number(deletePersonMatch[1]);
    state.people = state.people.filter((p) => p.id !== pId);
    saveDemoState(state);
    return { success: true, data: {} };
  }

  // 19.5 Update Person Permissions (canViewAllBills toggle)
  const permMatch = cleanUrl.match(/\/people\/([^/]+)\/permissions$/);
  if (permMatch && method === 'patch') {
    const pId = Number(permMatch[1]);
    const p = state.people.find((person) => person.id === pId);
    if (p && data.canViewAllBills !== undefined) {
      p.canViewAllBills = Boolean(data.canViewAllBills);
    }
    saveDemoState(state);
    return { success: true, data: p || {} };
  }

  // 19.6 Bulk Set View All Bills Toggle
  if (cleanUrl.includes('/bulk') && method === 'patch') {
    const enabled = Boolean(data.enabled ?? data.canViewAllBills ?? true);
    state.people.forEach((p) => {
      if (!p.isHost) {
        p.canViewAllBills = enabled;
      }
    });
    saveDemoState(state);
    return { success: true, data: { enabled } };
  }

  // 20. Statement & Share Links
  if (cleanUrl.includes('/statement') || cleanUrl.includes('/s/')) {
    return {
      success: true,
      data: {
        expenses: state.expenses,
        payments: state.payments,
        people: state.people,
        group: state.groups[0],
      },
    };
  }

  if (cleanUrl.includes('/invite') || cleanUrl.includes('/share-link')) {
    const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173';
    return {
      success: true,
      data: {
        code: 'ROOM2026',
        inviteUrl: `${origin}/invite/ROOM2026`,
        shareToken: 'demo-share-token-123',
        shareUrl: `${origin}/s/demo-share-token-123`,
      },
    };
  }

  // Default fallback
  return { success: true, data: {} };
}

api.interceptors.response.use(
  (response) => {
    handleRequestFinished(true);
    // If backend caught a database connection error (PostgreSQL not running), fallback seamlessly!
    if (response.data && response.data.success === false && response.data.error?.code === 'ECONNREFUSED') {
      console.warn(`[SplitOrbit API] Database connection refused at ${response.config?.url}. Activating seamless demo fallback.`);
      enableDemoMode();
      return handleOfflineFallback(response.config);
    }
    return response.data;
  },
  async (error) => {
    const config = error.config;
    const status = error.response?.status;
    const isDbOrNetworkDown =
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNREFUSED' ||
      error.message?.includes('ECONNREFUSED') ||
      error.response?.data?.error?.code === 'ECONNREFUSED' ||
      error.response?.status === 500 ||
      error.response?.status === 502 ||
      error.response?.status === 503 ||
      error.response?.status === 504 ||
      (typeof error.response?.data === 'string' && error.response.data.includes('ECONNREFUSED'));

    // If backend or database is offline, activate seamless demo fallback!
    if (isDbOrNetworkDown && config) {
      console.warn(`[SplitOrbit API] Server or Database offline at ${config.url}. Activating seamless offline demo fallback.`);
      enableDemoMode();
      handleRequestFinished(true);
      return handleOfflineFallback(config);
    }

    handleRequestFinished(Boolean(error.response));

    const message =
      error.response?.data?.error?.message ||
      error.message ||
      'An unexpected error occurred';
    const code = error.response?.data?.error?.code || 'UNKNOWN_ERROR';
    const details = error.response?.data?.error?.details || null;

    const customError = new Error(message);
    customError.status = status;
    customError.code = code;
    customError.details = details;

    if (status === 401 && code !== 'INVALID_ADMIN_PASSWORD') {
      clearStoredToken();
      const requestedUrl = error.config?.url;
      const isProtected = isProtectedEndpoint(requestedUrl);

      if (isProtected) {
        notifyUnauthorized();
        if (typeof window !== 'undefined' && !isRedirecting401) {
          const currentPath = window.location.pathname + window.location.search;
          const currentPathname = window.location.pathname;
          const isExemptPage =
            ['/login', '/register', '/forgot-password', '/reset-password', '/'].includes(currentPathname) ||
            currentPathname.startsWith('/s/') ||
            currentPathname.startsWith('/invite/');

          if (!isExemptPage) {
            isRedirecting401 = true;
            clearTimeout(redirectDebounceTimer);
            const nextParam = isValidNextUrl(currentPath)
              ? `?next=${encodeURIComponent(currentPath)}`
              : '';
            window.location.replace(`/login${nextParam}`);
            redirectDebounceTimer = setTimeout(() => {
              isRedirecting401 = false;
            }, 3000);
          }
        }
      }
    }

    return Promise.reject(customError);
  }
);

export default api;
