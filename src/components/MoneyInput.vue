<template>
  <div class="money-input-container">
    <div class="input-row">
      <!-- Input Nominal Pokok -->
      <div class="field-col nominal-col">
        <label :for="id" class="field-label">{{ label || 'Nominal Pokok' }}</label>
        <div class="input-wrapper">
          <span class="currency-prefix">Rp</span>
          <input
            :id="id"
            type="text"
            inputmode="numeric"
            class="input-box nominal-input tabular-nums"
            :value="displayNominal"
            :placeholder="placeholder || '0'"
            :disabled="disabled"
            @input="onNominalInput"
          />
        </div>
      </div>

      <!-- Kolom Biaya Admin di sebelah Nominal -->
      <div v-if="!hideAdmin" class="field-col admin-col">
        <div class="admin-label-wrapper">
          <label class="field-label">Biaya Admin</label>
          <span v-if="isAutoFee" class="auto-tag">Otomatis</span>
          <span v-else-if="feeManualOverride" class="override-tag">Manual</span>
        </div>
        <div class="input-wrapper">
          <span class="currency-prefix">Rp</span>
          <input
            type="text"
            inputmode="numeric"
            class="input-box admin-input tabular-nums"
            :value="displayFee"
            placeholder="0"
            :disabled="disabled"
            @input="onFeeInput"
          />
        </div>
      </div>

      <!-- Pilihan Bayar Admin: Cash / Debit Rekening di sebelah Nominal -->
      <div v-if="!hideAdmin" class="field-col method-col">
        <label class="field-label">Bayar Admin</label>
        <div class="toggle-group">
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: feePaidBy === 'cash' }"
            :disabled="disabled"
            @click="setFeePaidBy('cash')"
          >
            Cash
          </button>
          <button
            type="button"
            class="toggle-btn"
            :class="{ active: feePaidBy === 'debit_rekening' }"
            :disabled="disabled"
            @click="setFeePaidBy('debit_rekening')"
          >
            Debit Rekening
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { parseRupiah } from '../utils/format';

const props = withDefaults(
  defineProps<{
    id?: string;
    label?: string;
    placeholder?: string;
    modelValue: number;
    fee?: number;
    feePaidBy?: 'cash' | 'debit_rekening';
    isAutoFee?: boolean;
    feeManualOverride?: boolean;
    hideAdmin?: boolean;
    disabled?: boolean;
  }>(),
  {
    id: 'nominal-input',
    label: 'Nominal',
    placeholder: '0',
    fee: 0,
    feePaidBy: 'cash',
    isAutoFee: false,
    feeManualOverride: false,
    hideAdmin: false,
    disabled: false,
  }
);

const emit = defineEmits<{
  (e: 'update:modelValue', val: number): void;
  (e: 'update:fee', val: number): void;
  (e: 'update:feePaidBy', val: 'cash' | 'debit_rekening'): void;
  (e: 'overrideFee', val: number): void;
}>();

const displayNominal = computed(() => {
  if (!props.modelValue && props.modelValue !== 0) return '';
  if (props.modelValue === 0) return '';
  return props.modelValue.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

const displayFee = computed(() => {
  if (!props.fee && props.fee !== 0) return '0';
  return props.fee.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onNominalInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const parsed = parseRupiah(target.value);
  emit('update:modelValue', parsed);
}

function onFeeInput(event: Event) {
  const target = event.target as HTMLInputElement;
  const parsed = parseRupiah(target.value);
  emit('update:fee', parsed);
  emit('overrideFee', parsed);
}

function setFeePaidBy(method: 'cash' | 'debit_rekening') {
  emit('update:feePaidBy', method);
}
</script>

<style scoped>
.money-input-container {
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 100%;
}

.input-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  flex-wrap: wrap;
}

.field-col {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.nominal-col {
  flex: 1.4;
  min-width: 150px;
}

.admin-col {
  flex: 1;
  min-width: 120px;
}

.method-col {
  flex: 1.2;
  min-width: 150px;
}

.field-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.admin-label-wrapper {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.auto-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-primary);
  background: var(--color-primary-light);
  padding: 1px 6px;
  border-radius: var(--radius-chip);
}

.override-tag {
  font-size: 10px;
  font-weight: 700;
  color: var(--color-warning);
  background: var(--color-warning-subtle);
  padding: 1px 6px;
  border-radius: var(--radius-chip);
}

.input-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.currency-prefix {
  position: absolute;
  left: 12px;
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.input-box {
  width: 100%;
  height: 48px;
  padding: 0 12px 0 34px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 16px;
  font-weight: 700;
  outline: none;
  transition: border-color var(--transition-fast);
}

.input-box:focus {
  border-color: var(--border-focus);
}

.nominal-input {
  font-size: 18px;
  color: var(--color-primary-dark);
}

.toggle-group {
  display: flex;
  height: 48px;
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  padding: 3px;
  gap: 3px;
}

.toggle-btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  padding: 0 4px;
}

.toggle-btn.active {
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 700;
  box-shadow: 0 2px 6px rgba(5, 150, 105, 0.25);
}
</style>
