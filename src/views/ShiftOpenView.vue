<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Buka Shift Petugas</h2>
      </div>

      <p class="section-intro">
        Hitung uang tunai fisik yang ada di laci kas saat ini sebelum memulai shift pelayanan.
      </p>

      <form class="shift-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <div class="form-group">
            <label class="form-label">Petugas Bertugas</label>
            <input type="text" class="form-input disabled" :value="authStore.currentUser?.name" disabled />
          </div>

          <div class="form-group">
            <label class="form-label">Hitungan Fisik Uang di Laci Kas (Wajib)</label>
            <div class="input-prefix-wrapper">
              <span class="currency-prefix">Rp</span>
              <input
                type="text"
                inputmode="numeric"
                class="form-input with-prefix tabular-nums"
                :value="displayKasAwal"
                placeholder="0"
                required
                @input="onKasAwalInput"
              />
            </div>
            <span class="form-hint">
              Hitung lembaran & koin fisik kasir saat membuka shift.
            </span>
          </div>

          <div class="form-group">
            <label class="form-label">Catatan Pembukaan (Opsional)</label>
            <input
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Contoh: Laci diterima dalam kondisi rapi"
            />
          </div>
        </div>

        <button type="submit" class="btn-submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Membuka Shift...' : 'Konfirmasi Buka Shift' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { shiftService } from '../services/shiftService';
import { useAuthStore } from '../stores/authStore';
import { parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const kasAwalFisik = ref<number>(0);
const note = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

const displayKasAwal = computed(() => {
  if (kasAwalFisik.value === 0) return '0';
  return kasAwalFisik.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onKasAwalInput(e: Event) {
  const target = e.target as HTMLInputElement;
  kasAwalFisik.value = parseRupiah(target.value);
}

async function handleSubmit() {
  if (!authStore.currentUser) {
    errorMessage.value = 'Silakan masuk terlebih dahulu.';
    return;
  }

  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    await shiftService.openShift({
      userId: authStore.currentUser.id,
      kasAwalFisik: kasAwalFisik.value,
      note: note.value.trim() || undefined,
    });
    router.replace('/');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal membuka shift.';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.form-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-back {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  cursor: pointer;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.shift-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-section {
  background: var(--surface-card);
  padding: 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 14px;
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
}

.form-input.disabled {
  background: var(--surface-card-subtle);
  color: var(--text-muted);
}

.input-prefix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-prefix {
  position: absolute;
  left: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.form-input.with-prefix {
  width: 100%;
  padding-left: 42px;
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.btn-submit {
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
