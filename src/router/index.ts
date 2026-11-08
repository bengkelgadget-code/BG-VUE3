import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';
import { authService } from '../services/authService';

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/setup-owner',
    name: 'SetupOwner',
    component: () => import('../views/SetupOwnerView.vue'),
    meta: { allowAnonymous: true },
  },
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/LoginView.vue'),
    meta: { allowAnonymous: true },
  },
  {
    path: '/transactions',
    name: 'Transactions',
    component: () => import('../views/TransactionsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/transactions/add',
    name: 'AddTransaction',
    component: () => import('../views/AddTransactionView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/transactions/:id',
    name: 'TransactionDetail',
    component: () => import('../views/TransactionDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/accounts',
    name: 'Accounts',
    component: () => import('../views/AccountsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/accounts/add',
    name: 'AccountAdd',
    component: () => import('../views/AccountFormView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/accounts/:id',
    name: 'AccountDetail',
    component: () => import('../views/AccountDetailView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/masters',
    name: 'Masters',
    component: () => import('../views/MastersView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/masters/product/add',
    name: 'ProductAdd',
    component: () => import('../views/ProductFormView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/customers',
    name: 'Customers',
    component: () => import('../views/CustomersView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/customers/add',
    name: 'CustomerAdd',
    component: () => import('../views/CustomerFormView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/fee-rules',
    name: 'FeeRules',
    component: () => import('../views/FeeRulesView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/fee-rules/add',
    name: 'FeeRuleAdd',
    component: () => import('../views/FeeRuleFormView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
  {
    path: '/receivables',
    name: 'Receivables',
    component: () => import('../views/ReceivablesView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/shifts',
    name: 'Shifts',
    component: () => import('../views/ShiftsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/shifts/open',
    name: 'ShiftOpen',
    component: () => import('../views/ShiftOpenView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/shifts/close',
    name: 'ShiftClose',
    component: () => import('../views/ShiftCloseView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/shifts/handover',
    name: 'ShiftHandover',
    component: () => import('../views/ShiftHandoverView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/reports',
    name: 'Reports',
    component: () => import('../views/ReportsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('../views/SettingsView.vue'),
    meta: { requiresAuth: true },
  },
  {
    path: '/audit-logs',
    name: 'AuditLogs',
    component: () => import('../views/AuditLogsView.vue'),
    meta: { requiresAuth: true, roles: ['owner', 'admin'] },
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach(async (to, _from, next) => {
  const hasUser = await authService.hasAnyUser();

  // Bila belum ada user sama sekali, WAJIB ke SetupOwner
  if (!hasUser) {
    if (to.name !== 'SetupOwner') {
      return next({ name: 'SetupOwner' });
    }
    return next();
  }

  // Bila sudah ada user tapi mencoba buka SetupOwner lagi, lempar ke Home / Login
  if (to.name === 'SetupOwner') {
    return next({ name: 'Home' });
  }

  // Cek user aktif
  const currentUser = await authService.getCurrentUser();
  if (to.meta.requiresAuth && !currentUser) {
    if (to.name !== 'Login') {
      return next({ name: 'Login' });
    }
  }

  // Cek otorisasi peran (roles guard)
  if (to.meta.roles && Array.isArray(to.meta.roles)) {
    const allowedRoles = to.meta.roles as string[];
    if (!currentUser || !allowedRoles.includes(currentUser.role)) {
      return next({ name: 'Home' });
    }
  }

  next();
});

export default router;
