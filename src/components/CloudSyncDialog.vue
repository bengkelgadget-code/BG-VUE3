<template>
  <div class="cloud-sync-backdrop" @click="handleBackdropClick">
    <div class="cloud-sync-card" @click.stop>
      <div class="sync-header">
        <div class="icon-wrap">
          <CloudDownload class="sync-icon" :class="{ spinning: isPulling }" />
        </div>
        <div class="title-wrap">
          <h3 class="modal-title">Tarik Data dari Cloud?</h3>
          <span class="subtitle-tag">Database Supabase Terhubung</span>
        </div>
      </div>

      <p class="sync-desc">
        Ditemukan data di database Supabase. Tarik data transaksi, saldo, dan master produk ke HP ini?
      </p>

      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>

      <div class="modal-actions">
        <button
          v-if="!isPulling"
          type="button"
          class="btn-dismiss"
          data-testid="cloud-sync-dismiss"
          @click="$emit('dismiss')"
        >
          Nanti Saja
        </button>

        <button
          type="button"
          class="btn-update-action"
          data-testid="cloud-sync-confirm"
          :disabled="isPulling"
          @click="handlePull"
        >
          <span v-if="!isPulling">Tarik Sekarang</span>
          <span v-else>Menarik data...</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { CloudDownload } from 'lucide-vue-next';
import { supabaseSyncService } from '../services/supabaseSyncService';

const emit = defineEmits<{
  (e: 'dismiss'): void;
  (e: 'pulled', count: number): void;
}>();

const isPulling = ref(false);
const errorMessage = ref('');

function handleBackdropClick() {
  if (!isPulling.value) {
    emit('dismiss');
  }
}

async function handlePull() {
  errorMessage.value = '';
  isPulling.value = true;
  try {
    const result = await supabaseSyncService.pullAll();
    emit('pulled', result.pulled);
    emit('dismiss');
  } catch (err: unknown) {
    if (err instanceof Error) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menarik data dari cloud.';
    }
  } finally {
    isPulling.value = false;
  }
}
</script>

<style scoped>
.cloud-sync-backdrop {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 9999;
}

.cloud-sync-card {
  width: 100%;
  max-width: 420px;
  background: var(--surface-card);
  border-radius: var(--radius-card);
  padding: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
  border: 1px solid var(--border-color);
}

.sync-header {
  display: flex;
  align-items: center;
  gap: 14px;
}

.icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  background: var(--color-primary-light);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  flex-shrink: 0;
}

.sync-icon {
  width: 24px;
  height: 24px;
}

.sync-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.subtitle-tag {
  font-size: 13px;
  color: var(--color-primary-dark);
  font-weight: 600;
}

.sync-desc {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
  margin: 0;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
}

.modal-actions {
  display: flex;
  gap: 12px;
  margin-top: 8px;
}

.btn-dismiss {
  flex: 1;
  height: 46px;
  border: 1px solid var(--border-color);
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-btn);
  font-weight: 600;
  font-size: 14px;
  cursor: pointer;
}

.btn-update-action {
  flex: 2;
  height: 46px;
  border: none;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-btn);
  font-weight: 700;
  font-size: 14px;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-update-action:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
