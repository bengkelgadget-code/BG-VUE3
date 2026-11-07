<template>
  <AppScaffold>
    <div class="reports-container">
      <div class="view-header">
        <h2 class="page-title">Dashboard Laporan</h2>
        <span class="header-subtitle">Statistik harian & bulanan pembukuan konter</span>
      </div>

      <!-- 1. Pemilih Periode: Toggle Harian | Bulanan & Date/Month Picker -->
      <div class="period-control-card">
        <div class="period-toggle-row">
          <div class="toggle-buttons">
            <button
              class="toggle-btn"
              :class="{ active: periodMode === 'day' }"
              @click="switchPeriodMode('day')"
            >
              Harian
            </button>
            <button
              class="toggle-btn"
              :class="{ active: periodMode === 'month' }"
              @click="switchPeriodMode('month')"
            >
              Bulanan
            </button>
          </div>

          <!-- Picker Input -->
          <div class="picker-wrapper">
            <input
              v-if="periodMode === 'day'"
              v-model="selectedDateStr"
              type="date"
              class="period-picker-input"
              @change="onDateStrChanged"
            />
            <input
              v-else
              v-model="selectedMonthStr"
              type="month"
              class="period-picker-input"
              @change="onMonthStrChanged"
            />
          </div>
        </div>

        <div class="active-period-label">
          <span class="calendar-icon">📅</span>
          <span class="period-text">{{ activeRangeLabel }}</span>
          <span class="wita-tag">WITA</span>
        </div>
      </div>

      <!-- Alert Peringatan Stok & Saldo (Bila Ada) -->
      <div v-if="reportStore.lowStock.length > 0" class="alert-box warning">
        <span class="alert-icon">⚠️</span>
        <div class="alert-content">
          <span class="alert-title">Peringatan Stok Menipis</span>
          <span class="alert-desc">
            {{ reportStore.lowStock.length }} produk di bawah batas minimum:
            {{ reportStore.lowStock.map(p => p.name).join(', ') }}.
          </span>
        </div>
      </div>

      <div v-if="reportStore.lowAccounts.length > 0" class="alert-box info">
        <span class="alert-icon">ℹ️</span>
        <div class="alert-content">
          <span class="alert-title">Saldo Kas / Catatan Rendah</span>
          <span class="alert-desc">
            {{ reportStore.lowAccounts.map(a => a.name).join(', ') }} saldo ≤ Rp 100.000.
          </span>
        </div>
      </div>

      <!-- Loading State -->
      <div v-if="reportStore.isLoading" class="loading-state">
        <p>Memuat statistik periode...</p>
      </div>

      <!-- 2. Isi Dashboard -->
      <div v-else>
        <!-- 4 Kartu Ringkasan -->
        <div class="summary-grid">
          <!-- Kartu Laba -->
          <div class="summary-card laba">
            <span class="card-label">Laba Bersih</span>
            <div class="card-amount money-display">{{ formatRupiah(reportStore.totalLaba) }}</div>
            <div class="diff-indicator" :class="diffLaba >= 0 ? 'up' : 'down'">
              <span>{{ diffLaba >= 0 ? '▲' : '▼' }} {{ formatRupiah(Math.abs(diffLaba)) }}</span>
              <span class="diff-context">vs {{ previousPeriodName }}</span>
            </div>
          </div>

          <!-- Kartu Pemasukan -->
          <div class="summary-card in">
            <span class="card-label">Pemasukan</span>
            <div class="card-amount text-success money-display">{{ formatRupiah(reportStore.totalIn) }}</div>
            <div class="diff-indicator" :class="diffIn >= 0 ? 'up' : 'down'">
              <span>{{ diffIn >= 0 ? '▲' : '▼' }} {{ formatRupiah(Math.abs(diffIn)) }}</span>
              <span class="diff-context">vs {{ previousPeriodName }}</span>
            </div>
          </div>

          <!-- Kartu Pengeluaran -->
          <div class="summary-card out">
            <span class="card-label">Pengeluaran (Modal + Opr)</span>
            <div class="card-amount text-danger money-display">{{ formatRupiah(reportStore.totalOut) }}</div>
            <div class="diff-indicator" :class="diffOut <= 0 ? 'up-good' : 'down-bad'">
              <span>{{ diffOut >= 0 ? '▲' : '▼' }} {{ formatRupiah(Math.abs(diffOut)) }}</span>
              <span class="diff-context">vs {{ previousPeriodName }}</span>
            </div>
          </div>

          <!-- Kartu Transaksi -->
          <div class="summary-card tx">
            <span class="card-label">Jumlah Transaksi</span>
            <div class="card-amount money-display">{{ reportStore.totalTxCount }} Transaksi</div>
            <div class="diff-indicator" :class="diffTx >= 0 ? 'up' : 'down'">
              <span>{{ diffTx >= 0 ? '▲' : '▼' }} {{ Math.abs(diffTx) }} tx</span>
              <span class="diff-context">vs {{ previousPeriodName }}</span>
            </div>
          </div>
        </div>

        <!-- Bila Periode Kosong: Tampilkan Empty State yang Rapi -->
        <EmptyState
          v-if="reportStore.totalTxCount === 0"
          title="Belum Ada Transaksi di Periode Ini"
          description="Tidak ada transaksi yang tercatat pada tanggal atau bulan yang dipilih."
        />

        <!-- Jika Ada Transaksi: Tampilkan Diagram & Breakdown -->
        <div v-else class="charts-and-tables-container">
          <!-- Donat per Layanan -->
          <div class="chart-section-card">
            <h3 class="section-title">Distribusi per Layanan</h3>
            <p class="section-desc">Porsi frekuensi transaksi per kelompok layanan pada periode ini</p>
            <div class="canvas-wrapper doughnut-wrapper">
              <canvas ref="donutCanvasRef"></canvas>
            </div>
          </div>

          <!-- Grafik Batang Tren -->
          <div class="chart-section-card">
            <h3 class="section-title">
              {{ periodMode === 'month' ? 'Tren Laba Bersih Harian' : 'Aktivitas Layanan Hari Ini' }}
            </h3>
            <p class="section-desc">
              {{ periodMode === 'month' ? 'Pergerakan laba per hari dalam bulan' : 'Perbandingan transaksi antar layanan hari ini' }}
            </p>
            <div class="canvas-wrapper bar-wrapper">
              <canvas ref="barCanvasRef"></canvas>
            </div>
          </div>

          <!-- Top Produk Terlaris -->
          <div v-if="reportStore.byProduct.length > 0" class="data-section-card">
            <h3 class="section-title">Top 5 Produk Terlaris</h3>
            <div class="top-list">
              <div
                v-for="(prod, idx) in reportStore.byProduct.slice(0, 5)"
                :key="prod.label"
                class="top-item"
              >
                <div class="rank-badge">{{ idx + 1 }}</div>
                <div class="item-info">
                  <span class="prod-name">{{ prod.label }}</span>
                  <span class="prod-laba">Laba: {{ formatRupiah(prod.laba ?? 0) }}</span>
                </div>
                <div class="item-qty money-display">
                  {{ prod.total }} pcs
                </div>
              </div>
            </div>
          </div>

          <!-- Statistik per Kasir -->
          <div v-if="reportStore.byKasir.length > 0" class="data-section-card">
            <h3 class="section-title">Kinerja Petugas Kasir</h3>
            <div class="top-list">
              <div
                v-for="kasir in reportStore.byKasir"
                :key="kasir.label"
                class="top-item kasir-item"
              >
                <div class="kasir-avatar">👤</div>
                <div class="item-info">
                  <span class="prod-name">{{ kasir.label }}</span>
                  <span class="prod-laba">Kontribusi Laba: {{ formatRupiah(kasir.laba ?? 0) }}</span>
                </div>
                <div class="item-qty money-display">
                  {{ kasir.total }} transaksi
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue';
import {
  Chart,
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale,
} from 'chart.js';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { useReportStore } from '../stores/reportStore';
import { formatRupiah, formatShortDate } from '../utils/format';
import {
  getTodayWitaString,
  getCurrentMonthWitaString,
  getDailyPeriodRange,
  getMonthlyPeriodRange,
} from '../utils/datePeriod';
import { SERVICE_LABELS } from '../core/constants';

