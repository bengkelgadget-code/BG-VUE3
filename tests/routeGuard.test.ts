import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import router from '../src/router';
import { useAuthStore } from '../src/stores/authStore';
import { mount } from '@vue/test-utils';
import AuditLogsView from '../src/views/AuditLogsView.vue';

describe('Route Guard & AuditLogs Role Gate (W3)', () => {
  beforeEach(async () => {
    setActivePinia(createPinia());
    await db.users.clear();
    await db.auditLogs.clear();
    vi.restoreAllMocks();
  });

  it('1. Kasir membuka /audit-logs langsung -> ditolak dan dialihkan ke Home', async () => {
    // Setup user owner dan kasir
    await db.users.bulkAdd([
      { id: 'owner-1', name: 'Owner', role: 'owner', pinHash: 'hash-o', isActive: true, createdAt: Date.now() },
      { id: 'kasir-1', name: 'Kasir', role: 'kasir', pinHash: 'hash-k', isActive: true, createdAt: Date.now() },
    ]);

    // Kasir sedang login
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
      id: 'kasir-1',
      name: 'Kasir',
      role: 'kasir',
      pinHash: 'hash-k',
      isActive: true,
      createdAt: Date.now(),
    });

    await router.push('/audit-logs');
    await router.isReady();

    // Guard beforeEach melempar kembali ke Home
    expect(router.currentRoute.value.name).toBe('Home');
  });

  it('2. Owner / Admin membuka /audit-logs -> diizinkan masuk ke halaman AuditLogs', async () => {
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue({
      id: 'admin-1',
      name: 'Admin',
      role: 'admin',
      pinHash: 'hash-a',
      isActive: true,
      createdAt: Date.now(),
    });

    await router.push('/audit-logs');
    await router.isReady();

    expect(router.currentRoute.value.name).toBe('AuditLogs');
  });

  it('3. AuditLogsView onMounted: kasir dialihkan ke /', async () => {
    const authStore = useAuthStore();
    authStore.currentUser = {
      id: 'kasir-1',
      name: 'Kasir',
      role: 'kasir',
      pinHash: 'hash-k',
      isActive: true,
      createdAt: Date.now(),
    };

    const replaceSpy = vi.spyOn(router, 'replace');

    mount(AuditLogsView, {
      global: {
        plugins: [router],
      },
    });

    expect(replaceSpy).toHaveBeenCalledWith('/');
  });
});
