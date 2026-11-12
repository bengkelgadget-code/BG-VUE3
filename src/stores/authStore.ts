import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { User } from '../db/types';
import { authService } from '../services/authService';

export const useAuthStore = defineStore('auth', () => {
  const currentUser = ref<User | null>(null);
  const isInitialized = ref(false);
  const hasUser = ref(false);

  const isAuthenticated = computed(() => currentUser.value !== null);
  const role = computed(() => currentUser.value?.role);
  const isOwner = computed(() => currentUser.value?.role === 'owner');
  const isAdmin = computed(() => currentUser.value?.role === 'admin' || currentUser.value?.role === 'owner');
  const isKepalaKasir = computed(() => currentUser.value?.role === 'kepala_kasir');
  const isKasir = computed(() => currentUser.value?.role === 'kasir');
  const userName = computed(() => currentUser.value?.name || '');

  async function checkInit() {
    hasUser.value = await authService.hasAnyUser();
    if (hasUser.value) {
      const user = await authService.getCurrentUser();
      currentUser.value = user || null;
    } else {
      currentUser.value = null;
    }
    isInitialized.value = true;
    return { hasUser: hasUser.value, currentUser: currentUser.value };
  }

  async function createOwner(name: string, pin: string) {
    const owner = await authService.createOwner(name, pin);
    currentUser.value = owner;
    hasUser.value = true;
    return owner;
  }

  async function login(userId: string, pin: string) {
    await authService.login(userId, pin);
    const user = await authService.getCurrentUser();
    currentUser.value = user || null;
  }

  async function logout() {
    await authService.logout();
    currentUser.value = null;
  }

  return {
    currentUser,
    isInitialized,
    hasUser,
    isAuthenticated,
    role,
    isOwner,
    isAdmin,
    isKepalaKasir,
    isKasir,
    userName,
    checkInit,
    createOwner,
    login,
    logout,
  };
});
