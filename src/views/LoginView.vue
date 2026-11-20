<template>
  <div class="login-container">
    <div class="login-card">
      <div class="brand-header">
        <div class="brand-logo">BK</div>
        <h1 class="brand-title">BUKU KONTER</h1>
        <p class="brand-subtitle">Silakan Masuk Petugas</p>
      </div>

      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>

      <!-- Umpan balik pulihkan akun (b21): di luar blok v-if di bawah, supaya
           tetap terlihat sesudah form login muncul (userList terisi). -->
      <div v-if="restoreSuccessMessage" class="success-banner" data-testid="restore-success">
        {{ restoreSuccessMessage }}
      </div>
      <div v-if="restoreErrorMessage" class="error-banner" data-testid="restore-error">
        {{ restoreErrorMessage }}
      </div>

      <!-- Belum ada akun di HP ini (b21): halaman awal adalah Login,
           bukan SetupOwner — supaya di HP baru user bisa login dulu
           (akun dipulihkan dari cloud) atau buat akun bila memang belum punya. -->
      <div v-if="userList.length === 0" class="no-user">
        <p class="no-user-text">Belum ada akun di HP ini.</p>
        <p class="no-user-desc">
          Kalau kamu sudah punya akun di HP lain, pulihkan dulu dari cloud — tidak perlu buat akun baru.
        </p>

        <button
          type="button"
          class="restore-btn"
          data-testid="btn-restore-cloud"
          :disabled="isRestoring"
          @click="handleRestoreFromCloud"
        >
          <span v-if="!isRestoring">Pulihkan Akun dari Cloud</span>
          <span v-else>Memulihkan...</span>
        </button>

        <div class="divider"><span>atau</span></div>

        <router-link to="/setup-owner" class="create-account-link" data-testid="link-create-account">
          Belum punya akun? Buat Akun
        </router-link>
      </div>

      <form v-else class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="select-user" class="form-label">Pilih Petugas</label>
          <SearchableSelect
            id="select-user"
            v-model="selectedUserId"
            :options="userSelectOptions"
            placeholder="-- Pilih Petugas --"
            search-placeholder="Cari petugas..."
            required
          />
        </div>

        <div class="form-group">
          <label for="user-pin" class="form-label">PIN</label>
          <input
            id="user-pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            class="form-input"
            placeholder="Masukkan PIN"
            required
            maxlength="8"
            autocomplete="current-password"
            :disabled="isLoading"
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading || !selectedUserId || !pin">
          <span v-if="!isLoading">Masuk</span>
          <span v-else>Memverifikasi...</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '../db/database';
import type { User } from '../db/types';
import { useAuthStore } from '../stores/authStore';
import { supabaseSyncService } from '../services/supabaseSyncService';
import { AppError } from '../core/errors';
import SearchableSelect from '../components/SearchableSelect.vue';

const router = useRouter();
const authStore = useAuthStore();

const userList = ref<User[]>([]);
const selectedUserId = ref('');

const userSelectOptions = computed(() =>
  userList.value.map((u) => ({
    value: u.id,
    label: `${u.name} (${u.role.toUpperCase()})`,
  }))
);
const pin = ref('');
const errorMessage = ref('');
const isLoading = ref(false);
const isRestoring = ref(false);
const restoreSuccessMessage = ref('');
const restoreErrorMessage = ref('');

async function loadUsers() {
  const users = await db.users.filter((u) => u.isActive).toArray();
  userList.value = users;
  if (users.length === 1 && users[0]) {
    selectedUserId.value = users[0].id;
  }
}

onMounted(async () => {
  await loadUsers();
});

// Bila akun dipulihkan lewat dialog CloudSync di App.vue (tampil di atas
// halaman ini saat install baru), muat ulang daftar petugas agar form
// login langsung muncul tanpa perlu refresh manual.
watch(
  () => authStore.hasUser,
  async (has) => {
    if (has) {
      await loadUsers();
    }
  }
);

// Pulihkan akun dari cloud (bk_sync) — untuk pindah HP tanpa buat akun baru.
async function handleRestoreFromCloud() {
  restoreSuccessMessage.value = '';
  restoreErrorMessage.value = '';
  isRestoring.value = true;
  try {
    const result = await supabaseSyncService.pullAll();
    await authStore.checkInit();
    await loadUsers();
    if (userList.value.length === 0) {
      restoreErrorMessage.value =
        'Tidak ada data akun di cloud. Silakan buat akun baru di bawah.';
    } else {
      restoreSuccessMessage.value =
        result.pulled > 0
          ? `Akun berhasil dipulihkan dari cloud (${result.pulled} data). Silakan login.`
          : 'Akun berhasil dipulihkan dari cloud. Silakan login.';
    }
  } catch (err: unknown) {
    if (err instanceof AppError) {
      restoreErrorMessage.value = err.message;
    } else if (err instanceof Error) {
      restoreErrorMessage.value = err.message;
    } else {
      restoreErrorMessage.value = 'Gagal memulihkan akun dari cloud. Periksa koneksi internet.';
    }
  } finally {
    isRestoring.value = false;
  }
}

async function handleLogin() {
  if (!selectedUserId.value || !pin.value) return;
  errorMessage.value = '';
  isLoading.value = true;
  try {
    await authStore.login(selectedUserId.value, pin.value);
    router.replace('/');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal masuk. Periksa kembali PIN Anda.';
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.login-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--bg-app);
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--surface-card);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  padding: 28px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.brand-header {
  text-align: center;
  margin-bottom: 24px;
}

.brand-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--gradient-saldo);
  color: var(--color-white);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 20px;
  font-weight: 800;
  margin: 0 auto 10px auto;
}

.brand-title {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-primary);
  letter-spacing: -0.02em;
}

.brand-subtitle {
  font-size: 13px;
  color: var(--text-secondary);
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
  margin-bottom: 16px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.form-select,
.form-input {
  height: 48px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 15px;
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-select:focus,
.form-input:focus {
  border-color: var(--border-focus);
}

.submit-btn {
  height: 52px;
  margin-top: 8px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast), transform var(--transition-fast);
}

.submit-btn:active {
  transform: scale(0.98);
  background: var(--color-primary-dark);
}

.submit-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.no-user {
  display: flex;
  flex-direction: column;
  gap: 12px;
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}

.no-user-text {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.no-user-desc {
  font-size: 13px;
  color: var(--text-secondary);
}

.success-banner {
  background: var(--color-success-subtle, #dcfce7);
  color: var(--color-success);
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
  text-align: left;
}

.restore-btn {
  height: 52px;
  margin-top: 4px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast), transform var(--transition-fast);
}

.restore-btn:active {
  transform: scale(0.98);
  background: var(--color-primary-dark);
}

.restore-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.divider {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-secondary);
  font-size: 12px;
}

.divider::before,
.divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--border-color);
}

.create-account-link {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  text-decoration: none;
  padding: 8px 0;
}

.create-account-link:active {
  opacity: 0.7;
}
</style>
