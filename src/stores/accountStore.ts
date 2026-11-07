import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Account, AccountLedger } from '../db/types';
import { accountService } from '../services/accountService';

export const useAccountStore = defineStore('accounts', () => {
  const accounts = ref<Account[]>([]);
  const balances = ref<Record<string, number>>({});
  const ledgers = ref<AccountLedger[]>([]);
  const isLoading = ref(false);

  const activeAccounts = computed(() => accounts.value.filter((a) => a.isActive));
  const totalKas = computed(() => {
    const kasAccounts = accounts.value.filter((a) => a.type === 'kas' && a.isActive);
    return kasAccounts.reduce((sum, a) => sum + (balances.value[a.id] || 0), 0);
  });

  async function loadAccounts() {
    isLoading.value = true;
    try {
      accounts.value = await accountService.getAccounts();
      balances.value = await accountService.getAllBalances();
    } finally {
      isLoading.value = false;
    }
  }

  async function loadLedger(accountId: string) {
    isLoading.value = true;
    try {
      ledgers.value = await accountService.getLedger(accountId);
    } finally {
      isLoading.value = false;
    }
  }

  async function addAccount(params: {
    name: string;
    type: 'kas' | 'bank' | 'ewallet' | 'server_pulsa' | 'provider_app';
    initialBalance?: number;
    accountNo?: string;
    ownerName?: string;
  }) {
    const id = await accountService.addAccount(params);
    await loadAccounts();
    return id;
  }

  async function adjustBalanceManual(params: {
    accountId: string;
    delta: number;
    reason: string;
    actorUserId: string;
  }) {
    await accountService.adjustBalanceManual(params);
    await loadAccounts();
    await loadLedger(params.accountId);
  }

  return {
    accounts,
    balances,
    ledgers,
    activeAccounts,
    totalKas,
    isLoading,
    loadAccounts,
    loadLedger,
    addAccount,
    adjustBalanceManual,
  };
});
