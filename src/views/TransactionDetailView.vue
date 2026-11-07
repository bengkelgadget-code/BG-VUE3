<template>
  <AppScaffold>
    <div v-if="!transaction" class="loading-state">
      <p>Memuat detail transaksi...</p>
    </div>

    <div v-else class="detail-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <span class="status-badge" :class="transaction.status">
          {{ transaction.status === 'void' ? 'BATAL (VOID)' : transaction.paymentStatus.toUpperCase() }}
        </span>
      </div>

      <!-- Kartu Ringkasan Atas -->
      <div class="summary-card" :class="{ 'card-void': transaction.status === 'void' }">
        <span class="tx-service-badge">{{ transaction.layanan.replace('_', ' ').toUpperCase() }}</span>
        <div class="amount-title money-display">{{ formatRupiah(transaction.nominal) }}</div>
        <span class="tx-date-full">{{ formatTanggalWita(transaction.date) }}</span>

        <div v-if="transaction.fee > 0" class="fee-info">
          Biaya Admin: {{ formatRupiah(transaction.fee) }} ({{ transaction.feePaidBy === 'debit_rekening' ? 'Debit Rekening' : 'Cash' }})
        </div>
      </div>

      <!-- Informasi Alasan Void Bila Status Void -->
      <div v-if="transaction.status === 'void'" class="void-notice">
        <strong>Transaksi Dibatalkan</strong>
        <p>Alasan: "{{ transaction.voidReason }}"</p>
        <span class="void-meta">Dibatalkan pada {{ formatTanggalWita(transaction.voidAt || transaction.updatedAt) }}</span>
      </div>

      <!-- Rincian Parameter -->
      <div class="detail-card">
        <h3 class="card-section-title">Informasi Detail</h3>

        <div class="detail-row">
          <span class="d-label">ID Transaksi</span>
          <span class="d-val text-mono">{{ transaction.id.substring(0, 13) }}...</span>
        </div>

        <div v-if="transaction.referenceNo" class="detail-row">
          <span class="d-label">No. Referensi / Rekening</span>
          <span class="d-val">{{ transaction.referenceNo }}</span>
        </div>

        <div v-if="customerName" class="detail-row">
          <span class="d-label">Pelanggan</span>
          <span class="d-val text-bold">{{ customerName }}</span>
        </div>

        <div v-if="sourceAccountName" class="detail-row">
          <span class="d-label">Sumber Dana</span>
          <span class="d-val">{{ sourceAccountName }}</span>
        </div>

        <div v-if="paymentAccountName" class="detail-row">
          <span class="d-label">Diterima Di</span>
          <span class="d-val">{{ paymentAccountName }}</span>
        </div>

        <div class="detail-row">
          <span class="d-label">Petugas Kasir</span>
          <span class="d-val">{{ kasirName }}</span>
        </div>

        <div v-if="transaction.note" class="detail-row">
          <span class="d-label">Catatan</span>
          <span class="d-val">{{ transaction.note }}</span>
        </div>
      </div>

      <!-- Rincian Produk & Modal (KHUSUS OWNER/ADMIN - KASIR TIDAK BOLEH LIHAT MODAL) -->
      <div v-if="items.length > 0" class="detail-card">
        <h3 class="card-section-title">Rincian Item & Snapshot</h3>
        <div v-for="item in items" :key="item.id" class="item-row">
          <div class="item-header">
            <span class="item-name">{{ item.productNameSnapshot }}</span>
            <span class="item-qty">{{ item.qty }} pcs</span>
          </div>
          <div class="item-pricing">
            <span>Harga Jual: {{ formatRupiah(item.hargaJualSnapshot) }}</span>
            <!-- MODAL HANYA DITAMPILKAN UNTUK OWNER / ADMIN -->
            <span v-if="authStore.isAdmin" class="modal-val">
              Modal: {{ formatRupiah(item.modalSnapshot) }} (Laba: {{ formatRupiah(item.hargaJualSnapshot - item.modalSnapshot) }})
            </span>
          </div>
        </div>
      </div>

      <!-- Tombol Batalkan Transaksi (Void) -->
      <div v-if="transaction.status !== 'void'" class="void-section">
        <div v-if="!showVoidDialog">
          <button class="btn-void-trigger" @click="showVoidDialog = true">
            Batalkan Transaksi (Void)
          </button>
        </div>

        <!-- Form Konfirmasi Void -->
        <div v-else class="void-box">
          <h4 class="void-title">Konfirmasi Pembatalan Transaksi</h4>
          <p class="void-desc">
            Transaksi tidak dihapus permanen. Saldo catatan dan stok akan dikembalikan secara otomatis.
          </p>

          <div class="form-group">
            <label class="form-label">Alasan Pembatalan (Wajib)</label>
            <input
              v-model="voidReason"
              type="text"
              class="form-input"
              placeholder="Contoh: Salah input nomor rekening"
              required
            />
          </div>

          <div v-if="voidError" class="void-error">
            {{ voidError }}
          </div>

          <div class="void-actions">
            <button class="btn-cancel" @click="showVoidDialog = false">Batal</button>
            <button
              class="btn-confirm-void"
              :disabled="isVoiding || !voidReason.trim()"
              @click="handleVoid"
            >
              {{ isVoiding ? 'Membatalkan...' : 'Ya, Batalkan Transaksi' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { db } from '../db/database';
import { transactionService } from '../services/transactionService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import type { Transaction, TransactionItem } from '../db/types';
import { AppError } from '../core/errors';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const transaction = ref<Transaction | null>(null);
const items = ref<TransactionItem[]>([]);
const sourceAccountName = ref<string>('');
const paymentAccountName = ref<string>('');
const customerName = ref<string>('');
const kasirName = ref<string>('');

const showVoidDialog = ref<boolean>(false);
const voidReason = ref<string>('');
const voidError = ref<string>('');
const isVoiding = ref<boolean>(false);

onMounted(async () => {
  const id = route.params['id'] as string;
  if (!id) return;

  const tx = await transactionService.getTransaction(id);
  if (!tx) {
    router.replace('/transactions');
    return;
  }

  transaction.value = tx;
  items.value = await transactionService.getItems(id);

  if (tx.sourceAccountId) {
    const acc = await db.accounts.get(tx.sourceAccountId);
    sourceAccountName.value = acc?.name || '';
  }

  if (tx.accountId) {
    const acc = await db.accounts.get(tx.accountId);
    paymentAccountName.value = acc?.name || '';
  }

  if (tx.customerId) {
    const cust = await db.customers.get(tx.customerId);
    customerName.value = cust?.name || '';
  }

  const user = await db.users.get(tx.userId);
  kasirName.value = user?.name || tx.userId;
});

async function handleVoid() {
  if (!transaction.value) return;
  voidError.value = '';

  if (!voidReason.value.trim() || voidReason.value.trim().length < 3) {
    voidError.value = 'Alasan pembatalan minimal 3 karakter.';
    return;
  }

  isVoiding.value = true;
  try {
    await transactionService.voidTransaction(transaction.value.id, {
      reason: voidReason.value.trim(),
      actorUserId: authStore.currentUser?.id || 'system',
    });

    // Refresh data
    transaction.value = (await transactionService.getTransaction(transaction.value.id)) || null;
    showVoidDialog.value = false;
  } catch (err: unknown) {
    if (err instanceof AppError) {
      voidError.value = err.message;
    } else {
      voidError.value = 'Gagal membatalkan transaksi.';
    }
  } finally {
    isVoiding.value = false;
  }
}
</script>

<style scoped>
.detail-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.btn-back {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  cursor: pointer;
}

.status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-chip);
}

