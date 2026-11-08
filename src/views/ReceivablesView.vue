<template>
  <AppScaffold>
    <div class="receivables-container">
      <div class="view-header">
        <h2 class="page-title">Daftar Piutang Pelanggan</h2>
        <span class="total-badge money-display">Total: {{ formatRupiah(totalPiutang) }}</span>
      </div>

      <p class="section-intro">
        Daftar tagihan bon pelanggan konter. Mendukung pelunasan penuh, cicilan bertahap, dan pengingat WhatsApp.
      </p>

      <EmptyState
        v-if="receivables.length === 0"
        title="Tidak Ada Piutang Tertunda"
        description="Semua transaksi pelanggan saat ini lunas. Tidak ada tagihan bon yang belum dibayar."
      />

      <div v-else class="receivable-list">
        <div v-for="r in receivables" :key="r.customerId" class="debt-card">
          <div class="debt-main">
            <div class="customer-row">
              <span class="debt-customer-name">{{ r.customerName }}</span>
              <span class="age-badge" :class="r.debtAgeDays > 7 ? 'old-debt' : ''">
                {{ r.debtAgeDays }} hari
              </span>
            </div>
            <span v-if="r.phone" class="debt-phone">HP: {{ r.phone }}</span>
            <span class="debt-date">Sejak: {{ formatTanggalWita(r.oldestDate) }}</span>
          </div>

          <div class="debt-actions-col">
            <span class="debt-amount money-display">{{ formatRupiah(r.totalHutang) }}</span>
            <div class="btn-group-actions">
              <button class="btn-pay-full" @click="openPayModal(r, 'full')">
                Lunas Penuh
              </button>
              <button class="btn-pay-partial" @click="openPayModal(r, 'partial')">
                Cicil
              </button>
              <a
                v-if="r.phone"
                :href="getWhatsAppLink(r)"
                target="_blank"
                class="btn-wa-reminder"
                title="Kirim pengingat WhatsApp"
              >
                WA
              </a>
            </div>
          </div>
        </div>
      </div>

      <!-- Modal Pembayaran (Lunas / Cicil) -->
      <div v-if="selectedDebt" class="modal-backdrop">
        <div class="modal-card">
          <h4 class="modal-title">
            {{ payMode === 'full' ? 'Pelunasan Penuh Piutang' : 'Pembayaran Cicilan Piutang' }}
          </h4>
          <p class="modal-desc">
            Pelanggan <strong>{{ selectedDebt.customerName }}</strong> (Total Hutang: {{ formatRupiah(selectedDebt.totalHutang) }}).
          </p>

          <div v-if="payMode === 'full'" class="modal-amount money-display">
            {{ formatRupiah(selectedDebt.totalHutang) }}
          </div>
          <div v-else class="form-group">
            <label class="form-label">Nominal Cicilan (Rp):</label>
            <input
              v-model.number="partialAmount"
              type="number"
              inputmode="numeric"
              class="form-input"
              :max="selectedDebt.totalHutang"
              placeholder="Masukkan jumlah yang dibayarkan"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Uang Diterima Di Akun:</label>
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
              :disabled="isPaying || !targetAccountId || (payMode === 'partial' && (!partialAmount || partialAmount <= 0))"
              @click="handlePaymentSubmit"
            >
              {{ isPaying ? 'Memproses...' : (payMode === 'full' ? 'Konfirmasi Lunas' : 'Simpan Cicilan') }}
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

const authStore = useAuthStore();

const receivables = ref<ReceivableSummary[]>([]);
const availablePaymentAccounts = ref<Account[]>([]);
const selectedDebt = ref<ReceivableSummary | null>(null);
const payMode = ref<'full' | 'partial'>('full');
const partialAmount = ref<number>(0);
const targetAccountId = ref<string>('');
const payError = ref<string>('');
const isPaying = ref<boolean>(false);

const totalPiutang = computed(() =>
  receivables.value.reduce((sum, r) => sum + r.totalHutang, 0)
);

function getWhatsAppLink(r: ReceivableSummary): string {
  return receivableService.generateWhatsAppReminder(r, 'Buku Konter');
}

