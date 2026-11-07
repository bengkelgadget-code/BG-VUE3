<template>
  <AppScaffold>
    <div class="receivables-container">
      <div class="view-header">
        <h2 class="page-title">Daftar Piutang Pelanggan</h2>
        <span class="total-badge money-display">Total: {{ formatRupiah(totalPiutang) }}</span>
      </div>

      <p class="section-intro">
        Versi simpel MVP: Transaksi berstatus Hutang tercatat di sini dan dapat dilunasi penuh saat pelanggan membayar.
      </p>

      <EmptyState
        v-if="receivables.length === 0"
        title="Tidak Ada Piutang Tertunda"
        description="Semua transaksi pelanggan saat ini lunas. Tidak ada tagihan bon yang belum dibayar."
      />

      <div v-else class="receivable-list">
        <div v-for="r in receivables" :key="r.customerId" class="debt-card">
          <div class="debt-main">
            <span class="debt-customer-name">{{ r.customerName }}</span>
            <span v-if="r.phone" class="debt-phone">HP: {{ r.phone }}</span>
            <span class="debt-date">Tertua sejak: {{ formatTanggalWita(r.oldestDate) }}</span>
          </div>

          <div class="debt-actions-col">
            <span class="debt-amount money-display">{{ formatRupiah(r.totalHutang) }}</span>
            <button class="btn-pay-full" @click="openPayModal(r)">
              Lunas Penuh
            </button>
          </div>
        </div>
      </div>

      <!-- Modal Pelunasan Penuh -->
      <div v-if="selectedDebt" class="modal-backdrop">
        <div class="modal-card">
          <h4 class="modal-title">Pelunasan Penuh Piutang</h4>
          <p class="modal-desc">
            Pelanggan <strong>{{ selectedDebt.customerName }}</strong> akan melunasi seluruh sisa hutang sebesar:
          </p>
          <div class="modal-amount money-display">{{ formatRupiah(selectedDebt.totalHutang) }}</div>

          <div class="form-group">
            <label class="form-label">Uang Pelunasan Diterima Di Akun:</label>
            <select v-model="targetAccountId" class="form-select" required>
              <option v-for="acc in availablePaymentAccounts" :key="acc.id" :value="acc.id">
                {{ acc.name }} ({{ acc.type }})
              </option>
            </select>
          </div>

          <div v-if="payError" class="error-banner">
            {{ payError }}
          </div>

          <div class="modal-actions">
            <button class="btn-cancel" @click="selectedDebt = null">Batal</button>
            <button
              class="btn-confirm-pay"
              :disabled="isPaying || !targetAccountId"
              @click="handlePayFull"
            >
              {{ isPaying ? 'Memproses...' : 'Konfirmasi Lunas' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { receivableService, type ReceivableSummary } from '../services/receivableService';
import { db } from '../db/database';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import type { Account } from '../db/types';
import { AppError } from '../core/errors';

const authStore = useAuthStore();

const receivables = ref<ReceivableSummary[]>([]);
const availablePaymentAccounts = ref<Account[]>([]);
const selectedDebt = ref<ReceivableSummary | null>(null);
const targetAccountId = ref<string>('');
const payError = ref<string>('');
const isPaying = ref<boolean>(false);

const totalPiutang = computed(() =>
  receivables.value.reduce((sum, r) => sum + r.totalHutang, 0)
);

onMounted(async () => {
  await loadData();
});

async function loadData() {
  receivables.value = await receivableService.listReceivables();
  availablePaymentAccounts.value = await db.accounts
    .filter((a) => a.isActive && (a.type === 'kas' || a.type === 'bank' || a.type === 'ewallet'))
    .toArray();

  const defaultKas = availablePaymentAccounts.value.find((a) => a.type === 'kas');
  if (defaultKas) {
    targetAccountId.value = defaultKas.id;
  }
}

function openPayModal(r: ReceivableSummary) {
  selectedDebt.value = r;
  payError.value = '';
}

async function handlePayFull() {
  if (!selectedDebt.value || !targetAccountId.value) return;
  payError.value = '';
  isPaying.value = true;
  try {
    await receivableService.markPaidFull(
      selectedDebt.value.customerId,
      targetAccountId.value,
      Date.now(),
      authStore.currentUser?.id || 'system'
    );
    selectedDebt.value = null;
    await loadData();
  } catch (err: unknown) {
    if (err instanceof AppError) {
      payError.value = err.message;
    } else {
      payError.value = 'Gagal memproses pelunasan piutang.';
    }
  } finally {
    isPaying.value = false;
  }
}
</script>

<style scoped>
.receivables-container {
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

.total-badge {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-warning);
  background: var(--color-warning-subtle);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.receivable-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.debt-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 14px 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
}

.debt-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.debt-customer-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.debt-phone {
  font-size: 12px;
  color: var(--text-secondary);
}

.debt-date {
  font-size: 11px;
  color: var(--text-muted);
}

.debt-actions-col {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 6px;
}

.debt-amount {
  font-size: 16px;
  font-weight: 800;
  color: var(--color-warning);
}

.btn-pay-full {
  padding: 6px 12px;
  background: var(--color-primary);
  color: #ffffff;
  border: none;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn-pay-full:active {
  background: var(--color-primary-dark);
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 16px;
}

.modal-card {
  width: 100%;
  max-width: 400px;
  background: var(--surface-card);
  border-radius: var(--radius-card);
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.15);
}

.modal-title {
  font-size: 16px;
  font-weight: 800;
  color: var(--text-main);
}

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.modal-amount {
  font-size: 24px;
  font-weight: 800;
  color: var(--color-primary-dark);
  text-align: center;
  padding: 8px 0;
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

.form-select {
  height: 44px;
  padding: 0 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 8px 12px;
  border-radius: var(--radius-btn);
  font-size: 12px;
  font-weight: 600;
}

.modal-actions {
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

.btn-confirm-pay {
  flex: 2;
  height: 44px;
  border: none;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-btn);
  font-weight: 700;
  cursor: pointer;
}

.btn-confirm-pay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