.status-badge.ok {
  background: var(--color-income-subtle);
  color: var(--color-income);
}

.status-badge.void {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.summary-card {
  background: var(--gradient-saldo);
  color: #ffffff;
  padding: 20px 16px;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 6px;
}

.summary-card.card-void {
  background: #6B7280;
}

.tx-service-badge {
  font-size: 11px;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.2);
  padding: 3px 10px;
  border-radius: var(--radius-chip);
}

.amount-title {
  font-size: 28px;
  font-weight: 800;
}

.tx-date-full {
  font-size: 12px;
  opacity: 0.85;
}

.fee-info {
  margin-top: 6px;
  font-size: 12px;
  background: rgba(255, 255, 255, 0.15);
  padding: 4px 12px;
  border-radius: var(--radius-chip);
}

.void-notice {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 12px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  border: 1px solid var(--color-danger);
}

.void-meta {
  font-size: 11px;
  display: block;
  margin-top: 4px;
  opacity: 0.85;
}

.detail-card {
  background: var(--surface-card);
  padding: 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.card-section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 4px;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
}

.detail-row:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.d-label {
  color: var(--text-secondary);
}

.d-val {
  font-weight: 600;
  color: var(--text-main);
}

.text-mono {
  font-family: monospace;
  font-size: 11px;
}

.text-bold {
  font-weight: 700;
}

.item-row {
  padding: 8px 0;
  border-bottom: 1px solid var(--border-color);
}

.item-header {
  display: flex;
  justify-content: space-between;
  font-weight: 700;
  font-size: 13px;
}

.item-pricing {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--text-secondary);
  margin-top: 4px;
}

.modal-val {
  color: var(--color-primary-dark);
  font-weight: 600;
}

.void-section {
  margin-top: 10px;
}

.btn-void-trigger {
  width: 100%;
  height: 48px;
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-btn);
  background: transparent;
  color: var(--color-danger);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.void-box {
  background: var(--surface-card);
  border: 1px solid var(--color-danger);
  padding: 16px;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.void-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-danger);
}

.void-desc {
  font-size: 12px;
  color: var(--text-secondary);
}

.form-input {
  height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}

.void-error {
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
}

.void-actions {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.btn-cancel {
  flex: 1;
  height: 44px;
  border: 1px solid var(--border-color);
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  font-weight: 600;
  cursor: pointer;
}

.btn-confirm-void {
  flex: 2;
  height: 44px;
  border: none;
  background: var(--color-danger);
  color: #ffffff;
  border-radius: var(--radius-btn);
  font-weight: 700;
  cursor: pointer;
}
</style>
