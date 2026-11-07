import { defineStore } from 'pinia';
import { ref } from 'vue';
import { reportService, type CategoryTotal, type PeriodTotal } from '../services/reportService';
import type { Product, Account } from '../db/types';

export const useReportStore = defineStore('reports', () => {
  const totalIn = ref(0);
  const totalOut = ref(0);
  const totalLaba = ref(0);
  const byLayanan = ref<CategoryTotal[]>([]);
  const byProduct = ref<CategoryTotal[]>([]);
  const trend = ref<PeriodTotal[]>([]);
  const lowStock = ref<Product[]>([]);
  const lowAccounts = ref<Account[]>([]);
  const isLoading = ref(false);

  async function loadPeriodSummary(from: number, to: number) {
    isLoading.value = true;
    try {
      totalIn.value = await reportService.totalIn(from, to);
      totalOut.value = await reportService.totalOut(from, to);
      totalLaba.value = await reportService.totalLaba(from, to);
      byLayanan.value = await reportService.byLayanan(from, to);
      byProduct.value = await reportService.byProduct(from, to);
      trend.value = await reportService.trend(from, to);
      lowStock.value = await reportService.lowStockProducts();
      lowAccounts.value = await reportService.lowBalanceAccounts();
    } finally {
      isLoading.value = false;
    }
  }

  return {
    totalIn,
    totalOut,
    totalLaba,
    byLayanan,
    byProduct,
    trend,
    lowStock,
    lowAccounts,
    isLoading,
    loadPeriodSummary,
  };
});