// Registrasi modul Chart.js
Chart.register(
  DoughnutController,
  ArcElement,
  Tooltip,
  Legend,
  BarController,
  BarElement,
  CategoryScale,
  LinearScale
);

const reportStore = useReportStore();

const periodMode = ref<'day' | 'month'>('day');
const selectedDateStr = ref<string>(getTodayWitaString());
const selectedMonthStr = ref<string>(getCurrentMonthWitaString());
const activeRangeLabel = ref<string>('');

const donutCanvasRef = ref<HTMLCanvasElement | null>(null);
const barCanvasRef = ref<HTMLCanvasElement | null>(null);
let donutChart: Chart | null = null;
let barChart: Chart | null = null;

const previousPeriodName = computed(() => {
  return periodMode.value === 'day' ? 'Kemarin' : 'Bulan Lalu';
});

const diffIn = computed(() => reportStore.totalIn - reportStore.prevTotalIn);
const diffOut = computed(() => reportStore.totalOut - reportStore.prevTotalOut);
const diffLaba = computed(() => reportStore.totalLaba - reportStore.prevTotalLaba);
const diffTx = computed(() => reportStore.totalTxCount - reportStore.prevTotalTxCount);

function formatLayanan(code: string): string {
  return SERVICE_LABELS[code as keyof typeof SERVICE_LABELS] || code;
}

