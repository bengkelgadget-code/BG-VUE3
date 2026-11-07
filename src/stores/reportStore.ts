import { defineStore } from 'pinia';
import { ref } from 'vue';
import { reportService, type CategoryTotal, type PeriodTotal } from '../services/reportService';
import type { Product, Account } from '../db/types';

export const useReportStore = defineStore('reports', () => {
  const totalIn = ref(0);
  const totalOut = ref(0);
  const totalLaba = ref(0);
  const totalTxCount = ref(0);

  // Perbandingan periode sebelumnya
  const prevTotalIn = ref(0);
  const prevTotalOut = ref(0);
  const prevTotalLaba = ref(0);
  const prevTotalTxCount = ref(0);

  const byLayanan = ref<CategoryTotal[]>([]);
  const byProduct = ref<CategoryTotal[]>([]);
  const byKasir = ref<CategoryTotal[]>([]);
  const trend = ref<PeriodTotal[]>([]);
  const lowStock = ref<Product[]>([]);
  const lowAccounts = ref<Account[]>([]);
  const isLoading = ref(false);

  async function loadPeriodSummary(
    from: number,
    to: number,
    prevFrom?: number,
    prevTo?: number
  ) {
    isLoading.value = true;
    try {
      totalIn.value = await reportService.totalIn(from, to);
      totalOut.value = await reportService.totalOut(from, to);
      totalLaba.value = await reportService.totalLaba(from, to);
      totalTxCount.value = await reportService.transactionCount(from, to);

      byLayanan.value = await reportService.byLayanan(from, to);
      byProduct.value = await reportService.byProduct(from, to);
      byKasir.value = await reportService.byKasir(from, to);
      trend.value = await reportService.trend(from, to);
      lowStock.value = await reportService.lowStockProducts();
      lowAccounts.value = await reportService.lowBalanceAccounts();

      if (prevFrom !== undefined && prevTo !== undefined) {
        prevTotalIn.value = await reportService.totalIn(prevFrom, prevTo);
        prevTotalOut.value = await reportService.totalOut(prevFrom, prevTo);
        prevTotalLaba.value = await reportService.totalLaba(prevFrom, prevTo);
        prevTotalTxCount.value = await reportService.transactionCount(prevFrom, prevTo);
      } else {
        prevTotalIn.value = 0;
        prevTotalOut.value = 0;
        prevTotalLaba.value = 0;
        prevTotalTxCount.value = 0;
      }
    } finally {
      isLoading.value = false;
    }
  }

  return {
    totalIn,
    totalOut,
    totalLaba,
    totalTxCount,
    prevTotalIn,
    prevTotalOut,
    prevTotalLaba,
    prevTotalTxCount,
    byLayanan,
    byProduct,
    byKasir,
    trend,
    lowStock,
    lowAccounts,
    isLoading,
    loadPeriodSummary,
  };
});
