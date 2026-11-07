import { defineStore } from 'pinia';
import { ref } from 'vue';
import { receivableService, type ReceivableSummary } from '../services/receivableService';

export const useReceivableStore = defineStore('receivables', () => {
  const receivables = ref<ReceivableSummary[]>([]);
  const isLoading = ref(false);

  async function loadReceivables() {
    isLoading.value = true;
    try {
      receivables.value = await receivableService.listReceivables();
    } finally {
      isLoading.value = false;
    }
  }

  async function markPaidFull(
    customerId: string,
    paidToAccountId: string,
    actorUserId: string
  ) {
    await receivableService.markPaidFull(customerId, paidToAccountId, Date.now(), actorUserId);
    await loadReceivables();
  }

  return {
    receivables,
    isLoading,
    loadReceivables,
    markPaidFull,
  };
});
