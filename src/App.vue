<template>
  <router-view />
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

function handleDismissUpdate() {
  if (availableUpdate.value?.kind === 'apk' && availableUpdate.value.forceUpdate) {
    return;
  }
  availableUpdate.value = null;
}

async function handleDataPulled() {
  await authStore.checkInit();
  await settingsStore.loadSettings();
}

onMounted(async () => {
  await settingsStore.loadSettings();
  await authStore.checkInit();

  // Pengecekan live update otomatis saat aplikasi dibuka (silent check, Capgo).
  // Hanya berjalan di native; gagal/offline diabaikan diam-diam.
  try {
    const update = await liveUpdateService.checkForUpdate();
    if (update.kind !== 'none') {
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
</style>
