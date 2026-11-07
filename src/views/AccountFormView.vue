<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Tambah Akun Saldo</h2>
      </div>

      <form class="account-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <div class="form-group">
            <label class="form-label">Nama Akun (Wajib)</label>
            <input
              v-model="name"
              type="text"
              class="form-input"
              placeholder="Contoh: Kas Laci Shift, Bank BCA, DANA"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Kelompok Akun</label>
            <select v-model="type" class="form-select" required>
              <option value="kas">Kas (Uang Tunai Laci / Brankas)</option>
              <option value="bank">Bank (Rekening Bank)</option>
              <option value="ewallet">E-Wallet (DANA, OVO, GoPay, ShopeePay)</option>
              <option value="server_pulsa">Server Pulsa (catatan deposit)</option>
              <option value="provider_app">Aplikasi Provider (catatan agen resmi)</option>
            </select>
          </div>

          <div v-if="type !== 'kas'" class="form-group">
            <label class="form-label">Nomor Rekening / No. HP Akun</label>
            <input
              v-model="accountNo"
              type="text"
              class="form-input"
              placeholder="Nomor rekening bank atau nomor HP ewallet"
            />
          </div>

          <div v-if="type !== 'kas'" class="form-group">
            <label class="form-label">Nama Pemilik Akun</label>
            <input
              v-model="ownerName"
              type="text"
              class="form-input"
              placeholder="Nama pemilik rekening"
            />
          </div>

          <div class="form-group">
            <label class="form-label">Saldo Awal Catatan (Wajib, boleh Rp0)</label>
            <div class="input-prefix-wrapper">
              <span class="currency-prefix">Rp</span>
              <input
                type="text"
                inputmode="numeric"
                class="form-input with-prefix tabular-nums"
                :value="displayInitialBalance"
                placeholder="0"
                required
                @input="onBalanceInput"
              />
            </div>
            <span class="form-hint">
              Saldo awal dicatat sebagai saldo pembuka dan tidak dihitung sebagai transaksi pemasukan/laba.
            </span>
          </div>
        </div>

        <button type="submit" class="btn-submit" :disabled="isSubmitting || !name.trim()">
          {{ isSubmitting ? 'Menyimpan...' : 'Simpan Akun' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { accountService } from '../services/accountService';
import { parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';

const router = useRouter();

const name = ref('');
const type = ref<'kas' | 'bank' | 'ewallet' | 'server_pulsa' | 'provider_app'>('kas');
const accountNo = ref('');
const ownerName = ref('');
const initialBalance = ref<number>(0);
const errorMessage = ref('');
const isSubmitting = ref(false);

const displayInitialBalance = computed(() => {
  if (initialBalance.value === 0) return '0';
  return initialBalance.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onBalanceInput(e: Event) {
  const target = e.target as HTMLInputElement;
  initialBalance.value = parseRupiah(target.value);
}

async function handleSubmit() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    await accountService.addAccount({
      name: name.value.trim(),
      type: type.value,
      accountNo: accountNo.value.trim() || undefined,
      ownerName: ownerName.value.trim() || undefined,
      initialBalance: initialBalance.value,
    });
    router.replace('/accounts');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan akun saldo.';
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

.account-form {
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

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
}

.form-input,
.form-select {
  height: 48px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 15px;
  outline: none;
}

.input-prefix-wrapper {
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

.form-input.with-prefix {
  width: 100%;
  padding-left: 42px;
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
  color: #ffffff;
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
