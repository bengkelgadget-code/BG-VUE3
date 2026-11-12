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

      <!-- Notifikasi Sukses -->
      <div v-if="successNotice" class="success-banner" data-testid="success-notice">
        {{ successNotice }}
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

        <div v-if="transaction.dateChangeReason" class="detail-row">
          <span class="d-label">Alasan Koreksi Tanggal</span>
          <span class="d-val text-warning">{{ transaction.dateChangeReason }}</span>
        </div>

        <div v-if="transaction.note" class="detail-row">
          <span class="d-label">Catatan</span>
          <span class="d-val">{{ transaction.note }}</span>
        </div>
      </div>

      <!-- Rincian Item Keranjang Bila Ada -->
      <div v-if="items.length > 0" class="detail-card">
        <h3 class="card-section-title">Rincian Barang ({{ items.length }})</h3>
        <div class="items-list">
          <div v-for="item in items" :key="item.id" class="item-row">
            <div class="item-main">
              <span class="item-name">{{ item.productNameSnapshot }}</span>
              <span class="item-qty">{{ item.qty }}x @ {{ formatRupiah(item.hargaJualSnapshot) }}</span>
            </div>
            <span class="item-subtotal money-display">{{ formatRupiah(item.subtotal) }}</span>
            <span v-if="authStore.isAdmin" class="item-modal-info">
              Modal: {{ formatRupiah(item.modalSnapshot) }} (Laba: {{ formatRupiah(item.hargaJualSnapshot - item.modalSnapshot) }})
            </span>
          </div>
        </div>
      </div>

      <!-- SEKSI AKSI KOREKSI / VOID (HANYA UNTUK TRANSAKSI AKTIF / BUKAN VOID) -->
      <div v-if="transaction.status !== 'void'" class="actions-section">
        <!-- 1. JALUR KASIR: Butuh persetujuan Owner terlebih dahulu -->
        <div v-if="authStore.isKasir && !isOwnerApproved" class="kasir-approval-wrapper">
          <div v-if="!showApprovalPrompt">
            <button
              class="btn-correction-request"
              data-testid="btn-request-owner-approval"
              @click="openApprovalPrompt"
            >
              Minta Koreksi ke Owner
            </button>
          </div>

          <div v-else class="approval-box" data-testid="approval-box">
            <h4 class="approval-title">Persetujuan Owner Diperlukan</h4>
            <p class="approval-desc">
              Perubahan atau pembatalan transaksi oleh Kasir memerlukan persetujuan Owner. Minta Owner memasukkan PIN di bawah ini.
            </p>

            <div class="form-group">
              <label class="form-label">PIN Owner (Wajib)</label>
              <input
                v-model="ownerPinInput"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="Masukkan PIN Owner"
                data-testid="input-owner-pin"
                required
              />
            </div>

            <div v-if="approvalError" class="approval-error" data-testid="approval-error">
              {{ approvalError }}
            </div>

            <div class="approval-actions">
              <button type="button" class="btn-cancel" @click="closeApprovalPrompt">
                Batal
              </button>
              <button
                type="button"
                class="btn-confirm-approval"
                :disabled="isVerifyingApproval || !ownerPinInput.trim()"
                data-testid="btn-verify-owner-pin"
                @click="verifyOwnerApproval"
              >
                {{ isVerifyingApproval ? 'Memverifikasi...' : 'Beri Persetujuan' }}
              </button>
            </div>
          </div>
        </div>

        <!-- 2. JALUR OWNER / ADMIN / KEPALA KASIR ATAU KASIR YANG SUDAH DISETUJUI OWNER -->
        <div v-if="canManageTransaction || isOwnerApproved" class="management-section">
          <!-- Badge indikator persetujuan Owner untuk Kasir -->
          <div v-if="isOwnerApproved" class="owner-approved-badge" data-testid="owner-approved-badge">
            ✓ Persetujuan Owner aktif untuk 1x tindakan pada transaksi ini
          </div>

          <!-- Tombol Aksi Utama: Edit & Void -->
          <div v-if="!showEditDialog && !showVoidDialog" class="action-buttons-row">
            <button
              class="btn-edit-trigger"
              data-testid="btn-edit-transaction"
              @click="openEditDialog"
            >
              Edit Transaksi
            </button>

            <button
              class="btn-void-trigger"
              data-testid="btn-void-transaction"
              @click="openVoidDialog"
            >
              Batalkan Transaksi (Void)
            </button>
          </div>

          <!-- FORM EDIT TRANSAKSI -->
          <div v-if="showEditDialog" class="edit-box" data-testid="edit-dialog">
            <h4 class="edit-title">Edit / Koreksi Transaksi</h4>
            <p class="edit-desc">
              Perbaiki nominal, biaya admin, nama pelanggan, atau catatan. Mutasi saldo dan stok akan disesuaikan otomatis.
            </p>

            <div class="form-group">
              <label class="form-label">Nominal (Rp)</label>
              <input
                v-model.number="editForm.nominal"
                type="number"
                min="1"
                class="form-input tabular-nums"
                data-testid="edit-input-nominal"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Biaya Admin (Rp)</label>
              <input
                v-model.number="editForm.fee"
                type="number"
                min="0"
                class="form-input tabular-nums"
                data-testid="edit-input-fee"
                required
              />
            </div>

            <div v-if="customerName || transaction.customerId" class="form-group">
              <label class="form-label">Nama Pelanggan</label>
              <input
                v-model="editForm.customerName"
                type="text"
                class="form-input"
                placeholder="Nama pelanggan"
                data-testid="edit-input-customer"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Catatan</label>
              <input
                v-model="editForm.note"
                type="text"
                class="form-input"
                placeholder="Catatan transaksi"
                data-testid="edit-input-note"
              />
            </div>

            <div v-if="editError" class="edit-error" data-testid="edit-error">
              {{ editError }}
            </div>

            <div class="edit-actions">
              <button type="button" class="btn-cancel" @click="closeEditDialog">
                Batal
              </button>
              <button
                type="button"
                class="btn-confirm-edit"
                :disabled="isEditing || editForm.nominal <= 0 || editForm.fee < 0"
                data-testid="btn-submit-edit"
                @click="handleEdit"
              >
                {{ isEditing ? 'Menyimpan...' : 'Simpan Perubahan' }}
              </button>
            </div>
          </div>

          <!-- FORM KONFIRMASI VOID -->
          <div v-if="showVoidDialog" class="void-box" data-testid="void-dialog">
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
                data-testid="void-input-reason"
                required
              />
            </div>

            <!-- PIN konfirmasi pengguna bila bukan approval owner otomatis -->
            <div v-if="!authStore.isKasir" class="form-group">
              <label class="form-label">PIN Konfirmasi (Wajib)</label>
              <input
                v-model="confirmPin"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="Masukkan PIN Anda"
                data-testid="void-input-pin"
                required
              />
            </div>

            <div v-if="voidError" class="void-error" data-testid="void-error">
              {{ voidError }}
            </div>

            <div class="void-actions">
              <button type="button" class="btn-cancel" @click="closeVoidDialog">
                Batal
              </button>
              <button
                type="button"
                class="btn-confirm-void"
                :disabled="isVoiding || !voidReason.trim() || (!authStore.isKasir && !confirmPin.trim())"
                data-testid="btn-confirm-void"
                @click="handleVoid"
              >
                {{ isVoiding ? 'Membatalkan...' : 'Ya, Batalkan Transaksi' }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { db } from '../db/database';
import { transactionService } from '../services/transactionService';
import { authService } from '../services/authService';
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
const successNotice = ref<string>('');

// Matriks Hak Akses
const canManageTransaction = computed(() => {
  return authStore.canEditTransaction;
});

// Approval State untuk Kasir
const showApprovalPrompt = ref<boolean>(false);
const ownerPinInput = ref<string>('');
const approvalError = ref<string>('');
const isVerifyingApproval = ref<boolean>(false);
const isOwnerApproved = ref<boolean>(false);
const approvedOwnerPin = ref<string>('');

// Dialog Edit State
const showEditDialog = ref<boolean>(false);
const editForm = ref({
  nominal: 0,
  fee: 0,
  customerName: '',
  note: '',
});
const editError = ref<string>('');
const isEditing = ref<boolean>(false);

// Dialog Void State
const showVoidDialog = ref<boolean>(false);
const voidReason = ref<string>('');
const confirmPin = ref<string>('');
const voidError = ref<string>('');
const isVoiding = ref<boolean>(false);

function openApprovalPrompt() {
  ownerPinInput.value = '';
  approvalError.value = '';
  showApprovalPrompt.value = true;
}

function closeApprovalPrompt() {
  showApprovalPrompt.value = false;
  ownerPinInput.value = '';
  approvalError.value = '';
}

async function verifyOwnerApproval() {
  approvalError.value = '';
  const trimmed = ownerPinInput.value.trim();
  if (!trimmed) {
    approvalError.value = 'PIN Owner wajib diisi.';
    return;
  }
  isVerifyingApproval.value = true;
  try {
    const owner = await db.users.where('role').equals('owner').first();
    if (!owner) {
      approvalError.value = 'Akun Owner tidak ditemukan di sistem.';
      return;
    }
    const isValid = await authService.verifyPin(owner.id, trimmed);
    if (!isValid) {
      approvalError.value = 'PIN Owner salah. Koreksi transaksi ditolak.';
      return;
    }
    isOwnerApproved.value = true;
    approvedOwnerPin.value = trimmed;
    showApprovalPrompt.value = false;
    ownerPinInput.value = '';
  } catch (err: unknown) {
    approvalError.value = err instanceof Error ? err.message : 'Gagal memverifikasi PIN Owner.';
  } finally {
    isVerifyingApproval.value = false;
  }
}

function openEditDialog() {
  if (!transaction.value) return;
  editForm.value = {
    nominal: transaction.value.nominal,
    fee: transaction.value.fee,
    customerName: customerName.value,
    note: transaction.value.note || '',
  };
  editError.value = '';
  showVoidDialog.value = false;
  showEditDialog.value = true;
}

function closeEditDialog() {
  showEditDialog.value = false;
  editError.value = '';
}

function openVoidDialog() {
  voidReason.value = '';
  confirmPin.value = '';
  voidError.value = '';
  showEditDialog.value = false;
  showVoidDialog.value = true;
}

function closeVoidDialog() {
  showVoidDialog.value = false;
  confirmPin.value = '';
  voidError.value = '';
}

async function reloadData() {
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
  } else {
    sourceAccountName.value = '';
  }

  if (tx.accountId) {
    const acc = await db.accounts.get(tx.accountId);
    paymentAccountName.value = acc?.name || '';
  } else {
    paymentAccountName.value = '';
  }

  if (tx.customerId) {
    const cust = await db.customers.get(tx.customerId);
    customerName.value = cust?.name || '';
  } else {
    customerName.value = '';
  }

  const user = await db.users.get(tx.userId);
  kasirName.value = user?.name || tx.userId;
}

