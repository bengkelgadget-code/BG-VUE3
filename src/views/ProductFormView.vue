<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Tambah Produk Master</h2>
      </div>

      <form class="product-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <div class="form-group">
            <label class="form-label">Nama Produk (Wajib)</label>
            <input
              v-model="name"
              type="text"
              class="form-input"
              placeholder="Contoh: Voucher Telkomsel 10GB / Pulsa 25.000"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">Kategori Produk</label>
            <select v-model="category" class="form-select" required>
              <option value="voucher">Voucher Kuota (Stok Fisik)</option>
              <option value="perdana">Kartu Perdana (Stok Fisik)</option>
              <option value="aksesoris">Aksesoris / Charger / Kabel (Stok Fisik)</option>
              <option value="pulsa">Pulsa Reguler (Digital)</option>
              <option value="data">Paket Data (Digital)</option>
              <option value="token_pln">Token Listrik PLN (Digital)</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Operator / Brand</label>
              <input
                v-model="operator"
                type="text"
                class="form-input"
                placeholder="Telkomsel, Indosat, PLN..."
              />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Denominasi / Paket</label>
              <input
                v-model="denomination"
                type="text"
                class="form-input"
                placeholder="25.000 / 10GB"
              />
            </div>
          </div>

          <!-- Modal & Harga Jual (Integer Rupiah) -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Harga Modal (Beli)</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  type="text"
                  inputmode="numeric"
                  class="form-input with-prefix tabular-nums"
                  :value="displayModal"
                  placeholder="0"
                  required
                  @input="onModalInput"
                />
              </div>
            </div>

            <div class="form-group flex-1">
              <label class="form-label">Harga Jual</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  type="text"
                  inputmode="numeric"
                  class="form-input with-prefix tabular-nums"
                  :value="displayHargaJual"
                  placeholder="0"
                  required
                  @input="onHargaJualInput"
                />
              </div>
            </div>
          </div>

          <div class="margin-preview">
            <span>Estimasi Laba per Transaksi:</span>
            <span class="margin-amount money-display text-income">
              {{ formatRupiah(hargaJual - modal) }}
            </span>
          </div>

          <!-- Khusus Barang Fisik: Stok & Min Stok -->
          <div v-if="isPhysical" class="form-row mt-2">
            <div class="form-group flex-1">
              <label class="form-label">Stok Awal Fisik</label>
              <input
                v-model.number="stock"
                type="number"
                min="0"
                class="form-input tabular-nums"
                placeholder="0"
              />
            </div>
            <div class="form-group flex-1">
              <label class="form-label">Batas Peringatan Menipis</label>
              <input
                v-model.number="stockMin"
                type="number"
                min="0"
                class="form-input tabular-nums"
                placeholder="2"
              />
            </div>
          </div>
        </div>

        <button type="submit" class="btn-submit" :disabled="isSubmitting || !name.trim()">
          {{ isSubmitting ? 'Menyimpan...' : 'Simpan Produk Master' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { productService } from '../services/productService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';

const router = useRouter();
const authStore = useAuthStore();

const name = ref('');
const category = ref<'voucher' | 'perdana' | 'aksesoris' | 'pulsa' | 'data' | 'token_pln' | 'lainnya'>('voucher');
const operator = ref('');
const denomination = ref('');
const modal = ref<number>(0);
const hargaJual = ref<number>(0);
const stock = ref<number>(10);
const stockMin = ref<number>(2);

const errorMessage = ref('');
const isSubmitting = ref(false);

const isPhysical = computed(() =>
  category.value === 'voucher' || category.value === 'perdana' || category.value === 'aksesoris'
);

const displayModal = computed(() => {
  if (modal.value === 0) return '0';
  return modal.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

const displayHargaJual = computed(() => {
  if (hargaJual.value === 0) return '0';
  return hargaJual.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onModalInput(e: Event) {
  const target = e.target as HTMLInputElement;
  modal.value = parseRupiah(target.value);
}

function onHargaJualInput(e: Event) {
  const target = e.target as HTMLInputElement;
  hargaJual.value = parseRupiah(target.value);
}

async function handleSubmit() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    await productService.addProduct(
      {
        name: name.value.trim(),
        category: category.value,
        operator: operator.value.trim() || undefined,
        denomination: denomination.value.trim() || undefined,
        modal: modal.value,
        hargaJual: hargaJual.value,
        stock: isPhysical.value ? stock.value : null,
        stockMin: stockMin.value,
        isActive: true,
      },
      { actorUserId: authStore.currentUser?.id || 'system' }
    );
    router.replace('/masters');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan produk master.';
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

.product-form {
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

.margin-preview {
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
