<template>
  <AppScaffold>
    <div class="view-header">
      <button class="btn-back" @click="router.back()">← Kembali</button>
      <h2 class="page-title">Jejak Audit Aktivitas</h2>
    </div>

    <!-- Filter Actions -->
    <div class="filter-bar">
      <select v-model="selectedAction" class="filter-select">
        <option value="">Semua Aksi</option>
        <option value="koreksi_saldo">Koreksi Saldo</option>
        <option value="void_transaksi">Void Transaksi</option>
        <option value="opname">Opname Stok</option>
        <option value="handover">Serah Terima Shift</option>
        <option value="ubah_pin">Ubah PIN</option>
        <option value="login">Login Petugas</option>
      </select>
    </div>

    <!-- Loading & Empty States -->
    <div v-if="isLoading" class="loading-state">
      <p>Memuat riwayat audit...</p>
    </div>

    <div v-else-if="filteredLogs.length === 0" class="empty-state">
      <p>Belum ada riwayat aktivitas tercatat.</p>
    </div>

    <div v-else class="logs-list">
      <div v-for="log in filteredLogs" :key="log.id" class="log-card">
        <div class="log-header">
          <span class="action-badge" :class="log.action">{{ formatAction(log.action) }}</span>
          <span class="log-time">{{ formatTanggalWita(log.createdAt) }}</span>
        </div>

        <div class="log-body">
          <div class="log-row">
            <span class="log-label">Petugas:</span>
            <span class="log-val font-semibold">{{ getUserName(log.actorUserId) }}</span>
          </div>
          <div class="log-row">
            <span class="log-label">Objek:</span>
            <span class="log-val">{{ log.entityType }} ({{ log.entityId.substring(0, 10) }}...)</span>
          </div>
          <div v-if="log.detail" class="log-detail-box">
            <code>{{ formatDetail(log.detail) }}</code>
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
import { db } from '../db/database';
import type { AuditLog, User } from '../db/types';
import { formatTanggalWita } from '../utils/format';

const router = useRouter();
const logs = ref<AuditLog[]>([]);
const users = ref<User[]>([]);
const selectedAction = ref<string>('');
const isLoading = ref<boolean>(true);

const filteredLogs = computed(() => {
  if (!selectedAction.value) return logs.value;
  return logs.value.filter((l) => l.action === selectedAction.value);
});

function formatAction(action: string): string {
  const map: Record<string, string> = {
    koreksi_saldo: 'KOREKSI SALDO',
    void_transaksi: 'BATALKAN (VOID)',
    opname: 'OPNAME STOK',
    handover: 'SERAH TERIMA',
    ubah_pin: 'UBAH PIN',
    login: 'LOGIN',
    tambah_transaksi: 'TRANSAKSI BARU',
    setup_owner: 'SETUP AWAL OWNER',
  };
  return map[action] || action.toUpperCase();
}

function getUserName(userId: string): string {
  const u = users.value.find((x) => x.id === userId);
  return u ? `${u.name} (${u.role.toUpperCase()})` : userId;
}

function formatDetail(detail: string): string {
  try {
    const parsed = JSON.parse(detail);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return detail;
  }
}

async function loadLogs() {
  isLoading.value = true;
  try {
    users.value = await db.users.toArray();
    const all = await db.auditLogs.toArray();
    all.sort((a, b) => b.createdAt - a.createdAt);
    logs.value = all;
  } finally {
    isLoading.value = false;
  }
}

onMounted(() => {
  loadLogs();
});
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.btn-back {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  padding: 0;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.filter-bar {
  margin-bottom: 16px;
}
.filter-select {
  width: 100%;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-card);
  color: var(--text-main);
  font-size: 13px;
}

.logs-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.log-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px;
}
.log-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.action-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
}
.action-badge.koreksi_saldo,
.action-badge.void_transaksi {
  background: #FEE2E2;
  color: #B91C1C;
}
.action-badge.opname,
.action-badge.handover {
  background: #FEF3C7;
  color: #92400E;
}
.log-time {
  font-size: 11px;
  color: var(--text-muted);
}

.log-body {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 12px;
}
.log-row {
  display: flex;
  gap: 6px;
}
.log-label {
  color: var(--text-muted);
  width: 60px;
}
.log-val {
  color: var(--text-main);
}
.font-semibold {
  font-weight: 600;
}
.log-detail-box {
  margin-top: 8px;
  padding: 8px;
  background: var(--bg-canvas);
  border-radius: 6px;
  font-size: 11px;
  color: var(--text-muted);
  overflow-x: auto;
}
</style>
