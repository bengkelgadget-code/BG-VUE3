<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';
import { useSettingsStore } from './stores/settingsStore';
import { useAuthStore } from './stores/authStore';

const settingsStore = useSettingsStore();
const authStore = useAuthStore();

onMounted(async () => {
  await settingsStore.loadSettings();
  await authStore.checkInit();
});
</script>

<style>
/* Global CSS variables & Plus Jakarta Sans are imported in theme.css */
@import './core/theme.css';
</style>
