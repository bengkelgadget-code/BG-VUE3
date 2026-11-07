<template>
  <div class="setup-container">
    <div class="setup-card">
      <div class="brand-header">
        <div class="brand-logo">BK</div>
        <h1 class="brand-title">BUKU KONTER</h1>
        <p class="brand-subtitle">Pembukuan Transaksi Konter</p>
      </div>

      <div class="badge-setup">Setup Pertama</div>
      <h2 class="setup-title">Buat Akun Owner</h2>
      <p class="setup-desc">
        Aplikasi baru terpasang dan siap digunakan. Buat nama pemilik konter dan PIN keamanan untuk memulai.
      </p>

      <form class="setup-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="form-group">
          <label for="owner-name" class="form-label">Nama Pemilik / Konter</label>
          <input
            id="owner-name"
            v-model="name"
            type="text"
            class="form-input"
            placeholder="Contoh: Bengkel Gadget / Budi"
            required
            autocomplete="name"
            :disabled="isLoading"
          />
        </div>

        <div class="form-group">
          <label for="owner-pin" class="form-label">PIN Keamanan (min. 4 angka)</label>
          <input
            id="owner-pin"
            v-model="pin"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            class="form-input"
            placeholder="Masukkan PIN rahasia Anda"
            required
            maxlength="8"
            autocomplete="new-password"
            :disabled="isLoading"
          />
          <span class="form-hint">PIN hanya disimpan dalam bentuk hash terenkripsi.</span>
        </div>

        <div class="form-group">
          <label for="owner-pin-confirm" class="form-label">Konfirmasi PIN</label>
          <input
            id="owner-pin-confirm"
            v-model="pinConfirm"
            type="password"
            inputmode="numeric"
            pattern="[0-9]*"
            class="form-input"
            placeholder="Ulangi PIN di atas"
            required
            maxlength="8"
            autocomplete="new-password"
            :disabled="isLoading"
          />
        </div>

        <button type="submit" class="submit-btn" :disabled="isLoading">
          <span v-if="!isLoading">Simpan & Mulai Aplikasi</span>
          <span v-else>Menyimpan...</span>
        </button>
      </form>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '../stores/authStore';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const name = ref('');
const pin = ref('');
const pinConfirm = ref('');
const errorMessage = ref('');
const isLoading = ref(false);

async function handleSubmit() {
  errorMessage.value = '';

  const cleanName = name.value.trim();
  const cleanPin = pin.value.trim();

  if (!cleanName || cleanName.length < 2) {
    errorMessage.value = 'Nama pemilik minimal 2 karakter.';
    return;
  }

  if (!cleanPin || cleanPin.length < 4) {
    errorMessage.value = 'PIN minimal 4 angka.';
    return;
  }

  if (cleanPin !== pinConfirm.value.trim()) {
    errorMessage.value = 'Konfirmasi PIN tidak cocok.';
    return;
  }

  isLoading.value = true;
  try {
    await authStore.createOwner(cleanName, cleanPin);
    router.replace('/');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan akun Owner. Silakan coba lagi.';
    }
  } finally {
    isLoading.value = false;
  }
}
</script>

<style scoped>
.setup-container {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  background-color: var(--bg-app);
}

.setup-card {
  width: 100%;
  max-width: 440px;
  background: var(--surface-card);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  padding: 28px 24px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.04);
}

.brand-header {
  text-align: center;
  margin-bottom: 20px;
}

.brand-logo {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: var(--gradient-saldo);
  color: #ffffff;
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

.badge-setup {
  display: inline-block;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  margin-bottom: 8px;
  text-transform: uppercase;
}

.setup-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
}

.setup-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 20px;
}

.setup-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
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

.form-input:focus {
  border-color: var(--border-focus);
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
}

.submit-btn {
  height: 52px;
  margin-top: 8px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: #ffffff;
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
</style>
