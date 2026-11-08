<template>
  <div class="update-modal-backdrop" @click="handleBackdropClick">
    <div class="update-modal-card" @click.stop>
      <div class="update-header">
        <div class="icon-wrap">
          <RefreshCw class="update-icon" :class="{ spinning: isDownloading }" />
        </div>
        <div class="title-wrap">
          <h3 class="modal-title">Pembaruan Tersedia</h3>
          <span class="version-tag">Versi {{ update.versionName }} (Build {{ update.versionCode }})</span>
        </div>
      </div>

      <div v-if="update.forceUpdate" class="force-update-badge">
        ⚠️ Pembaruan Kritis: Anda wajib memperbarui aplikasi untuk melanjutkan penggunaan.
      </div>

      <div class="changelog-box">
        <h4 class="changelog-title">Catatan Pembaruan:</h4>
        <p class="changelog-text">{{ update.changelog || 'Peningkatan performa dan perbaikan bug.' }}</p>
      </div>

      <!-- Progress Bar saat Mengunduh -->
      <div v-if="isDownloading" class="progress-section">
        <div class="progress-info">
          <span>Mengunduh berkas APK...</span>
          <span class="pct-val font-bold">{{ progress }}%</span>
        </div>
        <div class="progress-track">
          <div class="progress-fill" :style="{ width: `${progress}%` }"></div>
        </div>
      </div>

      <!-- Pesan Error bila gagal -->
      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>

      <!-- Tombol Aksi -->
      <div class="modal-actions">
        <button
          v-if="!update.forceUpdate && !isDownloading"
          type="button"
          class="btn-dismiss"
          @click="$emit('dismiss')"
        >
          Nanti Saja
        </button>

        <button
          type="button"
          class="btn-update-action"
          :disabled="isDownloading"
          @click="startUpdate"
        >
          <span v-if="!isDownloading">Update Sekarang</span>
          <span v-else>Memasang APK... ({{ progress }}%)</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { RefreshCw } from 'lucide-vue-next';
import { updateService, type VersionInfo } from '../services/updateService';

const props = defineProps<{
  update: VersionInfo;
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();

const isDownloading = ref(false);
const progress = ref(0);
const errorMessage = ref('');

function handleBackdropClick() {
  if (!props.update.forceUpdate && !isDownloading.value) {
    emit('dismiss');
  }
}

async function startUpdate() {
  errorMessage.value = '';
  isDownloading.value = true;
  progress.value = 0;

  try {
    await updateService.downloadAndInstall(props.update, (pct) => {
      progress.value = pct;
    });
  } catch (err: unknown) {
    if (err instanceof Error) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal mengunduh atau memasang pembaruan.';
    }
  } finally {
    isDownloading.value = false;
  }
}
</script>

<style scoped>
.update-modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  z-index: 9999;
}

.update-modal-card {
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

.update-header {
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

.update-icon {
  width: 24px;
  height: 24px;
}

.update-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
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
}

.version-tag {
  font-size: 13px;
  color: var(--color-primary-dark);
  font-weight: 600;
}

.force-update-badge {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 10px 12px;
  border-radius: 8px;
  font-size: 12px;
  font-weight: 600;
  border: 1px solid var(--color-danger);
}

.changelog-box {
  background: var(--surface-card-subtle);
  border: 1px solid var(--border-color);
  padding: 12px 14px;
  border-radius: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.changelog-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.changelog-text {
  font-size: 13px;
  color: var(--text-main);
  line-height: 1.5;
  white-space: pre-wrap;
}

.progress-section {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.progress-info {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
}

.progress-track {
  width: 100%;
  height: 8px;
  background: var(--border-color);
  border-radius: 999px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: var(--color-primary);
  border-radius: 999px;
  transition: width 0.2s ease;
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
