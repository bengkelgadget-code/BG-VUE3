import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Shift } from '../db/types';
import { shiftService, type ShiftSummary } from '../services/shiftService';

export const useShiftStore = defineStore('shift', () => {
  const activeShift = ref<Shift | null>(null);
  const shiftHistory = ref<Shift[]>([]);
  const currentSummary = ref<ShiftSummary | null>(null);
  const isLoading = ref(false);

  async function checkActiveShift(userId: string) {
    isLoading.value = true;
    try {
      const shift = await shiftService.getActiveShift(userId);
      activeShift.value = shift || null;
      return activeShift.value;
    } finally {
      isLoading.value = false;
    }
  }

  async function openShift(params: { userId: string; kasAwalFisik: number; note?: string }) {
    const id = await shiftService.openShift(params);
    await checkActiveShift(params.userId);
    return id;
  }

  async function closeShift(params: {
    shiftId: string;
    hitungFisik: Record<string, number>;
    penjelasanSelisih: Record<string, string>;
    actorUserId: string;
  }) {
    const summary = await shiftService.closeShift(params);
    currentSummary.value = summary;
    activeShift.value = null;
    return summary;
  }

  async function loadHistory(userId?: string) {
    isLoading.value = true;
    try {
      shiftHistory.value = await shiftService.listShifts({ userId });
    } finally {
      isLoading.value = false;
    }
  }

  return {
    activeShift,
    shiftHistory,
    currentSummary,
    isLoading,
    checkActiveShift,
    openShift,
    closeShift,
    loadHistory,
  };
});
