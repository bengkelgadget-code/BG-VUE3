<template>
  <AppScaffold>
    <div class="accounts-view-container">
      <div class="view-header">
        <h2 class="page-title">Akun Saldo ({{ accounts.length }} Akun)</h2>
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

      <div v-else class="account-groups">
        <section
          v-for="group in groupedAccounts"
          :key="group.type"
          class="account-group"
        >
          <h3 class="group-title">
            {{ group.label }} ({{ group.accounts.length }})
          </h3>
          <div class="account-list">
            <div
              v-for="acc in group.accounts"
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
                  {{ formatRupiah(balances[acc.id] ?? 0) }}
                </span>
                <span class="acc-detail-link">Lihat Mutasi →</span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { db } from '../db/database';
import { accountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah } from '../utils/format';
import { ACCOUNT_TYPE_LABELS, compareAccounts } from '../utils/productSort';
import type { Account } from '../db/types';

type AccountType = Account['type'];

const router = useRouter();
const authStore = useAuthStore();

const accounts = ref<Account[]>([]);
const balances = ref<Record<string, number>>({});

const groupedAccounts = computed(() => {
  const groups: { type: AccountType; label: string; accounts: Account[] }[] = [];
  const typeOrder: AccountType[] = ['kas', 'bank', 'ewallet', 'server_pulsa', 'provider_app'];

  for (const type of typeOrder) {
    const matching = accounts.value
      .filter((a) => a.type === type)
      .sort(compareAccounts);
    if (matching.length > 0) {
      groups.push({
        type,
        label: ACCOUNT_TYPE_LABELS[type] || type.toUpperCase(),
        accounts: matching,
      });
    }
  }

  // Akun dengan type yang mungkin belum terdaftar di typeOrder standar
  const unclassified = accounts.value
    .filter((a) => !typeOrder.includes(a.type))
    .sort(compareAccounts);
  if (unclassified.length > 0) {
    groups.push({
      type: 'lainnya' as AccountType,
      label: 'LAINNYA',
      accounts: unclassified,
    });
  }

  return groups;
});

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
  color: var(--color-white);
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.account-groups {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.account-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.group-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--text-muted);
  letter-spacing: 0.5px;
  text-transform: uppercase;
  margin: 0;
  padding: 0 2px;
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
  color: var(--color-white);
  border-radius: var(--radius-btn);
  text-decoration: none;
}
</style>
