import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Transaction, TransactionItem } from '../db/types';
import { transactionService, type TransactionInput } from '../services/transactionService';

export const useTransactionStore = defineStore('transactions', () => {
  const transactions = ref<Transaction[]>([]);
  const currentTransaction = ref<Transaction | null>(null);
  const currentItems = ref<TransactionItem[]>([]);
  const isLoading = ref(false);

  async function loadTransactions(filter?: {
    from?: number;
    to?: number;
    layanan?: string;
    accountId?: string;
    shiftId?: string;
    status?: 'ok' | 'void';
    query?: string;
  }) {
    isLoading.value = true;
    try {
      transactions.value = await transactionService.listTransactions(filter);
    } finally {
      isLoading.value = false;
    }
  }

  async function addTransaction(input: TransactionInput, opts: { actorUserId: string; shiftId: string }) {
    const id = await transactionService.addTransaction(input, opts);
    await loadTransactions();
    return id;
  }

  async function loadTransactionDetail(id: string) {
    isLoading.value = true;
    try {
      const tx = await transactionService.getTransaction(id);
      currentTransaction.value = tx || null;
      if (tx) {
        currentItems.value = await transactionService.getItems(id);
      } else {
        currentItems.value = [];
      }
    } finally {
      isLoading.value = false;
    }
  }

  async function voidTransaction(id: string, opts: { reason: string; actorUserId: string }) {
    await transactionService.voidTransaction(id, opts);
    await loadTransactionDetail(id);
    await loadTransactions();
  }

  return {
    transactions,
    currentTransaction,
    currentItems,
    isLoading,
    loadTransactions,
    addTransaction,
    loadTransactionDetail,
    voidTransaction,
  };
});
