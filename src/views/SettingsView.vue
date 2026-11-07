<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Pengaturan</h2>
    </div>

    <div class="settings-list">
      <!-- Section Petugas & Keamanan -->
      <div class="settings-card">
        <h3 class="card-title">Petugas & Akses</h3>
        <div class="user-row">
          <div class="user-info">
            <span class="user-name">{{ authStore.currentUser?.name }}</span>
            <span class="user-role-badge">{{ authStore.currentUser?.role.toUpperCase() }}</span>
          </div>
          <button class="btn-logout" @click="handleLogout">Keluar</button>
        </div>
      </div>

      <!-- Section Master Data (Owner/Admin Saja) -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <h3 class="card-title">Master Data Konter</h3>
        <div class="menu-grid">
          <router-link to="/accounts" class="menu-item">
            <span class="item-title">Akun Saldo (5 Kelompok)</span>
            <span class="item-desc">Kas, Bank, E-Wallet, Server, Provider</span>
          </router-link>
          <router-link to="/masters" class="menu-item">
            <span class="item-title">Master Produk</span>
            <span class="item-desc">Modal & Jual: Pulsa, Voucher, Perdana, ACC</span>
          </router-link>
          <router-link to="/fee-rules" class="menu-item">
            <span class="item-title">Master Tarif Biaya Admin</span>
            <span class="item-desc">Aturan range nominal margin jasa</span>
          </router-link>
          <router-link to="/customers" class="menu-item">
            <span class="item-title">Master Pelanggan</span>
            <span class="item-desc">Data pelanggan & hutang piutang</span>
          </router-link>
        </div>
      </div>

      <!-- Section Tampilan Tema -->
      <div class="settings-card">
        <h3 class="card-title">Tema Tampilan</h3>
        <div class="theme-selector">
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'light' }"
            @click="settingsStore.updateTheme('light')"
          >
            Terang
          </button>
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'dark' }"
            @click="settingsStore.updateTheme('dark')"
          >
            Gelap
          </button>
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'system' }"
            @click="settingsStore.updateTheme('system')"
          >
            Otomatis
          </button>
        </div>
      </div>

      <!-- Section Tentang Aplikasi -->
      <div class="settings-card info-card">
        <h3 class="card-title">Tentang BUKU KONTER</h3>
        <p class="app-statement">
          Aplikasi ini adalah <strong>murni pencatatan</strong> (buku kas & ledger catatan). Aplikasi ini tidak menjalankan transaksi pulsa/transfer langsung dan tidak mengubah saldo live di server pulsa, bank, atau e-wallet.
        </p>
        <div class="app-version-badge">Versi {{ APP_VERSION }} (Fase 0 Fondasi)</div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { APP_VERSION } from '../core/constants';

const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

async function handleLogout() {
  await authStore.logout();
  router.replace('/login');
}
</script>

<style scoped>
.view-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}
.settings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-card {
  background: var(--surface-card);
  padding: 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
}
.card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 12px;
}
.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.user-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.user-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.user-role-badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}
.btn-logout {
  padding: 8px 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--color-danger);
  background: transparent;
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}
.menu-grid {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.menu-item {
  display: flex;
  flex-direction: column;
  padding: 10px 12px;
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  text-decoration: none;
  transition: background-color var(--transition-fast);
}
.menu-item:active {
  background: var(--border-color);
}
.item-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
.item-desc {
  font-size: 11px;
  color: var(--text-secondary);
}
.theme-selector {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.theme-btn {
  padding: 10px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card-subtle);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.theme-btn.active {
  background: var(--color-primary);
  color: #ffffff;
  border-color: var(--color-primary);
}
.app-statement {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.5;
  margin-bottom: 10px;
}
.app-version-badge {
  font-size: 11px;
  color: var(--text-muted);
  font-weight: 600;
}
</style>