function openPayModal(r: ReceivableSummary, mode: 'full' | 'partial') {
  selectedDebt.value = r;
  payMode.value = mode;
  partialAmount.value = mode === 'full' ? r.totalHutang : 0;
  payError.value = '';

  const kasAccount = availablePaymentAccounts.value.find((a) => a.type === 'kas');
  if (kasAccount) {
    targetAccountId.value = kasAccount.id;
  } else if (availablePaymentAccounts.value.length > 0) {
    targetAccountId.value = availablePaymentAccounts.value[0]!.id;
  }
}

async function handlePaymentSubmit() {
  if (!selectedDebt.value || !targetAccountId.value) return;

  isPaying.value = true;
  payError.value = '';

  try {
    const actorId = authStore.currentUser?.id || 'system';
    const now = Date.now();

    if (payMode.value === 'full') {
      await receivableService.markPaidFull(
        selectedDebt.value.customerId,
        targetAccountId.value,
        now,
        actorId
      );
    } else {
      await receivableService.payPartial(
        selectedDebt.value.customerId,
        partialAmount.value,
        targetAccountId.value,
        now,
        actorId
      );
    }

    selectedDebt.value = null;
    await loadData();
  } catch (err: unknown) {
    payError.value = (err as Error).message;
  } finally {
    isPaying.value = false;
  }
}

async function loadData() {
  receivables.value = await receivableService.listReceivables();
  const allAccounts = await db.accounts.toArray();
  availablePaymentAccounts.value = allAccounts.filter((a) => a.isActive && a.type !== 'server_pulsa');
}

onMounted(async () => {
  await loadData();
});
</script>

<style scoped>
.receivables-container {
  padding-bottom: 30px;
}
.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}
.total-badge {
  font-size: 13px;
  font-weight: 700;
  padding: 4px 10px;
  background: rgba(225, 29, 72, 0.1);
  color: var(--color-danger);
  border-radius: var(--radius-chip);
}
.section-intro {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 16px;
  line-height: 1.4;
}

.receivable-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.debt-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.debt-main {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.customer-row {
  display: flex;
  align-items: center;
  gap: 8px;
}
.debt-customer-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}
.age-badge {
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-muted);
}
.age-badge.old-debt {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}
.debt-phone {
  font-size: 12px;
  color: var(--text-muted);
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
  font-weight: 700;
  color: var(--color-danger);
}
.btn-group-actions {
  display: flex;
  gap: 4px;
}
.btn-pay-full {
  background: var(--color-success);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-pay-partial {
  background: var(--bg-canvas);
  color: var(--text-main);
  border: 1px solid var(--border-color);
  border-radius: 6px;
  padding: 6px 10px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
}
.btn-wa-reminder {
  background: var(--color-whatsapp);
  color: var(--color-white);
  border-radius: 6px;
  padding: 6px 8px;
  font-size: 11px;
  font-weight: 700;
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}
.modal-card {
  background: var(--bg-card);
  border-radius: var(--radius-card);
  padding: 20px;
  max-width: 400px;
  width: 100%;
}
.modal-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
}
.modal-desc {
  font-size: 13px;
  color: var(--text-muted);
  margin-bottom: 12px;
}
.modal-amount {
  font-size: 22px;
  font-weight: 700;
  color: var(--color-danger);
  margin-bottom: 16px;
  text-align: center;
}

.form-group {
  margin-bottom: 14px;
}
.form-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 6px;
}
.form-select,
.form-input {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 13px;
}

.error-banner {
  padding: 8px 12px;
  border-radius: 6px;
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  font-size: 12px;
  margin-bottom: 12px;
}
.modal-actions {
  display: flex;
  gap: 10px;
  margin-top: 16px;
}
.btn-cancel {
  flex: 1;
  padding: 10px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-muted);
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}
.btn-confirm-pay {
  flex: 2;
  padding: 10px;
  border: none;
  background: var(--color-success);
  color: white;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 600;
  font-size: 13px;
}
.btn-confirm-pay:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
