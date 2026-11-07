<template>
  <AppScaffold>
    <div class="reports-header">
      <h2 class="page-title">Laporan Keuangan</h2>
      <div class="period-chips">
        <button
          class="chip-btn"
          :class="{ active: selectedPeriod === 'today' }"
          @click="changePeriod('today')"
        >
          Hari Ini
        </button>
        <button
          class="chip-btn"
          :class="{ active: selectedPeriod === 'week' }"
          @click="changePeriod('week')"
        >
          7 Hari Terakhir
        </button>
        <button
          class="chip-btn"
          :class="{ active: selectedPeriod === 'month' }"
          @click="changePeriod('month')"
        >
          Bulan Ini
        </button>
      </div>
    </div>

    <!-- Alert Stok & Saldo Menipis -->
    <div v-if="reportStore.lowStock.length > 0" class="alert-box warning">
      <span class="alert-icon">⚠️</span>
      <div class="alert-content">
        <span class="alert-title">Peringatan Stok Menipis</span>
        <span class="alert-desc">{{ reportStore.lowStock.length }} produk memiliki stok di bawah batas minimum: {{ reportStore.lowStock.map(p => p.name).join(', ') }}.</span>
      </div>
    </div>

    <div v-if="reportStore.lowAccounts.length > 0" class="alert-box info">
      <span class="alert-icon">ℹ️</span>
      <div class="alert-content">
        <span class="alert-title">Saldo Rekening/Kas Rendah</span>
        <span class="alert-desc">{{ reportStore.lowAccounts.map(a => a.name).join(', ') }} saldo ≤ Rp 100.000.</span>
      </div>
    </div>

    <!-- Ringkasan Keuangan -->
    <div class="summary-grid">
      <div class="summary-card laba">
        <span class="summary-label">Laba Bersih</span>
        <span class="summary-val">{{ formatRupiah(reportStore.totalLaba) }}</span>
        <span class="summary-note">Fee admin + margin laba barang</span>
      </div>
      <div class="summary-card in">
        <span class="summary-label">Total Masuk</span>
        <span class="summary-val text-success">{{ formatRupiah(reportStore.totalIn) }}</span>
        <span class="summary-note">Penjualan + fee admin konter</span>
      </div>
      <div class="summary-card out">
        <span class="summary-label">Total Keluar</span>
        <span class="summary-val text-danger">{{ formatRupiah(reportStore.totalOut) }}</span>
        <span class="summary-note">Modal terjual + operasional</span>
      </div>
    </div>

    <!-- Breakdown Layanan -->
    <div class="report-section">
      <h3 class="section-title">Aktivitas per Layanan</h3>
      <div v-if="reportStore.byLayanan.length === 0" class="empty-panel">
        Belum ada data transaksi di periode ini.
      </div>
      <div v-else class="data-list">
        <div v-for="item in reportStore.byLayanan" :key="item.label" class="data-item">
          <div class="item-left">
            <span class="item-name">{{ formatLayanan(item.label) }}</span>
          </div>
          <span class="item-qty">{{ item.total }} transaksi</span>
        </div>
      </div>
    </div>

    <!-- Produk Terlaris -->
    <div v-if="reportStore.byProduct.length > 0" class="report-section">
      <h3 class="section-title">Produk Terlaris</h3>
      <div class="data-list">
        <div v-for="item in reportStore.byProduct.slice(0, 5)" :key="item.label" class="data-item">
          <span class="item-name">{{ item.label }}</span>
          <span class="item-qty highlight">{{ item.total }} terjual</span>
        </div>
      </div>
    </div>

    <!-- Tren Harian -->
    <div v-if="reportStore.trend.length > 0" class="report-section">
      <h3 class="section-title">Tren Laba Harian</h3>
      <div class="trend-list">
        <div v-for="t in reportStore.trend" :key="t.period" class="trend-row">
          <span class="trend-date">{{ formatShortDate(t.period) }}</span>
          <div class="trend-bar-wrapper">
            <div
              class="trend-bar"
              :style="{ width: getTrendWidth(t.laba) }"
            ></div>
          </div>
          <span class="trend-val" :class="t.laba >= 0 ? 'text-success' : 'text-danger'">
            {{ formatRupiah(t.laba) }}
          </span>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import AppScaffold from '../components/AppScaffold.vue';
