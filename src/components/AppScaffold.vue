<template>
  <div class="app-layout">
    <header v-if="!hideHeader" class="app-header">
      <div class="header-content">
        <slot name="header">
          <div class="header-default">
            <span class="app-title">BUKU KONTER</span>
            <div v-if="authStore.currentUser" class="user-badge">
              <span class="user-role">{{ roleLabel }}</span>
              <span class="user-name">{{ authStore.currentUser.name }}</span>
            </div>
          </div>
        </slot>
      </div>
    </header>

    <main class="app-main">
      <slot />
    </main>

    <nav v-if="!hideNav" class="bottom-nav">
      <router-link to="/" class="nav-item" :class="{ active: currentRouteName === 'Home' }">
        <Home class="nav-icon" />
        <span class="nav-label">Home</span>
      </router-link>

      <router-link to="/transactions" class="nav-item" :class="{ active: currentRouteName === 'Transactions' }">
        <ReceiptText class="nav-icon" />
        <span class="nav-label">Transaksi</span>
      </router-link>

      <!-- FAB Tambah Transaksi di tengah -->
      <router-link to="/transactions/add" class="nav-fab" aria-label="Tambah Transaksi">
        <Plus class="fab-icon" />
      </router-link>

      <router-link to="/shifts" class="nav-item" :class="{ active: currentRouteName === 'Shifts' }">
        <Clock class="nav-icon" />
        <span class="nav-label">Shift</span>
      </router-link>

      <router-link to="/settings" class="nav-item" :class="{ active: currentRouteName === 'Settings' }">
        <Settings class="nav-icon" />
        <span class="nav-label">Pengaturan</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { Home, ReceiptText, Plus, Clock, Settings } from 'lucide-vue-next';
import { useAuthStore } from '../stores/authStore';

defineProps<{
  hideHeader?: boolean;
  hideNav?: boolean;
}>();

const route = useRoute();
const authStore = useAuthStore();

const currentRouteName = computed(() => route.name);

const roleLabel = computed(() => {
  const r = authStore.currentUser?.role;
  if (r === 'owner') return 'Owner';
  if (r === 'admin') return 'Admin';
  if (r === 'kasir') return 'Kasir';
  return '';
});
</script>

<style scoped>
.app-layout {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background-color: var(--bg-app);
}

.app-header {
  position: sticky;
  top: 0;
  z-index: 30;
  background-color: var(--surface-card);
  border-bottom: 1px solid var(--border-color);
  padding: 12px 16px;
}

.header-default {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.app-title {
  font-size: 17px;
  font-weight: 800;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}

.user-badge {
  display: flex;
  align-items: center;
  gap: 6px;
  background-color: var(--surface-card-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--border-color);
}

.user-role {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  text-transform: uppercase;
}

.user-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}

.app-main {
  flex: 1;
  padding: 16px;
  padding-bottom: 90px;
  max-width: 600px;
  width: 100%;
  margin: 0 auto;
}

.bottom-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 40;
  background: var(--surface-card);
  border-top: 1px solid var(--border-color);
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: 64px;
  padding: 0 8px;
  max-width: 600px;
  margin: 0 auto;
}

.nav-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-decoration: none;
  color: var(--text-secondary);
  flex: 1;
  height: 100%;
  transition: color var(--transition-fast);
}

.nav-item.active {
  color: var(--color-primary);
  font-weight: 700;
}

.nav-icon {
  width: 22px;
  height: 22px;
  margin-bottom: 2px;
}

.nav-label {
  font-size: 11px;
}

.nav-fab {
  position: relative;
  top: -14px;
  width: 52px;
  height: 52px;
  border-radius: 50%;
  background: var(--color-primary);
  color: var(--color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 4px 12px rgba(5, 150, 105, 0.35);
  text-decoration: none;
  transition: transform var(--transition-fast), background-color var(--transition-fast);
}

.nav-fab:active {
  transform: scale(0.95);
  background: var(--color-primary-dark);
}

.fab-icon {
  width: 28px;
  height: 28px;
  stroke-width: 2.5;
}
</style>