async function updateDashboardData() {
  if (periodMode.value === 'day') {
    const range = getDailyPeriodRange(selectedDateStr.value);
    activeRangeLabel.value = range.label;
    await reportStore.loadPeriodSummary(range.from, range.to, range.prevFrom, range.prevTo);
  } else {
    const range = getMonthlyPeriodRange(selectedMonthStr.value);
    activeRangeLabel.value = range.label;
    await reportStore.loadPeriodSummary(range.from, range.to, range.prevFrom, range.prevTo);
  }

  await nextTick();
  renderCharts();
}

function switchPeriodMode(mode: 'day' | 'month') {
  if (periodMode.value === mode) return;
  periodMode.value = mode;
  updateDashboardData();
}

function onDateStrChanged() {
  updateDashboardData();
}

function onMonthStrChanged() {
  updateDashboardData();
}

function renderCharts() {
  if (reportStore.totalTxCount === 0) {
    destroyCharts();
    return;
  }
  renderDonutChart();
  renderBarChart();
}

function destroyCharts() {
  if (donutChart) {
    donutChart.destroy();
    donutChart = null;
  }
  if (barChart) {
    barChart.destroy();
    barChart = null;
  }
}

function renderDonutChart() {
  if (!donutCanvasRef.value) return;
  if (donutChart) {
    donutChart.destroy();
    donutChart = null;
  }

  if (reportStore.byLayanan.length === 0) return;

  const labels = reportStore.byLayanan.map((l) => formatLayanan(l.label));
  const data = reportStore.byLayanan.map((l) => l.total);
  const colors = [
    '#2563EB', '#10B981', '#F59E0B', '#8B5CF6', '#EC4899',
    '#06B6D4', '#F97316', '#64748B', '#14B8A6', '#6366F1',
    '#84CC16', '#A855F7',
  ];

  donutChart = new Chart(donutCanvasRef.value, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [
        {
          data,
          backgroundColor: colors.slice(0, data.length),
          borderWidth: 2,
          borderColor: '#FFFFFF',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            boxWidth: 10,
            padding: 10,
            font: { family: 'Plus Jakarta Sans', size: 11 },
          },
        },
      },
      cutout: '65%',
    },
  });
}

