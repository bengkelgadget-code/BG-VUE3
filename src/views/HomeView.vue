<template>
  <AppScaffold>
    <div class="home-container">
      <!-- Sapaan & Status Shift -->
      <div class="shift-banner">
        <div class="shift-info">
          <span class="greeting">Halo, {{ authStore.userName }}</span>
          <span class="shift-status-badge" :class="activeShift ? 'active' : 'inactive'">
            {{ activeShift ? 'Shift Aktif' : 'Shift Belum Dibuka' }}
          </span>
        </div>
        <router-link
          v-if="!activeShift && !authStore.isOwner"
          to="/shifts/open"
          class="btn-open-shift"
        >
          Buka Shift
        </router-link>
        <router-link
          v-else-if="activeShift && !authStore.isOwner"
          to="/shifts/close"
          class="btn-close-shift"
        >
          Tutup Shift
        </router-link>
      </div>

      <!-- Kartu Saldo Kas Hari Ini -->
      <div class="saldo-card">
        <div class="saldo-header">
          <span class="saldo-label">Total Saldo Kas (Catatan)</span>
          <span class="saldo-time">{{ currentWitaTime }}</span>
        </div>
        <div class="saldo-amount money-display">
          {{ formatRupiah(totalKas) }}
        </div>
        <div class="saldo-chips">
          <div class="chip chip-in">
            <span class="chip-label">Masuk:</span>
            <span class="chip-val money-display">{{ formatRupiah(totalMasuk) }}</span>
          </div>
          <div class="chip chip-out">
            <span class="chip-label">Keluar:</span>
            <span class="chip-val money-display">{{ formatRupiah(totalKeluar) }}</span>
          </div>
          <div class="chip chip-profit">
            <span class="chip-label">Laba:</span>
            <span class="chip-val money-display">{{ formatRupiah(totalLaba) }}</span>
          </div>
        </div>
      </div>

      <!-- Aksi Cepat (disembunyikan untuk Owner) -->
      <div v-if="!authStore.isOwner" class="quick-actions-section">
        <h3 class="section-title">Aksi Cepat</h3>
        <div class="quick-actions-grid">
          <router-link to="/transactions/add?type=transfer" class="quick-action-item">
            <div class="action-icon-box transfer">
              <ArrowRightLeft class="icon" />
            </div>
            <span class="action-label">Transfer</span>
          </router-link>

          <router-link to="/transactions/add?type=tarik_tunai" class="quick-action-item">
            <div class="action-icon-box tarik">
              <Banknote class="icon" />
            </div>
            <span class="action-label">Tarik Tunai</span>
          </router-link>

          <router-link to="/transactions/add?type=pulsa" class="quick-action-item">
            <div class="action-icon-box pulsa">
              <Smartphone class="icon" />
            </div>
            <span class="action-label">Pulsa</span>
          </router-link>

          <router-link to="/transactions/add?type=topup_ewallet" class="quick-action-item">
            <div class="action-icon-box ewallet">
              <Wallet class="icon" />
            </div>
            <span class="action-label">E-Wallet</span>
          </router-link>
        </div>
      </div>

      <!-- Aksi Transaksi Khusus Owner (b24) -->
      <div v-if="authStore.isOwner" class="owner-actions-section">
        <h3 class="section-title">Transaksi Owner</h3>
        <router-link
          to="/transactions/owner"
          class="owner-action-card"
          data-testid="btn-owner-transaction-home"
        >
          <div class="owner-card-content">
            <div class="action-icon-box owner-icon">
              <ArrowRightLeft class="icon" />
            </div>
            <div class="owner-text-col">
              <strong class="owner-card-title">Catat Transaksi Owner</strong>
              <span class="owner-card-desc">Pindah dana antar rekening, top-up provider/server, beli stok & belanja operasional</span>
            </div>
          </div>
          <span class="owner-arrow">Buka →</span>
        </router-link>
      </div>

      <!-- Strip Akun Saldo Catatan -->
      <div class="accounts-section">
        <div class="section-header">
          <h3 class="section-title">Saldo Akun (Catatan)</h3>
          <router-link to="/accounts" class="link-more">Lihat Semua</router-link>
        </div>
        <div v-if="accountList.length === 0" class="accounts-empty">
          <EmptyState
            title="Belum ada akun saldo"
            description="Tambahkan akun Kas, Bank, atau E-Wallet untuk mulai mencatat."
          >
            <template #action>
              <router-link v-if="authStore.isAdmin" to="/accounts/add" class="btn-sm-primary">
                + Tambah Akun
              </router-link>
            </template>
          </EmptyState>
        </div>
        <div v-else class="accounts-carousel">
          <div v-for="acc in accountList" :key="acc.id" class="account-card">
            <span class="acc-name">{{ acc.name }}</span>
            <span class="acc-balance money-display">{{ formatRupiah(accountBalances[acc.id] ?? 0) }}</span>
            <span class="acc-badge">{{ acc.type }} (catatan)</span>
          </div>
        </div>
      </div>

      <!-- Transaksi Terakhir -->
      <div class="recent-section">
        <div class="section-header">
          <h3 class="section-title">Transaksi Terakhir</h3>
          <router-link to="/transactions" class="link-more">Riwayat</router-link>
        </div>
        <EmptyState
          v-if="recentTransactions.length === 0"
          title="Belum ada transaksi"
          description="Shift ini belum ada transaksi tercatat. Ketuk tombol + untuk mencatat transaksi baru."
        >
          <template #action>
            <router-link
              v-if="!authStore.isOwner"
              to="/transactions/add"
              class="btn-sm-primary"
            >
              Catat Transaksi Pertama
            </router-link>
          </template>
        </EmptyState>
        <div v-else class="recent-tx-list">
          <div
            v-for="t in recentTransactions"
            :key="t.id"
            class="recent-tx-card"
            :data-testid="`recent-tx-${t.id}`"
            @click="router.push(`/transactions/${t.id}`)"
          >
            <div class="tx-left">
              <div class="tx-icon-box" :class="t.layanan">
                <span class="service-initial">{{ t.layanan.substring(0, 2).toUpperCase() }}</span>
              </div>
              <div class="tx-info">
                <span class="tx-service">{{ t.layanan.replace('_', ' ').toUpperCase() }}</span>
                <span class="tx-date">{{ formatTanggalWita(t.date, { hour: '2-digit', minute: '2-digit' }) }}</span>
              </div>
            </div>
            <div class="tx-right">
              <span class="tx-amount money-display">{{ formatRupiah(t.nominal) }}</span>
              <span v-if="t.status === 'void'" class="badge badge-void">BATAL</span>
              <span v-else-if="t.paymentStatus === 'hutang'" class="badge badge-debt">HUTANG</span>
              <span v-else class="badge badge-paid">LUNAS</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Modal Onboarding Ringkas 1 Layar (Bisa di-skip) -->
    <div v-if="showOnboarding" class="onboarding-overlay">
      <div class="onboarding-card">
        <div class="onboarding-header">
          <span class="app-badge">BUKU KONTER</span>
          <h2 class="onboarding-title">Panduan Cepat Aplikasi</h2>
          <p class="onboarding-subtitle">Pembukuan konter modern, cepat, dan local-first.</p>
        </div>

        <div class="onboarding-steps">
          <div class="step-item">
            <div class="step-num">1</div>
            <div class="step-text">
              <strong>Catat Transaksi Cepat</strong>
              <p>Mencatat transaksi pulsa, transfer, token, hingga voucher. Opsi bayar admin (Cash / Debit Rekening) terletak di samping nominal.</p>
            </div>
          </div>

          <div class="step-item">
            <div class="step-num">2</div>
            <div class="step-text">
              <strong>Master & Tarif Otomatis</strong>
              <p>Modal & harga jual disimpan di Master oleh Owner/Admin. Tarif admin terisi otomatis berdasarkan range nominal.</p>
            </div>
          </div>

          <div class="step-item">
            <div class="step-num">3</div>
            <div class="step-text">
              <strong>Shift & Serah Terima 2 PIN</strong>
              <p>Setiap giliran kerja diawali kas fisik, ditutup dengan hitung fisik, dan diserahterimakan aman dengan konfirmasi PIN ganda.</p>
            </div>
          </div>
        </div>

        <button class="btn-dismiss-onboarding" @click="dismissOnboarding">
          Mulai Menggunakan (Lewati)
        </button>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { ArrowRightLeft, Banknote, Smartphone, Wallet } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { db } from '../db/database';
