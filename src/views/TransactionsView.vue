<template>
  <AppScaffold>
    <div class="tx-view-container">
      <div class="view-header">
        <h2 class="page-title">Riwayat Transaksi</h2>
        <span class="count-badge">{{ transactions.length }} Catatan</span>
      </div>

      <!-- Filter Chip Bar -->
      <div class="filter-chips">
        <button
          v-for="f in filterOptions"
          :key="f.key"
          type="button"
          class="chip-btn"
          :class="{ active: selectedFilter === f.key }"
          @click="selectFilter(f.key)"
        >
          {{ f.label }}
        </button>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-if="filteredTransactions.length === 0"
        title="Belum Ada Transaksi"
        :description="selectedFilter === 'all' ? 'Shift ini belum ada transaksi tercatat.' : 'Tidak ada transaksi dengan filter ini.'"
      >
        <template #action>
          <router-link to="/transactions/add" class="btn-primary">
            + Catat Transaksi Baru
          </router-link>
        </template>
      </EmptyState>

      <!-- Daftar Transaksi Grup Per Tanggal -->
      <div v-else class="tx-list">
        <div v-for="t in filteredTransactions" :key="t.id" class="tx-card" @click="openDetail(t.id)">
          <div class="tx-left">
            <div class="tx-icon-box" :class="t.layanan">
              <span class="service-initial">{{ t.layanan.substring(0, 2).toUpperCase() }}</span>
            </div>
            <div class="tx-info">
              <span class="tx-service">{{ t.layanan.replace('_', ' ').toUpperCase() }}</span>
              <span class="tx-date">{{ formatTanggalWita(t.date, { hour: '2-digit', minute: '2-digit' }) }}</span>
              <span v-if="t.referenceNo" class="tx-ref">{{ t.referenceNo }}</span>
            </div>
          </div>

          <div class="tx-right">
            <span class="tx-amount money-display">{{ formatRupiah(t.nominal) }}</span>
            <div class="badge-row">
              <span v-if="t.status === 'void'" class="badge badge-void">BATAL</span>
              <span v-else-if="t.paymentStatus === 'hutang'" class="badge badge-debt">HUTANG</span>
              <span v-else class="badge badge-paid">LUNAS</span>
              <span v-if="t.fee > 0" class="badge badge-fee">+Admin {{ formatRupiah(t.fee) }}</span>
            </div>
          </div>
        </div>
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
import type { Transaction } from '../db/types';
import { formatRupiah, formatTanggalWita } from '../utils/format';

const router = useRouter();
const transactions = ref<Transaction[]>([]);
const selectedFilter = ref<string>('all');

const filterOptions = [
  { key: 'all', label: 'Semua' },
  { key: 'transfer', label: 'Transfer' },
  { key: 'tarik_tunai', label: 'Tarik Tunai' },
  { key: 'pulsa', label: 'Pulsa' },
  { key: 'hutang', label: 'Hutang' },
  { key: 'void', label: 'Batal (Void)' },
];

onMounted(async () => {
  await loadData();
});

async function loadData() {
  transactions.value = await db.transactions.orderBy('date').reverse().toArray();
}

function selectFilter(key: string) {
  selectedFilter.value = key;
}

const filteredTransactions = computed(() => {
  if (selectedFilter.value === 'all') return transactions.value;
  if (selectedFilter.value === 'hutang') {
    return transactions.value.filter((t) => t.paymentStatus === 'hutang');
  }
  if (selectedFilter.value === 'void') {
    return transactions.value.filter((t) => t.status === 'void');
  }
  return transactions.value.filter((t) => t.layanan === selectedFilter.value);
});

function openDetail(id: string) {
  router.push(`/transactions/${id}`);
}
</script>

<style scoped>
.tx-view-container {
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

.count-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.chip-btn {
  padding: 6px 14px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.chip-btn.active {
  background: var(--color-primary);
  color: var(--color-white);
  border-color: var(--color-primary);
}

.tx-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.tx-card:active {
  background: var(--surface-card-subtle);
}

.tx-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tx-icon-box {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  background: var(--surface-card-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--color-primary);
  font-weight: 800;
  font-size: 13px;
}

.tx-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tx-service {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.tx-date {
  font-size: 11px;
  color: var(--text-secondary);
}

.tx-ref {
  font-size: 11px;
  color: var(--text-muted);
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.tx-amount {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.badge-row {
  display: flex;
  gap: 4px;
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: var(--radius-chip);
}

.badge-paid {
  background: var(--color-income-subtle);
  color: var(--color-income);
}

.badge-debt {
  background: var(--color-warning-subtle);
  color: var(--color-warning);
}

.badge-void {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.badge-fee {
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
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