function renderBarChart() {
  if (!barCanvasRef.value) return;
  if (barChart) {
    barChart.destroy();
    barChart = null;
  }

  let labels: string[] = [];
  let data: number[] = [];
  let seriesLabel = '';

  if (periodMode.value === 'month') {
    if (reportStore.trend.length === 0) return;
    labels = reportStore.trend.map((t) => formatShortDate(t.period));
    data = reportStore.trend.map((t) => t.laba);
    seriesLabel = 'Laba Harian (Rp)';
  } else {
    if (reportStore.byLayanan.length === 0) return;
    labels = reportStore.byLayanan.map((l) => formatLayanan(l.label));
    data = reportStore.byLayanan.map((l) => l.total);
    seriesLabel = 'Jumlah Transaksi';
  }

  barChart = new Chart(barCanvasRef.value, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: seriesLabel,
          data,
          backgroundColor: '#2563EB',
          borderRadius: 6,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            font: { family: 'Plus Jakarta Sans', size: 10 },
          },
        },
        x: {
          ticks: {
            font: { family: 'Plus Jakarta Sans', size: 10 },
          },
        },
      },
      plugins: {
        legend: { display: false },
      },
    },
  });
}

onMounted(() => {
  updateDashboardData();
});

onBeforeUnmount(() => {
  destroyCharts();
});
</script>

<style scoped>
.reports-container {
  padding-bottom: 30px;
}
.view-header {
  margin-bottom: 12px;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}
.header-subtitle {
  font-size: 12px;
  color: var(--text-muted);
}

.period-control-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px;
  margin-bottom: 16px;
}
.period-toggle-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
}
.toggle-buttons {
  display: flex;
  background: var(--bg-canvas);
  border: 1px solid var(--border-color);
  border-radius: 20px;
  padding: 2px;
}
.toggle-btn {
  padding: 6px 14px;
  border-radius: 18px;
  border: none;
  background: transparent;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.2s ease;
}
.toggle-btn.active {
  background: var(--primary);
  color: white;
}

.period-picker-input {
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 13px;
  font-family: inherit;
}
.active-period-label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: var(--text-main);
  font-weight: 600;
}
.wita-tag {
  font-size: 10px;
  padding: 2px 5px;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
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
}

.summary-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 16px;
}
.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px;
  display: flex;
  flex-direction: column;
}
.summary-card.laba {
  grid-column: span 2;
  background: linear-gradient(135deg, rgba(37, 99, 235, 0.06) 0%, rgba(37, 99, 235, 0.15) 100%);
  border-color: rgba(37, 99, 235, 0.25);
}
.card-label {
  font-size: 12px;
  color: var(--text-muted);
  font-weight: 500;
}
.card-amount {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  margin: 4px 0;
}
.summary-card.laba .card-amount {
  font-size: 24px;
  color: var(--primary);
}
.text-success {
  color: var(--color-success);
}
.text-danger {
  color: var(--color-danger);
}

.diff-indicator {
  font-size: 11px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 4px;
}
.diff-indicator.up {
  color: var(--color-success);
}
.diff-indicator.down {
  color: var(--color-danger);
}
.diff-indicator.up-good {
  color: var(--color-success);
}
.diff-indicator.down-bad {
  color: var(--color-danger);
}
.diff-context {
  color: var(--text-muted);
  font-weight: 400;
}

.charts-and-tables-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.chart-section-card,
.data-section-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
}
.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  margin-bottom: 12px;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
}
.doughnut-wrapper {
  height: 240px;
}
.bar-wrapper {
  height: 200px;
}

.top-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.top-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px;
  background: var(--bg-canvas);
  border-radius: 10px;
}
.rank-badge {
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
}
.kasir-avatar {
  font-size: 18px;
}
.item-info {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.prod-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}
.prod-laba {
  font-size: 11px;
  color: var(--primary);
  font-weight: 500;
}
.item-qty {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}
</style>
