import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { Capacitor } from '@capacitor/core';
import { CapacitorUpdater } from '@capgo/capacitor-updater';
import App from './App.vue';
import router from './router';

// Konfirmasi ke Capgo bahwa bundle JS berhasil dimuat saat aplikasi dibuka (ala Server Pulsa).
// Tanpa pemanggilan ini, Capgo akan menganggap bundle crash dan me-rollback ke bawaan APK.
if (Capacitor.isNativePlatform()) {
  CapacitorUpdater.notifyAppReady().catch(() => {});
}

const app = createApp(App);
const pinia = createPinia();

app.use(pinia);
app.use(router);

app.mount('#app');
