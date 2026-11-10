<template>
  <router-view />
  <!-- Toast Pesan Sukses Global (b10) -->
  <transition name="fade">
    <div
      v-if="syncSuccessMessage"
      class="app-toast-success feedback-banner success"
      data-testid="sync-toast-success"
    >
      {{ syncSuccessMessage }}
    </div>
  </transition>
  <!-- Toast Live Update Otomatis (ala Server Pulsa) -->
  <transition name="fade">
    <div
      v-if="liveUpdateToastMessage"
      class="app-toast-success feedback-banner info"
      data-testid="live-update-toast"
      style="background: #eff6ff; color: #1d4ed8; border-color: #bfdbfe;"
    >
      {{ liveUpdateToastMessage }}
    </div>
  </transition>
  <UpdateDialog
    v-if="availableUpdate"
    :update="availableUpdate"
    @dismiss="handleDismissUpdate"
  />
  <CloudSyncDialog
    v-if="showCloudSyncDialog"
    @dismiss="showCloudSyncDialog = false"
    @pulled="handleDataPulled"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';
import { liveUpdateService, type LiveUpdateCheck } from './services/liveUpdateService';
import { supabaseSyncService } from './services/supabaseSyncService';
import UpdateDialog from './components/UpdateDialog.vue';
import CloudSyncDialog from './components/CloudSyncDialog.vue';

const settingsStore = useSettingsStore();
const authStore = useAuthStore();

const availableUpdate = ref<Exclude<LiveUpdateCheck, { kind: 'none' }> | null>(null);
const showCloudSyncDialog = ref(false);
const syncSuccessMessage = ref('');
const liveUpdateToastMessage = ref('');

function handleDismissUpdate() {
  if (availableUpdate.value?.kind === 'apk' && availableUpdate.value.forceUpdate) {
    return;
  }
  availableUpdate.value = null;
}

async function handleDataPulled(count?: number) {
  await authStore.checkInit();
  await settingsStore.loadSettings();
  syncSuccessMessage.value = count !== undefined && count > 0
    ? `Data berhasil ditarik dari cloud (${count} data dipulihkan).`
    : 'Data berhasil ditarik dari cloud.';
  setTimeout(() => {
    syncSuccessMessage.value = '';
  }, 4000);
}

onMounted(async () => {
  await settingsStore.loadSettings();
  await authStore.checkInit();

  // Pengecekan live update otomatis saat aplikasi dibuka (silent check ala Server Pulsa, Capgo).
  // Hanya berjalan di native; gagal/offline diabaikan diam-diam.
  try {
    const update = await liveUpdateService.checkForUpdate();
    if (update.kind === 'bundle') {
      liveUpdateToastMessage.value = 'Mengunduh pembaruan...';
      try {
        await liveUpdateService.applyBundleUpdate(update, (step) => {
          if (step === 'loading') {
            liveUpdateToastMessage.value = 'Memuat pembaruan...';
          }
        });
      } catch {
        liveUpdateToastMessage.value = '';
      }
    } else if (update.kind === 'apk') {
      availableUpdate.value = update;
    }
  } catch {
    // Abaikan jika offline / koneksi gagal
  }

  // Pengecekan sinkronisasi Supabase saat aplikasi dibuka (b9).
  // Data kosong & terkonfigurasi & ada data cloud -> tawarkan dialog tarik data.
  // Bila data lokal sudah ada -> jalankan pushAll secara silent.
  try {
    if (supabaseSyncService.isConfigured()) {
      const isOffered = typeof localStorage !== 'undefined' && localStorage.getItem('buku_konter_sync_offered');
      const isEmpty = await supabaseSyncService.isLocalEmpty();
      if (!isOffered && isEmpty) {
        const hasCloud = await supabaseSyncService.hasCloudData();
        if (hasCloud) {
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('buku_konter_sync_offered', 'true');
          }
          showCloudSyncDialog.value = true;
        }
      } else if (!isEmpty) {
        supabaseSyncService.pushAll().catch(() => {});
      }
    }
  } catch {
    // Abaikan diam-diam bila offline / gagal
  }
});
</script>

<style>
/* Global CSS variables & Plus Jakarta Sans are imported in theme.css */
@import './core/theme.css';

.app-toast-success {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10000;
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.12);
  min-width: 280px;
  max-width: 90%;
  text-align: center;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}
</style>
