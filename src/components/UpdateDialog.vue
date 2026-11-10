<template>
  <div class="update-modal-backdrop" @click="handleBackdropClick">
    <div class="update-modal-card" @click.stop>
      <div class="update-header">
        <div class="icon-wrap">
          <RefreshCw class="update-icon" :class="{ spinning: isWorking }" />
        </div>
        <div class="title-wrap">
          <h3 class="modal-title">Pembaruan APK Baru Diperlukan</h3>
          <span class="version-tag">Versi {{ update.versionName }} (Build {{ update.versionCode }})</span>
        </div>
      </div>

      <div v-if="forceUpdate" class="force-update-badge">
        ⚠️ Pembaruan Kritis: Anda wajib memperbarui aplikasi untuk melanjutkan penggunaan.
      </div>

      <div class="changelog-box">
        <h4 class="changelog-title">Catatan Pembaruan:</h4>
        <p class="changelog-text">{{ update.changelog || 'Peningkatan performa dan perbaikan bug.' }}</p>
      </div>

      <!-- Penjelasan Play Protect — HANYA untuk unduh APK (installer sistem masih dipakai). -->
      <div v-if="showPlayProtectNotice" class="play-protect-notice" data-testid="play-protect-notice">
        <div class="notice-title">
          <ShieldAlert class="notice-icon" />
          <span>Informasi Pemasangan (Play Protect)</span>
        </div>
        <p class="notice-text">
          Aplikasi ini diinstal dari luar Play Store sehingga Google Play Protect kadang menampilkan peringatan <em>"Aplikasi berbahaya diblokir"</em>. Aplikasi ini 100% aman karena dibuat dan ditandatangani oleh pemilik sendiri. Jika peringatan muncul, pilih <strong>"Detail selengkapnya"</strong> lalu <strong>"Tetap instal"</strong>.
        </p>
        <label class="notice-checkbox-label">
          <input
            v-model="dontShowAgain"
            type="checkbox"
            class="notice-checkbox"
            data-testid="dont-show-again-checkbox"
          />
          <span>Jangan tampilkan pesan ini lagi</span>
        </label>
      </div>

      <!-- Pesan Error bila gagal -->
      <div v-if="errorMessage" class="error-banner">
        {{ errorMessage }}
      </div>

      <!-- Tombol Aksi -->
      <div class="modal-actions">
        <button
          v-if="!forceUpdate && !isWorking"
          type="button"
          class="btn-dismiss"
          @click="$emit('dismiss')"
        >
          Nanti Saja
        </button>

        <button
          type="button"
          class="btn-update-action"
          :disabled="isWorking"
          @click="startUpdate"
        >
          <span v-if="!isWorking">Unduh APK Baru</span>
          <span v-else>Membuka browser...</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { getActivePinia } from 'pinia';
import { RefreshCw, ShieldAlert } from 'lucide-vue-next';
import { Browser } from '@capacitor/browser';
import type { ApkUpdate } from '../services/liveUpdateService';
import { useSettingsStore } from '../stores/settingsStore';

const props = defineProps<{
  update: ApkUpdate;
}>();

const emit = defineEmits<{
  (e: 'dismiss'): void;
}>();

const settingsStore = getActivePinia() ? useSettingsStore() : null;

const isWorking = ref(false);
const errorMessage = ref('');
const dontShowAgain = ref(false);

const forceUpdate = computed(() => props.update.forceUpdate);
const showPlayProtectNotice = computed(() => !settingsStore?.hidePlayProtectNotice);

onMounted(async () => {
  if (settingsStore) {
    await settingsStore.loadSettings();
  }
});

function handleBackdropClick() {
  if (forceUpdate.value) return;
  if (!isWorking.value) {
    emit('dismiss');
  }
}

async function startUpdate() {
  errorMessage.value = '';
  isWorking.value = true;

  if (dontShowAgain.value && settingsStore) {
    await settingsStore.setHidePlayProtectNotice(true);
  }

  try {
    await Browser.open({ url: props.update.downloadUrl });
    emit('dismiss');
  } catch (err: unknown) {
    if (err instanceof Error) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal memproses pembaruan.';
    }
  } finally {
    isWorking.value = false;
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

.play-protect-notice {
  background: var(--color-warning-subtle, #fef3c7);
  border: 1px solid var(--color-warning, #f59e0b);
  border-radius: 10px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.notice-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 700;
  color: #92400e;
}

.notice-icon {
  width: 18px;
  height: 18px;
  color: #b45309;
  flex-shrink: 0;
}

.notice-text {
  font-size: 12px;
  color: #78350f;
  line-height: 1.45;
  margin: 0;
}

.notice-checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  font-weight: 600;
  color: #92400e;
  cursor: pointer;
  margin-top: 4px;
  user-select: none;
}

.notice-checkbox {
  width: 16px;
  height: 16px;
  cursor: pointer;
  accent-color: var(--color-primary);
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