import { accountService } from '../services/accountService';
import { reportService } from '../services/reportService';
import { compareAccounts } from '../utils/productSort';
import type { Account, Shift, Transaction } from '../db/types';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const activeShift = ref<Shift | null>(null);
const totalKas = ref(0);
const totalMasuk = ref(0);
const totalKeluar = ref(0);
const totalLaba = ref(0);
const accountList = ref<Account[]>([]);
const accountBalances = ref<Record<string, number>>({});
const recentTransactions = ref<Transaction[]>([]);
const currentWitaTime = ref(formatTanggalWita(Date.now(), { hour: '2-digit', minute: '2-digit' }));
const showOnboarding = ref(false);

function dismissOnboarding() {
  showOnboarding.value = false;
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('buku_konter_onboarding_shown', 'true');
  }
}

async function loadHomeData() {
  currentWitaTime.value = formatTanggalWita(Date.now(), { hour: '2-digit', minute: '2-digit' });

  // 1. Muat shift aktif
  if (authStore.currentUser) {
    let shift = await db.shifts
      .where({ userId: authStore.currentUser.id, status: 'open' })
      .first();
    if (!shift && authStore.isOwner) {
      shift = await db.shifts.where('status').equals('open').first();
    }
    activeShift.value = shift || null;
  } else {
    activeShift.value = null;
  }

  // 2. Muat akun saldo dan balances sebenarnya dari accountService.getAllBalances()
  const rawAccounts = await db.accounts.filter((a) => a.isActive).toArray();
  // (b24) Urutkan: Kas -> Bank -> E-Wallet -> Server Pulsa -> Provider App
  accountList.value = rawAccounts.sort(compareAccounts);

  const balances = await accountService.getAllBalances();
  accountBalances.value = balances;

  // Total saldo kas (catatan) = jumlah saldo SEMUA akun aktif
  totalKas.value = accountList.value.reduce((sum, a) => sum + (balances[a.id] ?? 0), 0);

  // 3. Masuk / Keluar / Laba shift aktif (bila shift belum dibuka, tetap Rp 0)
  if (activeShift.value) {
    const from = activeShift.value.openedAt;
    const to = activeShift.value.closedAt ?? Date.now();
    const sId = activeShift.value.id;
    totalMasuk.value = await reportService.totalIn(from, to, { shiftId: sId });
    totalKeluar.value = await reportService.totalOut(from, to, { shiftId: sId });
    totalLaba.value = await reportService.totalLaba(from, to, { shiftId: sId });
  } else {
    totalMasuk.value = 0;
    totalKeluar.value = 0;
    totalLaba.value = 0;
  }

  // 4. Transaksi Terakhir (maks 5, terbaru dulu)
  // Untuk Owner tampilkan lintas semua shift/petugas; untuk Kasir tampilkan shift aktif
  let txList = await db.transactions.orderBy('date').reverse().toArray();
  if (!authStore.isOwner && activeShift.value) {
    txList = txList.filter((t) => t.shiftId === activeShift.value!.id);
  }
  recentTransactions.value = txList.slice(0, 5);
}

