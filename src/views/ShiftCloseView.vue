<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Tutup Shift & Hitung Fisik</h2>
      </div>

      <p class="section-intro">
        Langkah 2–5 Serah Terima: Bandingkan saldo catatan sistem dengan hitungan fisik nyata. Selisih wajib diberi penjelasan.
      </p>

      <div v-if="!activeShift" class="no-shift-box">
        <p>Tidak ada shift aktif yang sedang berjalan.</p>
      </div>

      <form v-else class="close-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="account-check-list">
          <div v-for="acc in accountList" :key="acc.id" class="acc-check-card">
            <div class="acc-header">
              <span class="acc-name">{{ acc.name }}</span>
              <span class="acc-type">{{ acc.type }}</span>
            </div>

            <div class="comparison-row">
              <div class="comp-col">
                <span class="comp-label">Menurut Sistem:</span>
                <span class="comp-val money-display">{{ formatRupiah(systemBalances[acc.id] ?? 0) }}</span>
              </div>

              <div class="comp-col">
                <label class="comp-label">Hitungan Fisik / Nyata:</label>
                <div class="input-prefix-wrapper">
                  <span class="currency-prefix">Rp</span>
                  <input
                    type="text"
                    inputmode="numeric"
                    class="form-input with-prefix tabular-nums"
                    :value="displayFisik(acc.id)"
                    placeholder="0"
                    required
                    @input="onFisikInput(acc.id, $event)"
                  />
                </div>
              </div>
            </div>

            <!-- Selisih -->
            <div class="diff-indicator" :class="getDiffClass(acc.id)">
              <span>Selisih:</span>
              <span class="diff-val money-display">
                {{ formatRupiah(getDiff(acc.id)) }} ({{ getDiffLabel(acc.id) }})
              </span>
            </div>

            <!-- Wajib Penjelasan Bila Selisih != 0 -->
            <div v-if="getDiff(acc.id) !== 0" class="explanation-box">
              <label class="exp-label">Penjelasan Selisih (Wajib):</label>
              <input
                v-model="penjelasanSelisih[acc.id]"
                type="text"
                class="form-input"
                placeholder="Contoh: Salah kembalian uang / biaya admin belum dicatat"
                required
              />
            </div>
          </div>
        </div>

        <button type="submit" class="btn-submit" :disabled="isSubmitting">
          {{ isSubmitting ? 'Menutup Shift...' : 'Konfirmasi Tutup Shift' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { shiftService } from '../services/shiftService';
import { accountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, parseRupiah } from '../utils/format';
import type { Shift, Account } from '../db/types';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const activeShift = ref<Shift | null>(null);
const accountList = ref<Account[]>([]);
const systemBalances = ref<Record<string, number>>({});
const hitungFisik = ref<Record<string, number>>({});
const penjelasanSelisih = ref<Record<string, string>>({});

const errorMessage = ref('');
const isSubmitting = ref(false);

onMounted(async () => {
  if (authStore.currentUser) {
    const shift = await shiftService.getActiveShift(authStore.currentUser.id);
    activeShift.value = shift || null;
  }

  accountList.value = await accountService.getAccounts({ activeOnly: true });
  systemBalances.value = await accountService.getAllBalances();

  // Inisialisasi hitung fisik dengan angka sistem sebagai nilai awal
  for (const acc of accountList.value) {
    hitungFisik.value[acc.id] = systemBalances.value[acc.id] || 0;
  }
});

function displayFisik(accId: string): string {
  const val = hitungFisik.value[accId];
  if (val === undefined || val === 0) return '0';
  return val.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

function onFisikInput(accId: string, e: Event) {
  const target = e.target as HTMLInputElement;
  hitungFisik.value[accId] = parseRupiah(target.value);
}

function getDiff(accId: string): number {
  const fisik = hitungFisik.value[accId] ?? 0;
  const sistem = systemBalances.value[accId] ?? 0;
  return fisik - sistem;
}

function getDiffLabel(accId: string): string {
  const diff = getDiff(accId);
  if (diff === 0) return 'Pas';
  if (diff > 0) return 'Lebih';
  return 'Kurang';
}

function getDiffClass(accId: string): string {
  const diff = getDiff(accId);
  if (diff === 0) return 'diff-pas';
  if (diff > 0) return 'diff-lebih';
  return 'diff-kurang';
}

async function handleSubmit() {
  if (!activeShift.value || !authStore.currentUser) return;
  errorMessage.value = '';

  isSubmitting.value = true;
  try {
    await shiftService.closeShift({
      shiftId: activeShift.value.id,
      hitungFisik: hitungFisik.value,
      penjelasanSelisih: penjelasanSelisih.value,
      actorUserId: authStore.currentUser.id,
    });
    router.replace('/shifts');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menutup shift. Periksa kembali penjelasan selisih.';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.form-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
}

.btn-back {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 700;
  color: var(--color-primary);
  cursor: pointer;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.no-shift-box {
  background: var(--surface-card);
  padding: 24px;
  text-align: center;
  border-radius: var(--radius-card);
  color: var(--text-secondary);
}

.close-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
}

.account-check-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.acc-check-card {
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 14px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.acc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.acc-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.acc-type {
  font-size: 11px;
  color: var(--text-secondary);
  text-transform: capitalize;
}

.comparison-row {
  display: flex;
  gap: 12px;
}

.comp-col {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.comp-label {
  font-size: 11px;
  color: var(--text-secondary);
}

.comp-val {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.input-prefix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-prefix {
  position: absolute;
  left: 10px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}

.form-input {
  height: 42px;
  padding: 0 10px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}

.form-input.with-prefix {
  width: 100%;
  padding-left: 32px;
}

.diff-indicator {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 6px 12px;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
}

.diff-pas {
  background: var(--color-income-subtle);
  color: var(--color-income);
}

.diff-lebih {
  background: #E0E7FF;
  color: #4338CA;
}

.diff-kurang {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.explanation-box {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 4px;
}

.exp-label {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-danger);
}

.btn-submit {
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: #ffffff;
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
