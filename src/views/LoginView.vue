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

      <div v-if="userList.length === 0" class="no-user">
        <p>Belum ada data petugas. Mengalihkan ke setup...</p>
      </div>

      <form v-else class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="select-user" class="form-label">Pilih Petugas</label>
          <select id="select-user" v-model="selectedUserId" class="form-select" required>
            <option disabled value="">-- Pilih Petugas --</option>
            <option v-for="u in userList" :key="u.id" :value="u.id">
              {{ u.name }} ({{ u.role.toUpperCase() }})
            </option>
          </select>
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
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { db } from '../db/database';
import type { User } from '../db/types';
import { useAuthStore } from '../stores/authStore';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const userList = ref<User[]>([]);
const selectedUserId = ref('');
const pin = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

onMounted(async () => {
  const users = await db.users.filter((u) => u.isActive).toArray();
  userList.value = users;
  if (users.length === 0) {
    router.replace('/setup-owner');
  } else if (users.length === 1 && users[0]) {
    selectedUserId.value = users[0].id;
  }
});

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
  text-align: center;
  color: var(--text-secondary);
  font-size: 14px;
}
</style>