import { useReportStore } from '../stores/reportStore';
import { formatRupiah, formatShortDate } from '../utils/format';
import { SERVICE_LABELS } from '../core/constants';

const reportStore = useReportStore();
const selectedPeriod = ref<'today' | 'week' | 'month'>('today');

function formatLayanan(code: string): string {
  return SERVICE_LABELS[code as keyof typeof SERVICE_LABELS] || code;
}

function getRange(type: 'today' | 'week' | 'month'): { from: number; to: number } {
  const now = new Date();
  const to = now.getTime();

  if (type === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    return { from: start.getTime(), to };
  } else if (type === 'week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6, 0, 0, 0, 0);
    return { from: start.getTime(), to };
  } else {
    const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
    return { from: start.getTime(), to };
  }
}

async function changePeriod(type: 'today' | 'week' | 'month') {
  selectedPeriod.value = type;
  const { from, to } = getRange(type);
  await reportStore.loadPeriodSummary(from, to);
}

function getTrendWidth(laba: number): string {
  if (reportStore.trend.length === 0) return '0%';
  const max = Math.max(...reportStore.trend.map((t) => Math.abs(t.laba)), 1);
  const pct = Math.min(100, Math.round((Math.abs(laba) / max) * 100));
  return `${Math.max(pct, 5)}%`;
}

onMounted(() => {
  changePeriod('today');
});
</script>

<style scoped>
.reports-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 12px;
}
.period-chips {
  display: flex;
  gap: 8px;
}
.chip-btn {
  padding: 8px 14px;
  border-radius: 20px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.chip-btn.active {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
  font-weight: 600;
}

.alert-box {
  display: flex;
  gap: 12px;
  align-items: flex-start;
  padding: 12px;
  border-radius: 12px;
  margin-bottom: 12px;
  font-size: 12px;
}
.alert-box.warning {
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  color: #92400E;
}
.alert-box.info {
  background: #EFF6FF;
  border: 1px solid #BFDBFE;
  color: #1E40AF;
}
.alert-title {
  font-weight: 700;
  display: block;
  margin-bottom: 2px;
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 12px;
  margin-bottom: 20px;
}
.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
}
.summary-card.laba {
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(37, 99, 235, 0.12) 100%);
  border-color: rgba(37, 99, 235, 0.2);
}
.summary-label {
  font-size: 13px;
  color: var(--text-muted);
  font-weight: 500;
}
.summary-val {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
  margin: 4px 0;
  color: var(--text-main);
}
.summary-note {
  font-size: 11px;
  color: var(--text-muted);
}
.text-success {
  color: var(--color-success);
}
.text-danger {
  color: var(--color-danger);
}

.report-section {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  margin-bottom: 16px;
}
.section-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 12px;
}
.empty-panel {
  font-size: 13px;
  color: var(--text-muted);
  padding: 12px 0;
  text-align: center;
}

.data-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.data-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--border-color);
  font-size: 13px;
}
.data-item:last-child {
  border-bottom: none;
  padding-bottom: 0;
}
.item-name {
  color: var(--text-main);
  font-weight: 500;
}
.item-qty {
  color: var(--text-muted);
  font-variant-numeric: tabular-nums;
}
.item-qty.highlight {
  font-weight: 600;
  color: var(--primary);
}

.trend-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.trend-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12px;
}
.trend-date {
  width: 70px;
  color: var(--text-muted);
}
.trend-bar-wrapper {
  flex: 1;
  background: var(--bg-canvas);
  height: 8px;
  border-radius: 4px;
  overflow: hidden;
}
.trend-bar {
  background: var(--primary);
  height: 100%;
  border-radius: 4px;
  transition: width 0.3s ease;
}
.trend-val {
  width: 90px;
  text-align: right;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
</style>
