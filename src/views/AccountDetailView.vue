<template>
  <AppScaffold>
    <div v-if="!account" class="loading-state">
      <p>Memuat akun...</p>
    </div>

    <div v-else class="account-detail-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <span class="type-pill">{{ account.type }}</span>
      </div>

      <!-- Kartu Saldo Saat Ini -->
      <div class="balance-card">
        <span class="acc-title">{{ account.name }}</span>
        <div class="balance-amount money-display">{{ formatRupiah(currentBalance) }}</div>
        <span class="initial-info">Saldo Awal: {{ formatRupiah(account.initialBalance) }}</span>
      </div>

      <!-- Menu Koreksi Saldo Manual (HANYA OWNER/ADMIN — KASIR TIDAK BOLEH LIHAT) -->
      <div v-if="authStore.isAdmin" class="correction-section">
        <button
          v-if="!showCorrectionForm"
          class="btn-trigger-correction"
          @click="showCorrectionForm = true"
        >
          Koreksi / Rubah Saldo Manual (Owner/Admin)
        </button>

        <!-- Form Koreksi Saldo -->
        <div v-else class="correction-form-box">
          <div class="correction-header">
            <h4 class="box-title">Koreksi Saldo Manual</h4>
            <button class="btn-close-box" @click="showCorrectionForm = false">✕</button>
          </div>
          <p class="box-desc">
            Koreksi saldo hanya digunakan untuk selisih sah (mis. biaya admin bank otomatis / bonus server). Selisih shift harus diselesaikan lewat serah terima.
          </p>

          <div v-if="correctionError" class="error-banner">
            {{ correctionError }}
          </div>

          <div class="form-group">
            <label class="form-label">Saldo Sistem Saat Ini</label>
            <input type="text" class="form-input disabled" :value="formatRupiah(currentBalance)" disabled />
          </div>

          <div class="form-group">
            <label class="form-label">Saldo Seharusnya (Fisik / Bank)</label>
            <div class="input-prefix-wrapper">
              <span class="currency-prefix">Rp</span>
              <input
                type="text"
                inputmode="numeric"
                class="form-input with-prefix tabular-nums"
                :value="displayTargetBalance"
                placeholder="0"
                @input="onTargetBalanceInput"
              />
            </div>
          </div>

          <div class="diff-summary">
            <span>Selisih Otomatis:</span>
            <span class="diff-val money-display" :class="calculatedDelta >= 0 ? 'text-income' : 'text-danger'">
              {{ formatRupiah(calculatedDelta) }}
            </span>
          </div>

          <div class="form-group">
            <label class="form-label">Alasan Koreksi (Wajib, min. 3 karakter)</label>
            <input
              v-model="correctionReason"
              type="text"
              class="form-input"
              placeholder="Contoh: Biaya admin bulanan bank BCA"
              required
            />
          </div>

          <button
            type="button"
            class="btn-submit-correction"
            :disabled="isSubmittingCorrection || calculatedDelta === 0 || !correctionReason.trim()"
            @click="handleCorrectionSubmit"
          >
            {{ isSubmittingCorrection ? 'Menyimpan Koreksi...' : 'Simpan Koreksi Saldo' }}
          </button>
        </div>
      </div>

      <!-- Riwayat Mutasi Buku Besar (Ledger) -->
      <div class="ledger-section">
        <h3 class="section-title">Riwayat Mutasi Catatan</h3>

        <div v-if="ledgers.length === 0" class="empty-ledger">
          <p>Belum ada mutasi transaksi untuk akun ini.</p>
        </div>

        <div v-else class="ledger-list">
          <div v-for="l in ledgers" :key="l.id" class="ledger-item">
            <div class="ledger-left">
              <span class="ledger-kind" :class="l.kind">{{ l.kind.replace('_', ' ').toUpperCase() }}</span>
              <span class="ledger-date">{{ formatTanggalWita(l.createdAt) }}</span>
              <span v-if="l.note" class="ledger-note">{{ l.note }}</span>
            </div>
            <div class="ledger-right">
              <span class="ledger-delta money-display" :class="l.delta >= 0 ? 'plus' : 'minus'">
                {{ l.delta >= 0 ? '+' : '' }}{{ formatRupiah(l.delta) }}
              </span>
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
import { accountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita, parseRupiah } from '../utils/format';
import type { Account, AccountLedger } from '../db/types';
import { AppError } from '../core/errors';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const account = ref<Account | null>(null);
const currentBalance = ref<number>(0);
const ledgers = ref<AccountLedger[]>([]);

