<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Tambah Pelanggan</h2>
      </div>

      <form class="customer-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <div class="form-group">
            <label class="form-label">Nama Pelanggan (Wajib)</label>
            <input
              v-model="name"
              type="text"
              class="form-input"
              placeholder="Contoh: Pak Budi / Bu Siti"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Nomor HP / WhatsApp (Opsional)</label>
            <input
              v-model="phone"
              type="tel"
              class="form-input"
              placeholder="08123456789"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Catatan / Keterangan (Opsional)</label>
            <input
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Contoh: Langganan pulsa toko seberang"
            />
          </div>
        </div>

        <button type="submit" class="btn-submit" :disabled="isSubmitting || !name.trim()">
          {{ isSubmitting ? 'Menyimpan...' : 'Simpan Pelanggan' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { customerService } from '../services/customerService';
import { useAuthStore } from '../stores/authStore';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const name = ref('');
const phone = ref('');
const note = ref('');
const errorMessage = ref('');
const isSubmitting = ref(false);

async function handleSubmit() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    await customerService.addCustomer(
      {
        name: name.value.trim(),
        phone: phone.value.trim() || undefined,
        note: note.value.trim() || undefined,
      },
      { actorUserId: authStore.currentUser?.id || 'system' }
    );
    router.replace('/customers');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan data pelanggan.';
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

.customer-form {
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

.btn-submit {
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: #ffffff;
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