onMounted(async () => {
  await reloadData();
});

async function handleEdit() {
  if (!transaction.value) return;
  editError.value = '';

  if (editForm.value.nominal <= 0) {
    editError.value = 'Nominal harus lebih dari 0.';
    return;
  }
  if (editForm.value.fee < 0) {
    editError.value = 'Biaya admin tidak boleh negatif.';
    return;
  }

  isEditing.value = true;
  try {
    await transactionService.editTransaction(
      transaction.value.id,
      {
        nominal: editForm.value.nominal,
        fee: editForm.value.fee,
        note: editForm.value.note,
        customerName: editForm.value.customerName,
      },
      {
        actorUserId: authStore.currentUser?.id || '',
        ownerPin: isOwnerApproved.value ? approvedOwnerPin.value : undefined,
      }
    );

    successNotice.value = 'Transaksi berhasil diperbarui.';
    showEditDialog.value = false;
    isOwnerApproved.value = false;
    approvedOwnerPin.value = '';
    await reloadData();
    setTimeout(() => {
      successNotice.value = '';
    }, 4000);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      editError.value = err.message;
    } else {
      editError.value = 'Gagal mengedit transaksi.';
    }
  } finally {
    isEditing.value = false;
  }
}

async function handleVoid() {
  if (!transaction.value) return;
  voidError.value = '';

  if (!voidReason.value.trim() || voidReason.value.trim().length < 3) {
    voidError.value = 'Alasan pembatalan minimal 3 karakter.';
    return;
  }

  if (!authStore.isKasir && !confirmPin.value.trim()) {
    voidError.value = 'PIN konfirmasi wajib diisi.';
    return;
  }

  isVoiding.value = true;
  try {
    await transactionService.voidTransaction(transaction.value.id, {
      reason: voidReason.value.trim(),
      actorUserId: authStore.currentUser?.id || '',
      pin: !authStore.isKasir ? confirmPin.value.trim() : undefined,
      ownerPin: isOwnerApproved.value ? approvedOwnerPin.value : undefined,
    });

    successNotice.value = 'Transaksi berhasil dibatalkan (void). Saldo dan stok telah dikembalikan.';
    showVoidDialog.value = false;
    isOwnerApproved.value = false;
    approvedOwnerPin.value = '';
    confirmPin.value = '';
    voidReason.value = '';
    await reloadData();
    setTimeout(() => {
      successNotice.value = '';
    }, 4000);
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
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
}

.status-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: var(--radius-chip);
}
.status-badge.lunas {
  background: var(--color-income-subtle);
  color: var(--color-income);
}
.status-badge.hutang {
  background: var(--color-expense-subtle);
  color: var(--color-expense);
}
.status-badge.void {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.summary-card {
  background: var(--surface-card);
  border-radius: var(--radius-card);
  padding: 20px;
  text-align: center;
  border: 1px solid var(--border-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
}
.summary-card.card-void {
  border-color: var(--color-danger);
  background: #fef2f2;
}

.success-banner {
  background: var(--color-income-subtle);
  border: 1px solid var(--color-income);
  color: var(--color-income);
  padding: 12px 16px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
  text-align: center;
}

.tx-service-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-primary);
  letter-spacing: 0.5px;
}