// Koreksi Saldo States
const showCorrectionForm = ref<boolean>(false);
const targetBalance = ref<number>(0);
const correctionReason = ref<string>('');
const correctionError = ref<string>('');
const isSubmittingCorrection = ref<boolean>(false);

const calculatedDelta = computed(() => targetBalance.value - currentBalance.value);

const displayTargetBalance = computed(() => {
  if (targetBalance.value === 0) return '0';
  return targetBalance.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onTargetBalanceInput(e: Event) {
  const target = e.target as HTMLInputElement;
  targetBalance.value = parseRupiah(target.value);
}

onMounted(async () => {
  await loadData();
});

async function loadData() {
  const id = route.params['id'] as string;
  if (!id) return;

  const acc = await db.accounts.get(id);
  if (!acc) {
    router.replace('/accounts');
    return;
  }

  account.value = acc;
  currentBalance.value = await accountService.getBalance(id);
  targetBalance.value = currentBalance.value;
  ledgers.value = await accountService.getLedger(id);
}

async function handleCorrectionSubmit() {
  if (!account.value) return;
  correctionError.value = '';

  if (calculatedDelta.value === 0) {
    correctionError.value = 'Saldo seharusnya sama dengan saldo sistem (tidak ada selisih).';
    return;
  }

  if (!correctionReason.value.trim() || correctionReason.value.trim().length < 3) {
    correctionError.value = 'Alasan koreksi saldo wajib diisi minimal 3 karakter.';
    return;
  }

  isSubmittingCorrection.value = true;
  try {
    await accountService.adjustBalanceManual({
      accountId: account.value.id,
      delta: calculatedDelta.value,
      reason: correctionReason.value.trim(),
      actorUserId: authStore.currentUser?.id || 'system',
    });

    showCorrectionForm.value = false;
    correctionReason.value = '';
    await loadData();
  } catch (err: unknown) {
    if (err instanceof AppError) {
      correctionError.value = err.message;
    } else {
      correctionError.value = 'Gagal menyimpan koreksi saldo manual.';
    }
  } finally {
    isSubmittingCorrection.value = false;
  }
}
</script>

<style scoped>
.account-detail-container {
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

.type-pill {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  text-transform: uppercase;
}

.balance-card {
  background: var(--gradient-saldo);
  color: var(--color-white);
  padding: 20px 16px;
  border-radius: var(--radius-card);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.acc-title {
  font-size: 14px;
  font-weight: 600;
  opacity: 0.9;
}

.balance-amount {
  font-size: 30px;
  font-weight: 800;
}

.initial-info {
  font-size: 11px;
  opacity: 0.75;
}

.btn-trigger-correction {
  width: 100%;
  height: 46px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-btn);
  background: var(--surface-card);
  color: var(--color-primary);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.correction-form-box {
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.correction-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.box-title {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.btn-close-box {
  background: transparent;
  border: none;
  font-size: 16px;
  cursor: pointer;
  color: var(--text-muted);
}

.box-desc {
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 8px 12px;
  border-radius: var(--radius-btn);
  font-size: 12px;
  font-weight: 600;
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

.form-input.disabled {
  background: var(--surface-card-subtle);
  color: var(--text-muted);
}

.input-prefix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-prefix {
  position: absolute;
  left: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.form-input.with-prefix {
  width: 100%;
  padding-left: 38px;
}

.diff-summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 12px;
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
}

.text-income {
  color: var(--color-income);
}

.text-danger {
  color: var(--color-danger);
}

.btn-submit-correction {
  height: 48px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
}

.btn-submit-correction:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.section-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 8px;
}

.empty-ledger {
  background: var(--surface-card);
  padding: 20px;
  text-align: center;
  border-radius: var(--radius-card);
  border: 1px dashed var(--border-color);
  color: var(--text-secondary);
  font-size: 13px;
}

.ledger-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ledger-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
}

.ledger-left {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ledger-kind {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}

.ledger-kind.koreksi_manual {
  color: var(--color-warning);
}

.ledger-date {
  font-size: 11px;
  color: var(--text-muted);
}

.ledger-note {
  font-size: 12px;
  color: var(--text-secondary);
}

.ledger-delta {
  font-size: 15px;
  font-weight: 700;
}

.ledger-delta.plus {
  color: var(--color-income);
}

.ledger-delta.minus {
  color: var(--color-danger);
}
</style>
