<template>
  <AppScaffold>
    <div class="tx-view-container">
      <div class="view-header">
        <h2 class="page-title">Riwayat Transaksi</h2>
        <div class="header-actions">
          <router-link v-if="authStore.isOwner" to="/transactions/owner" class="btn-owner-action">
            + Transaksi Owner
          </router-link>
          <span class="count-badge">{{ transactions.length }} Catatan</span>
        </div>
      </div>

      <!-- Filter Controls: Filter Tanggal, Chip Kategori & Dropdown Layanan Berkelompok -->
      <div class="filter-controls">
        <div class="filter-date">
          <input
            v-model="selectedDate"
            type="date"
            class="filter-date-input"
            data-testid="filter-date-input"
            aria-label="Filter Tanggal"
          />
          <button
            type="button"
            class="chip-btn"
            :class="{ active: selectedDate === null }"
            data-testid="filter-date-all"
            @click="selectedDate = null"
          >
            Semua
          </button>
        </div>

        <div class="filter-chips">
          <button
            v-for="f in categoryChips"
            :key="f.key"
            type="button"
            class="chip-btn"
            :class="{ active: selectedFilter === f.key }"
            @click="selectFilter(f.key)"
          >
            {{ f.label }}
          </button>
        </div>

        <div class="filter-select-wrapper">
          <label for="filter-select" class="filter-label">Filter Spesifik:</label>
          <SearchableSelect
            id="filter-select"
            v-model="selectedFilter"
            :options="filterSelectOptions"
            placeholder="Semua Layanan"
            search-placeholder="Cari filter..."
          />
        </div>
      </div>

      <!-- Empty State -->
      <EmptyState
        v-if="filteredTransactions.length === 0"
        title="Belum Ada Transaksi"
        :description="emptyDescription"
      >
        <template #action>
          <router-link v-if="authStore.isOwner" to="/transactions/owner" class="btn-primary">
            + Catat Transaksi Owner
          </router-link>
          <router-link v-else to="/transactions/add" class="btn-primary">
            + Catat Transaksi Baru
          </router-link>
        </template>
      </EmptyState>

      <!-- Daftar Transaksi (Tetap Terbaru Dulu) -->
      <div v-else class="tx-list">
        <div v-for="t in filteredTransactions" :key="t.id" class="tx-card" @click="openDetail(t.id)">
          <div class="tx-left">
            <div class="tx-icon-box" :class="t.layanan">
              <span class="service-initial">{{ t.layanan.substring(0, 2).toUpperCase() }}</span>
            </div>
            <div class="tx-info">
              <span class="tx-service">{{ t.layanan.replace(/_/g, ' ').toUpperCase() }}</span>
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
import { useAuthStore } from '../stores/authStore';
import { db } from '../db/database';
import type { Transaction } from '../db/types';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { getTodayWitaString, getWitaDateString } from '../utils/datePeriod';
import { layananByGroup } from '../core/layanan';
import SearchableSelect from '../components/SearchableSelect.vue';

const router = useRouter();
const authStore = useAuthStore();
const transactions = ref<Transaction[]>([]);
const selectedDate = ref<string | null>(getTodayWitaString());
const selectedFilter = ref<string>('all');

const categoryChips = [
  { key: 'all', label: 'Semua' },
  { key: 'group_penjualan', label: 'Penjualan' },
  { key: 'group_transfer', label: 'Transfer & Top-up' },
  { key: 'group_lainnya', label: 'Lainnya' },
  { key: 'hutang', label: 'Hutang' },
  { key: 'void', label: 'Batal (Void)' },
];

const penjualanLayananList = layananByGroup('penjualan');
const transferLayananList = [
  ...layananByGroup('transfer'),
  ...layananByGroup('owner').filter((l) => l.code.startsWith('deposit_') || l.code === 'pindah_dana'),
];
const lainnyaLayananList = [
  ...layananByGroup('lainnya'),
  ...layananByGroup('owner').filter((l) => l.code === 'operasional' || l.code === 'pembelian_stok'),
];

const PENJUALAN_SERVICES = penjualanLayananList.map((l) => l.code);
const TRANSFER_SERVICES = transferLayananList.map((l) => l.code);
const LAINNYA_SERVICES = lainnyaLayananList.map((l) => l.code);

const filterSelectOptions = computed(() => [
  { value: 'all', label: 'Semua Layanan' },
  { value: 'group_penjualan', label: 'Semua Penjualan', group: 'Penjualan', hint: 'Grup' },
  ...penjualanLayananList.map((l) => ({ value: l.code, label: l.label, group: 'Penjualan', hint: 'Penjualan' })),
  { value: 'group_transfer', label: 'Semua Transfer & Top-up', group: 'Transfer & Top-up', hint: 'Grup' },
  ...transferLayananList.map((l) => ({ value: l.code, label: l.label, group: 'Transfer & Top-up', hint: 'Transfer' })),
  { value: 'group_lainnya', label: 'Semua Lainnya', group: 'Lainnya', hint: 'Grup' },
  ...lainnyaLayananList.map((l) => ({ value: l.code, label: l.label, group: 'Lainnya', hint: 'Lainnya' })),
  { value: 'hutang', label: 'Hutang (Belum Lunas)', group: 'Status', hint: 'Status' },
  { value: 'void', label: 'Batal (Void)', group: 'Status', hint: 'Status' },
]);

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
  let list = transactions.value;

  // 1. Filter tanggal terlebih dahulu bila aktif (WITA)
  if (selectedDate.value) {
    list = list.filter((t) => getWitaDateString(t.date) === selectedDate.value);
  }

  // 2. Filter layanan / status
  if (selectedFilter.value === 'all') return list;
  if (selectedFilter.value === 'hutang') {
    return list.filter((t) => t.paymentStatus === 'hutang');
  }
  if (selectedFilter.value === 'void') {
    return list.filter((t) => t.status === 'void');
  }
  if (selectedFilter.value === 'group_penjualan') {
    return list.filter((t) => PENJUALAN_SERVICES.includes(t.layanan));
  }
  if (selectedFilter.value === 'group_transfer') {
    return list.filter((t) => TRANSFER_SERVICES.includes(t.layanan));
  }
  if (selectedFilter.value === 'group_lainnya') {
    return list.filter((t) => LAINNYA_SERVICES.includes(t.layanan));
  }
  return list.filter((t) => t.layanan === selectedFilter.value);
});

const emptyDescription = computed(() => {
  if (transactions.value.length === 0) {
    return 'Shift ini belum ada transaksi tercatat.';
  }
  if (selectedDate.value) {
    const txsOnDate = transactions.value.filter((t) => getWitaDateString(t.date) === selectedDate.value);
    if (txsOnDate.length === 0) {
      return `Tidak ada transaksi pada ${selectedDate.value}.`;
    }
  }
  return selectedFilter.value === 'all'
    ? 'Shift ini belum ada transaksi tercatat.'
    : 'Tidak ada transaksi dengan filter ini.';
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

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.btn-owner-action {
  padding: 6px 12px;
  background: var(--color-primary);
  color: #fff;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.count-badge {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.filter-controls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.filter-date {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-date-input {
  height: 34px;
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-family: inherit;
  font-size: 12px;
  outline: none;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.filter-date-input:focus {
  border-color: var(--color-primary);
}

.filter-chips {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
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

.filter-select-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
}

.filter-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  white-space: nowrap;
}

.filter-select {
  flex: 1;
  padding: 6px 10px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 12px;
  outline: none;
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
