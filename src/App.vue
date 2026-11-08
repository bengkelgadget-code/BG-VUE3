<template>
  <router-view />
  <UpdateDialog
    v-if="availableUpdate"
    :update="availableUpdate"
    @dismiss="handleDismissUpdate"
  />
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Capacitor } from '@capacitor/core';
import { App } from '@capacitor/app';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';
import { updateService, type VersionInfo } from './services/updateService';
import UpdateDialog from './components/UpdateDialog.vue';

const settingsStore = useSettingsStore();
const authStore = useAuthStore();

const availableUpdate = ref<VersionInfo | null>(null);

function handleDismissUpdate() {
  if (!availableUpdate.value?.forceUpdate) {
    availableUpdate.value = null;
  }
}

onMounted(async () => {
  await settingsStore.loadSettings();
  await authStore.checkInit();

  // Baca version code yang benar-benar terpasang dari native lewat @capacitor/app getInfo()
  try {
    if (Capacitor.isNativePlatform()) {
      const appInfo = await App.getInfo();
      const nativeBuildCode = parseInt(appInfo.build, 10);
      if (!isNaN(nativeBuildCode) && nativeBuildCode > 0) {
        updateService.setInstalledVersionCode(nativeBuildCode);
      }
    }
  } catch (err) {
    console.warn('Fallback web/dev mode: gagal membaca info native App.getInfo', err);
  }

  // Pengecekan update OTA otomatis saat aplikasi dibuka (silent check)
  try {
    const update = await updateService.checkForUpdate();
    if (update) {
      availableUpdate.value = update;
    }
  } catch {
    // Abaikan jika offline / koneksi gagal
  }
});
</script>

<style>
/* Global CSS variables & Plus Jakarta Sans are imported in theme.css */
@import './core/theme.css';
</style>
