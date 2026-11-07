<template>
  <AppScaffold>
    <div class="shifts-container">
      <div class="view-header">
        <h2 class="page-title">Shift & Serah Terima</h2>
        <router-link v-if="!activeShift" to="/shifts/open" class="btn-open">
          Buka Shift Baru
        </router-link>
        <router-link v-else to="/shifts/close" class="btn-close">
          Tutup Shift Aktif
        </router-link>
      </div>

      <!-- Kartu Shift Aktif -->
      <div v-if="activeShift" class="active-shift-card">
        <div class="status-indicator">
          <span class="dot-online"></span>
          <span class="active-title">Shift Sedang Berjalan</span>
        </div>
        <div class="shift-detail-grid">
          <div class="s-detail">
            <span class="s-d-label">Dibuka Sejak:</span>
            <span class="s-d-val">{{ formatTanggalWita(activeShift.openedAt) }}</span>
          </div>
          <div class="s-detail">
            <span class="s-d-label">Kas Awal Fisik:</span>
            <span class="s-d-val money-display">{{ formatRupiah(activeShift.kasAwalFisik) }}</span>
          </div>
        </div>
        <router-link to="/shifts/close" class="btn-tutup-full">
          Minta Tutup Shift & Hitung Fisik
        </router-link>
      </div>

      <!-- Riwayat Shift Sebelumnya -->
      <div class="history-section">
        <h3 class="section-title">Riwayat Shift Sebelumnya</h3>

        <EmptyState
          v-if="shifts.length === 0"
          title="Belum Ada Riwayat Shift"
          description="Semua sesi shift yang telah ditutup dan diserahterimakan akan muncul di sini."
        />

        <div v-else class="shift-history-list">
          <div v-for="s in shifts" :key="s.id" class="history-card">
            <div class="h-header">
              <span class="h-date">{{ formatTanggalWita(s.openedAt) }}</span>
              <span class="h-status-badge" :class="s.status">{{ s.status.toUpperCase() }}</span>
            </div>

            <div class="h-body">
              <div class="h-col">
                <span class="h-label">Kas Awal:</span>
                <span class="h-val money-display">{{ formatRupiah(s.kasAwalFisik) }}</span>
              </div>
              <div v-if="s.closedAt" class="h-col">
                <span class="h-label">Ditutup:</span>
                <span class="h-val">{{ formatTanggalWita(s.closedAt, { hour: '2-digit', minute: '2-digit' }) }}</span>
              </div>
            </div>

            <div v-if="hasDifference(s)" class="diff-notice">
              ⚠️ Terdapat selisih fisik saat penutupan shift
            </div>
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
import { db } from '../db/database';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import type { Shift } from '../db/types';

const authStore = useAuthStore();
const activeShift = ref<Shift | null>(null);
const shifts = ref<Shift[]>([]);

onMounted(async () => {
  await loadData();
});

async function loadData() {
  if (authStore.currentUser) {
    const active = await db.shifts
      .where({ userId: authStore.currentUser.id, status: 'open' })
      .first();
    activeShift.value = active || null;
  }
  shifts.value = await db.shifts.orderBy('openedAt').reverse().toArray();
}

function hasDifference(s: Shift): boolean {
  if (!s.selisih) return false;
  return Object.values(s.selisih).some((v) => v !== 0);
}
</script>

<style scoped>
.shifts-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.btn-open, .btn-close {
  padding: 8px 14px;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.btn-open {
  background: var(--color-primary);
  color: #ffffff;
}

.btn-close {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.active-shift-card {
  background: var(--surface-card);
  border: 1px solid var(--color-primary);
  border-radius: var(--radius-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(5, 150, 105, 0.1);
}

.status-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
}

.dot-online {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-income);
}

.active-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.shift-detail-grid {
  display: flex;
  gap: 16px;
  font-size: 12px;
}

.s-detail {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.s-d-label {
  color: var(--text-secondary);
}

.s-d-val {
  font-weight: 700;
  color: var(--text-main);
}

.btn-tutup-full {
  margin-top: 4px;
  height: 44px;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  border-radius: var(--radius-btn);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  text-decoration: none;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 10px;
}

.shift-history-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.history-card {
  background: var(--surface-card);
  padding: 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.h-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.h-date {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.h-status-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: var(--radius-chip);
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
}

.h-body {
  display: flex;
  gap: 20px;
  font-size: 12px;
}

.h-col {
  display: flex;
  gap: 4px;
}

.h-label {
  color: var(--text-secondary);
}

.h-val {
  font-weight: 600;
  color: var(--text-main);
}

.diff-notice {
  font-size: 11px;
  color: var(--color-warning);
  font-weight: 600;
}
</style>
