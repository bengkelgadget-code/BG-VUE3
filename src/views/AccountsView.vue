<template>
  <AppScaffold>
    <div class="accounts-view-container">
      <div class="view-header">
        <h2 class="page-title">Akun Saldo (5 Kelompok)</h2>
        <router-link v-if="authStore.isAdmin" to="/accounts/add" class="btn-add">
          + Tambah Akun
        </router-link>
      </div>

      <p class="section-intro">
        Semua tempat penyimpanan uang konter diperlakukan sebagai akun saldo catatan.
      </p>

      <EmptyState
        v-if="accounts.length === 0"
        title="Belum Ada Akun Saldo"
        description="Master akun kosong saat awal. Buat akun Kas (laci konter), Rekening Bank, atau E-Wallet."
      >
        <template #action>
          <router-link v-if="authStore.isAdmin" to="/accounts/add" class="btn-primary">
            + Tambah Akun Sekarang
          </router-link>
        </template>
      </EmptyState>

      <div v-else class="account-list">
        <div
          v-for="acc in accounts"
          :key="acc.id"
          class="account-item-card"
          @click="openDetail(acc.id)"
        >
          <div class="acc-main">
            <span class="acc-name">{{ acc.name }}</span>
            <span class="acc-type-badge">
              {{ acc.type === 'server_pulsa' || acc.type === 'provider_app' ? `${acc.type} (catatan)` : acc.type }}
            </span>
            <span v-if="acc.accountNo" class="acc-meta">No: {{ acc.accountNo }}</span>
          </div>

          <div class="acc-balance-col">
            <span class="acc-balance-amount money-display">
              {{ formatRupiah(balances[acc.id] ?? acc.initialBalance) }}
            </span>
            <span class="acc-detail-link">Lihat Mutasi →</span>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { db } from '../db/database';
import { accountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah } from '../utils/format';
import type { Account } from '../db/types';

const router = useRouter();
const authStore = useAuthStore();

const accounts = ref<Account[]>([]);
const balances = ref<Record<string, number>>({});

onMounted(async () => {
  await loadData();
});

async function loadData() {
  accounts.value = await db.accounts.toArray();
  balances.value = await accountService.getAllBalances();
}

function openDetail(id: string) {
  router.push(`/accounts/${id}`);
}
</script>

<style scoped>
.accounts-view-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.btn-add {
  padding: 8px 14px;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.account-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.account-item-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 14px 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.account-item-card:active {
  background: var(--surface-card-subtle);
}

.acc-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.acc-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.acc-type-badge {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
  text-transform: capitalize;
}

.acc-meta {
  font-size: 11px;
  color: var(--text-muted);
}

.acc-balance-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.acc-balance-amount {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
}

.acc-detail-link {
  font-size: 11px;
  color: var(--color-primary);
  font-weight: 600;
}

.btn-primary {
  display: inline-block;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-btn);
  text-decoration: none;
}
</style>
