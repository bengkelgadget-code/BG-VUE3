<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Tambah Aturan Tarif</h2>
      </div>

      <p class="section-intro">
        Form Pengaturan Margin (BG-APP): Tentukan tipe perhitungan, rentang nominal, dan layanan terkait.
      </p>

      <form class="fee-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <!-- 1. Tipe Perhitungan (Toggle Range Nominal vs Persentase) -->
          <div class="form-group">
            <label class="form-label">Tipe Perhitungan</label>
            <div class="type-toggle">
              <button
                type="button"
                class="t-btn"
                :class="{ active: feeType === 'tetap' }"
                @click="feeType = 'tetap'"
              >
                Range Nominal (Tetap Rp)
              </button>
              <button
                type="button"
                class="t-btn"
                :class="{ active: feeType === 'persentase' }"
                @click="feeType = 'persentase'"
              >
                Persentase (% × Nominal)
              </button>
            </div>
          </div>

          <!-- 2. Layanan Terkait Multi-Select -->
          <div class="form-group">
            <label class="form-label">Berlaku untuk Layanan (Pilih Minimal 1)</label>
            <div class="services-select-grid">
              <label
                v-for="s in availableServices"
                :key="s.code"
                class="service-checkbox-card"
                :class="{ checked: selectedServices.includes(s.code) }"
              >
                <input
                  type="checkbox"
                  :value="s.code"
                  :checked="selectedServices.includes(s.code)"
                  @change="toggleService(s.code)"
                />
                <span class="srv-name">{{ s.label }}</span>
              </label>
            </div>
          </div>

          <!-- 3. Rentang Nominal (Batas Bawah & Batas Atas) -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Nominal Awal (>=)</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  type="text"
                  inputmode="numeric"
                  class="form-input with-prefix tabular-nums"
                  :value="displayMinNom"
                  placeholder="Contoh: 20.000"
                  required
                  @input="onMinNomInput"
                />
              </div>
            </div>

            <div class="form-group flex-1">
              <label class="form-label">Nominal Akhir (&lt;)</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  type="text"
                  inputmode="numeric"
                  class="form-input with-prefix tabular-nums"
                  :value="displayMaxNom"
                  placeholder="Kosongkan jika tanpa batas"
                  @input="onMaxNomInput"
                />
              </div>
            </div>
          </div>
          <span class="form-hint">
            Batas atas eksklusif (&lt;). Kosongkan batas atas untuk aturan tanpa batas maksimal (misal ≥ Rp5.000.000).
          </span>

          <!-- 4. Nilai Biaya Admin (Tetap Rp atau Persentase %) -->
          <div v-if="feeType === 'tetap'" class="form-group mt-2">
            <label class="form-label">Biaya Admin Tetap</label>
            <div class="input-prefix-wrapper">
              <span class="currency-prefix">Rp</span>
              <input
                type="text"
                inputmode="numeric"
                class="form-input with-prefix tabular-nums"
                :value="displayValMargin"
                placeholder="Contoh: 3.000"
                required
                @input="onValMarginInput"
              />
            </div>
          </div>

          <div v-else class="form-group mt-2">
            <label class="form-label">Nilai Persentase</label>
            <div class="input-suffix-wrapper">
              <input
                v-model.number="persentaseVal"
                type="number"
                step="0.01"
                min="0.01"
                max="100"
                class="form-input with-suffix tabular-nums"
                placeholder="Contoh: 0.4"
                required
              />
              <span class="currency-suffix">%</span>
            </div>
            <span class="form-hint">
              Pembulatan persentase selalu dibulatkan KE ATAS (Math.ceil) ke Rupiah terdekat.
            </span>
          </div>
        </div>

        <button
          type="submit"
          class="btn-submit"
          :disabled="isSubmitting || selectedServices.length === 0"
        >
          {{ isSubmitting ? 'Menyimpan Aturan...' : 'Simpan Aturan Tarif' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { feeRuleService } from '../services/feeRuleService';
import { parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';

const router = useRouter();

const feeType = ref<'tetap' | 'persentase'>('tetap');
const selectedServices = ref<string[]>(['transfer', 'tarik_tunai', 'topup_ewallet']);
const minNom = ref<number>(20000);
const maxNom = ref<number | null>(100000);
const valMargin = ref<number>(3000);
const persentaseVal = ref<number>(0.4);

const errorMessage = ref('');
const isSubmitting = ref(false);

const availableServices = [
  { code: 'transfer', label: 'Transfer Bank' },
  { code: 'tarik_tunai', label: 'Tarik Tunai' },
  { code: 'topup_ewallet', label: 'Top Up E-Wallet' },
  { code: 'ppob', label: 'Tagihan PPOB' },
  { code: 'token_pln', label: 'Token PLN' },
  { code: 'pulsa', label: 'Pulsa' },
  { code: 'data', label: 'Paket Data' },
];

const displayMinNom = computed(() => {
  if (minNom.value === 0) return '0';
  return minNom.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

const displayMaxNom = computed(() => {
  if (maxNom.value === null) return '';
  return maxNom.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

const displayValMargin = computed(() => {
  if (valMargin.value === 0) return '0';
  return valMargin.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onMinNomInput(e: Event) {
  const target = e.target as HTMLInputElement;
  minNom.value = parseRupiah(target.value);
}

function onMaxNomInput(e: Event) {
  const target = e.target as HTMLInputElement;
  const val = parseRupiah(target.value);
  maxNom.value = val > 0 ? val : null;
}

function onValMarginInput(e: Event) {
  const target = e.target as HTMLInputElement;
  valMargin.value = parseRupiah(target.value);
}

function toggleService(code: string) {
  if (selectedServices.value.includes(code)) {
    selectedServices.value = selectedServices.value.filter((s) => s !== code);
  } else {
    selectedServices.value.push(code);
  }
}

async function handleSubmit() {
  errorMessage.value = '';
  if (selectedServices.value.length === 0) {
    errorMessage.value = 'Pilih minimal 1 layanan yang berlaku.';
    return;
  }

  if (maxNom.value !== null && maxNom.value <= minNom.value) {
    errorMessage.value = 'Nominal akhir harus lebih besar dari nominal awal.';
    return;
  }

  isSubmitting.value = true;
  try {
    await feeRuleService.addMultiServiceRule({
      layananList: selectedServices.value,
      minNom: minNom.value,
      maxNom: maxNom.value,
      feeType: feeType.value,
      valMargin: feeType.value === 'tetap' ? valMargin.value : null,
      persentaseVal: feeType.value === 'persentase' ? persentaseVal.value : null,
    });
    router.replace('/fee-rules');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan aturan tarif.';
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

.fee-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.card-section {
  background: var(--surface-card);
  padding: 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.error-banner {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.flex-1 {
  flex: 1;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.type-toggle {
  display: flex;
  height: 48px;
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  padding: 3px;
  gap: 3px;
}

.t-btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
}

.t-btn.active {
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 700;
}

.services-select-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 8px;
}

.service-checkbox-card {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface-card-subtle);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-btn);
  cursor: pointer;
}

.service-checkbox-card.checked {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary-dark);
  font-weight: 700;
}

.srv-name {
  font-size: 12px;
}

.form-input {
  height: 48px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 15px;
  outline: none;
}

.input-prefix-wrapper,
.input-suffix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-prefix {
  position: absolute;
  left: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.currency-suffix {
  position: absolute;
  right: 14px;
  font-weight: 700;
  color: var(--text-secondary);
}

.form-input.with-prefix {
  width: 100%;
  padding-left: 42px;
}

.form-input.with-suffix {
  width: 100%;
  padding-right: 42px;
}

.form-hint {
  font-size: 11px;
  color: var(--text-muted);
  line-height: 1.4;
}

.btn-submit {
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