.amount-title {
  font-size: 32px;
  font-weight: 800;
  color: var(--text-main);
  margin: 6px 0;
}

.tx-date-full {
  font-size: 13px;
  color: var(--text-secondary);
}

.fee-info {
  margin-top: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.void-notice {
  background: var(--color-danger-subtle);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-btn);
  padding: 12px 14px;
  font-size: 13px;
  color: var(--color-danger);
}
.void-notice strong {
  display: block;
  font-size: 14px;
  margin-bottom: 2px;
}
.void-notice p {
  margin: 2px 0 6px 0;
}
.void-meta {
  font-size: 11px;
  opacity: 0.8;
}

.detail-card {
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.card-section-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 8px;
  margin: 0;
}

.detail-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
}

.d-label {
  color: var(--text-secondary);
}

.d-val {
  color: var(--text-main);
  font-weight: 600;
}
.d-val.text-mono {
  font-family: monospace;
}
.d-val.text-bold {
  font-weight: 700;
}
.d-val.text-warning {
  color: #d97706;
}

.items-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.item-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px dashed var(--border-color);
}
.item-row:last-child {
  border-bottom: none;
}

.item-main {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.item-name {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.item-qty {
  font-size: 12px;
  color: var(--text-secondary);
}

.item-subtotal {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.item-modal-info {
  width: 100%;
  font-size: 11px;
  color: var(--color-income);
  margin-top: 4px;
}

/* ACTIONS SECTION */
.actions-section {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 8px;
}

.btn-correction-request {
  width: 100%;
  padding: 14px;
  background: rgba(245, 158, 11, 0.12);
  color: #b45309;
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: var(--radius-btn);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}
.btn-correction-request:hover {
  background: rgba(245, 158, 11, 0.2);
}

.owner-approved-badge {
  background: var(--color-income-subtle);
  border: 1px solid var(--color-income);
  color: var(--color-income);
  padding: 8px 12px;
  border-radius: var(--radius-btn);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
  margin-bottom: 8px;
}

.action-buttons-row {
  display: flex;
  gap: 12px;
}

.btn-edit-trigger {
  flex: 1;
  padding: 12px;
  background: var(--color-primary);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-btn);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.btn-edit-trigger:hover {
  opacity: 0.9;
}

.btn-void-trigger {
  flex: 1;
  padding: 12px;
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
  border-radius: var(--radius-btn);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}
.btn-void-trigger:hover {
  background: var(--color-danger);
  color: #ffffff;
}

.approval-box,
.edit-box,
.void-box {
  background: var(--surface-card);
  padding: 16px;
  border-radius: var(--radius-card);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.approval-box {
  border: 1px solid #f59e0b;
}

.edit-box {
  border: 1px solid var(--color-primary);
}

.void-box {
  border: 1px solid var(--color-danger);
}

.approval-title {
  font-size: 14px;
  font-weight: 700;
  color: #b45309;
  margin: 0;
}

.edit-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.void-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--color-danger);
  margin: 0;
}

.approval-desc,
.edit-desc,
.void-desc {
  font-size: 12px;
  color: var(--text-secondary);
  margin: 0;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
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

.approval-error,
.edit-error,
.void-error {
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
}

.approval-actions,
.edit-actions,
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

.btn-confirm-approval {
  flex: 2;
  height: 44px;
  border: none;
  background: #f59e0b;
  color: #ffffff;
  border-radius: var(--radius-btn);
  font-weight: 700;
  cursor: pointer;
}

.btn-confirm-edit {
  flex: 2;
  height: 44px;
  border: none;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-btn);
  font-weight: 700;
  cursor: pointer;
}

.btn-confirm-void {
  flex: 2;
  height: 44px;
  border: none;
  background: var(--color-danger);
  color: var(--color-white);
  border-radius: var(--radius-btn);
  font-weight: 700;
  cursor: pointer;
}
</style>
