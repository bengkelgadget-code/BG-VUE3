<template>
  <AppScaffold>
    <div class="customers-container">
      <div class="view-header">
        <h2 class="page-title">Master Pelanggan</h2>
        <router-link to="/customers/add" class="btn-add">
          + Tambah Pelanggan
        </router-link>
      </div>

      <p class="section-intro">
        Daftar pelanggan digunakan untuk pencatatan transaksi hutang/bon dan riwayat langganan.
      </p>

      <div class="search-box">
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Cari nama atau nomor HP pelanggan..."
          @input="onSearch"
        />
      </div>

      <EmptyState
        v-if="customers.length === 0"
        title="Belum Ada Pelanggan"
        description="Master pelanggan kosong saat awal. Tambahkan pelanggan untuk mencatat transaksi hutang."
      >
        <template #action>
          <router-link to="/customers/add" class="btn-primary">
            + Tambah Pelanggan Baru
          </router-link>
        </template>
      </EmptyState>

      <div v-else class="customer-list">
        <div v-for="c in customers" :key="c.id" class="customer-card">
          <div class="cust-info">
            <span class="cust-name">{{ c.name }}</span>
            <span v-if="c.phone" class="cust-phone">HP: {{ c.phone }}</span>
            <span v-if="c.note" class="cust-note">{{ c.note }}</span>
          </div>

          <div class="cust-right">
            <span v-if="c.balanceHutang > 0" class="debt-badge money-display">
              Hutang: {{ formatRupiah(c.balanceHutang) }}
            </span>
            <span v-else class="lunas-badge">Tidak Ada Hutang</span>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { customerService } from '../services/customerService';
import { formatRupiah } from '../utils/format';
import type { Customer } from '../db/types';

const customers = ref<Customer[]>([]);
const searchQuery = ref<string>('');

onMounted(async () => {
  await loadData();
});

async function loadData() {
  customers.value = await customerService.listCustomers({ query: searchQuery.value });
}

function onSearch() {
  loadData();
}
</script>

<style scoped>
.customers-container {
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

.search-box {
  width: 100%;
}

.search-input {
  width: 100%;
  height: 44px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}

.customer-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.customer-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
}

.cust-info {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.cust-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.cust-phone {
  font-size: 12px;
  color: var(--text-secondary);
}

.cust-note {
  font-size: 11px;
  color: var(--text-muted);
}

.cust-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
}

.debt-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-warning);
  background: var(--color-warning-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
}

.lunas-badge {
  font-size: 11px;
  color: var(--color-income);
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
