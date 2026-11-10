import { defineStore } from 'pinia';
import { ref } from 'vue';
import { db } from '../db/database';
import { DEFAULT_SHIFT_TOLERANCE } from '../core/constants';

export const useSettingsStore = defineStore('settings', () => {
  const theme = ref<'light' | 'dark' | 'system'>('system');
  const shiftTolerance = ref<number>(DEFAULT_SHIFT_TOLERANCE);
  const biometricEnabled = ref<boolean>(false);
  const hidePlayProtectNotice = ref<boolean>(false);
  const cloudAutoSync = ref<boolean>(true);

  function applyTheme(selected: 'light' | 'dark' | 'system') {
    theme.value = selected;
    let effective = selected;
    if (selected === 'system') {
      const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
      effective = prefersDark ? 'dark' : 'light';
    }
    document.documentElement.setAttribute('data-theme', effective);
  }

  async function loadSettings() {
    let settings = await db.appSettings.get(1);
    if (!settings) {
      settings = {
        id: 1,
        theme: 'system',
        shiftTolerance: DEFAULT_SHIFT_TOLERANCE,
        biometricEnabled: false,
      };
      await db.appSettings.put(settings);
    }
    shiftTolerance.value = settings.shiftTolerance;
    biometricEnabled.value = settings.biometricEnabled;
    hidePlayProtectNotice.value = Boolean(settings.hidePlayProtectNotice);
    cloudAutoSync.value = settings.cloudAutoSync !== false;
    applyTheme(settings.theme);
  }

  async function updateTheme(newTheme: 'light' | 'dark' | 'system') {
    applyTheme(newTheme);
    await db.appSettings.update(1, { theme: newTheme });
  }

  async function setHidePlayProtectNotice(val: boolean) {
    hidePlayProtectNotice.value = val;
    await db.appSettings.update(1, { hidePlayProtectNotice: val });
  }

  async function setCloudAutoSync(val: boolean) {
    cloudAutoSync.value = val;
    await db.appSettings.update(1, { cloudAutoSync: val });
  }

  return {
    theme,
    shiftTolerance,
    biometricEnabled,
    hidePlayProtectNotice,
    cloudAutoSync,
    loadSettings,
    updateTheme,
    setHidePlayProtectNotice,
    setCloudAutoSync,
  };
});