onMounted(async () => {
  if (typeof localStorage !== 'undefined') {
    const shown = localStorage.getItem('buku_konter_onboarding_shown');
    if (!shown) {
      showOnboarding.value = true;
    }
  }
  await loadHomeData();
});

// Refresh data setiap kali kembali ke halaman Home
watch(
  () => route.path,
  async (newPath) => {
    if (newPath === '/' || newPath === '/home') {
      await loadHomeData();
    }
  }
);
</script>

<style scoped>
.home-container {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.shift-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-card);
  padding: 12px 16px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
}

.shift-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.greeting {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.shift-status-badge {
  font-size: 11px;
  font-weight: 600;
}

.shift-status-badge.active {
  color: var(--color-income);
}

.shift-status-badge.inactive {
  color: var(--color-warning);
}

.btn-open-shift, .btn-close-shift {
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  border-radius: var(--radius-chip);
  text-decoration: none;
}

.btn-open-shift {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.btn-close-shift {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.saldo-card {
  background: var(--gradient-saldo);
  color: var(--color-white);
  padding: 20px 18px;
  border-radius: var(--radius-card);
  box-shadow: 0 8px 24px rgba(5, 150, 105, 0.25);
}

.saldo-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.saldo-label {
  font-size: 12px;
  font-weight: 600;
  opacity: 0.9;
}

.saldo-time {
  font-size: 11px;
  opacity: 0.75;
}

.saldo-amount {
  font-size: 32px;
  font-weight: 800;
  letter-spacing: -0.02em;
  margin-bottom: 16px;
}

.saldo-chips {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.chip {
  background: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  font-size: 11px;
  display: flex;
  gap: 4px;
}

.chip-label {
  opacity: 0.85;
}

.chip-val {
  font-weight: 700;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.link-more {
  font-size: 12px;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
}

.quick-actions-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.quick-action-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: var(--text-main);
}

.action-icon-box {
  width: 52px;
  height: 52px;
  border-radius: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  color: var(--color-primary);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}

.action-icon-box.transfer { color: var(--color-info); }
.action-icon-box.tarik { color: var(--color-income); }
.action-icon-box.pulsa { color: var(--color-amber); }
.action-icon-box.ewallet { color: var(--color-purple); }

.action-icon-box .icon {
  width: 24px;
  height: 24px;
}

.action-label {
  font-size: 11px;
  font-weight: 600;
}

.accounts-carousel {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.account-card {
  min-width: 150px;
  background: var(--surface-card);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.acc-name {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.acc-balance {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
}

.acc-badge {
  font-size: 10px;
  color: var(--text-muted);
}

.btn-sm-primary {
  display: inline-block;
  padding: 8px 16px;
  font-size: 12px;
  font-weight: 700;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-btn);
  text-decoration: none;
}

/* Transaksi Owner Section & Card (b24) */
.owner-actions-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.owner-action-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  text-decoration: none;
  color: var(--text-main);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  transition: border-color var(--transition-fast);
}

.owner-action-card:hover {
  border-color: var(--color-primary);
}

.owner-card-content {
  display: flex;
  align-items: center;
  gap: 12px;
}

.action-icon-box.owner-icon {
  background: rgba(14, 165, 233, 0.1);
  color: #0284c7;
  border-color: rgba(14, 165, 233, 0.2);
}

.owner-text-col {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.owner-card-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.owner-card-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.owner-arrow {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  white-space: nowrap;
}

/* Transaksi Terakhir List & Card (b24) */
.recent-tx-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.recent-tx-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  padding: 12px 14px;
  cursor: pointer;
  transition: border-color var(--transition-fast);
}

.recent-tx-card:hover {
  border-color: var(--color-primary);
}

.tx-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.tx-icon-box {
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  background: var(--surface-input);
  color: var(--text-main);
  border: 1px solid var(--border-color);
}

.tx-icon-box.transfer { background: rgba(59, 130, 246, 0.1); color: #2563eb; }
.tx-icon-box.tarik_tunai { background: rgba(16, 185, 129, 0.1); color: #059669; }
.tx-icon-box.pulsa { background: rgba(245, 158, 11, 0.1); color: #d97706; }
.tx-icon-box.topup_ewallet { background: rgba(139, 92, 246, 0.1); color: #7c3aed; }
.tx-icon-box.pindah_dana { background: rgba(14, 165, 233, 0.1); color: #0284c7; }
.tx-icon-box.deposit_server, .tx-icon-box.deposit_provider { background: rgba(99, 102, 241, 0.1); color: #4f46e5; }
.tx-icon-box.pembelian_stok { background: rgba(236, 72, 153, 0.1); color: #db2777; }
.tx-icon-box.operasional { background: rgba(239, 68, 68, 0.1); color: #dc2626; }

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
  color: var(--text-muted);
}

.tx-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.tx-amount {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
}

.badge-paid { background: #ecfdf5; color: #059669; }
.badge-debt { background: #fef2f2; color: #dc2626; }
.badge-void { background: #f3f4f6; color: #6b7280; text-decoration: line-through; }

.onboarding-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}
.onboarding-card {
  background: var(--bg-card);
  border-radius: var(--radius-card);
  max-width: 420px;
  width: 100%;
  padding: 24px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.app-badge {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: var(--primary);
  background: rgba(37, 99, 235, 0.1);
  padding: 3px 8px;
  border-radius: 4px;
}
.onboarding-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin-top: 6px;
}
.onboarding-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}
.onboarding-steps {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.step-item {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.step-num {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  flex-shrink: 0;
}
.step-text strong {
  font-size: 13px;
  color: var(--text-main);
  display: block;
}
.step-text p {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
  line-height: 1.4;
}
.btn-dismiss-onboarding {
  margin-top: 6px;
  width: 100%;
  padding: 12px;
  border-radius: var(--radius-btn);
  border: none;
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.btn-dismiss-onboarding:hover {
  opacity: 0.9;
}
</style>
