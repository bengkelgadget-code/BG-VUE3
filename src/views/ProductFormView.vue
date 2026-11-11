<template>
  <AppScaffold>
    <div class="form-container">
      <div class="view-header">
        <button type="button" class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">{{ isEditMode ? 'Edit Produk Master' : 'Tambah Produk Master' }}</h2>
      </div>

      <form class="product-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <div class="card-section">
          <!-- 1. Kategori Produk (PALING ATAS) -->
          <div class="form-group">
            <label class="form-label" for="product-category">Kategori Produk</label>
            <select
              id="product-category"
              v-model="category"
              class="form-select"
              required
            >
              <option value="voucher">Voucher Kuota (Stok Fisik)</option>
              <option value="perdana">Kartu Perdana (Stok Fisik)</option>
              <option value="aksesoris">Aksesoris / Charger / Kabel (Stok Fisik)</option>
              <option value="pulsa">Pulsa Reguler (Digital)</option>
              <option value="data">Paket Data (Digital)</option>
              <option value="token_pln">Token Listrik PLN (Digital)</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>

          <!-- 2. Nama Produk (Wajib) -->
          <div class="form-group">
            <label class="form-label" for="product-name">Nama Produk (Wajib)</label>
            <input
              id="product-name"
              v-model="name"
              type="text"
              class="form-input"
              placeholder="Contoh: Voucher Telkomsel 10GB / Pulsa 25.000"
              required
            />
          </div>

          <!-- 3. Operator / Brand (Combobox Filterable + Tombol +) -->
          <div class="form-group">
            <label class="form-label">Operator / Brand</label>
            <div class="brand-combobox-wrapper">
              <div ref="brandDropdownRef" class="brand-input-container">
                <input
                  v-model="operatorInput"
                  type="text"
                  class="form-input brand-search-input"
                  placeholder="Ketik untuk filter / pilih brand..."
                  data-testid="brand-combobox-input"
                  autocomplete="off"
                  @focus="openBrandDropdown"
                  @input="handleBrandInput"
                />
                <button
                  type="button"
                  class="btn-dropdown-toggle"
                  aria-label="Buka daftar brand"
                  @click="toggleBrandDropdown"
                >
                  <ChevronDown class="chevron-icon" :class="{ rotated: isBrandDropdownOpen }" />
                </button>

                <!-- Dropdown Menu Brand -->
                <div
                  v-if="isBrandDropdownOpen"
                  class="brand-dropdown-menu"
                  data-testid="brand-dropdown-menu"
                >
                  <ul v-if="filteredBrands.length > 0" class="brand-list">
                    <li
                      v-for="b in filteredBrands"
                      :key="b.id"
                      class="brand-item"
                      :class="{ selected: operator === b.name }"
                      :data-testid="`brand-option-${b.id}`"
                      @click="selectBrand(b.name)"
                    >
                      <span class="brand-item-name">{{ b.name }}</span>
                      <button
                        type="button"
                        class="btn-delete-brand"
                        title="Hapus brand dari daftar"
                        :data-testid="`delete-brand-${b.id}`"
                        @click.stop="handleDeleteBrand(b)"
                      >
                        <Trash2 class="trash-icon" />
                      </button>
                    </li>
                  </ul>
                  <div v-else class="brand-empty-hint">
                    <span v-if="availableBrands.length === 0">
                      Daftar brand kosong. Ketik nama brand lalu ketuk tombol <strong>+</strong> di samping.
                    </span>
                    <span v-else>
                      Tidak ada brand cocok "{{ operatorInput }}". Ketuk <strong>+</strong> untuk menambahkan.
                    </span>
                  </div>
                </div>
              </div>

              <!-- Tombol + untuk Tambah Brand Baru -->
              <button
                type="button"
                class="btn-add-brand"
                title="Tambah sebagai brand baru"
                data-testid="btn-add-brand"
                @click="handleAddBrand"
              >
                <Plus class="plus-icon" />
              </button>
            </div>

            <!-- Pesan Feedback Brand -->
            <span v-if="brandFeedback" class="brand-feedback" :class="brandFeedbackType">
              {{ brandFeedback }}
            </span>
          </div>

          <!-- 4. Harga Modal (Beli) + Harga Jual (Berdampingan) -->
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label" for="product-modal">Harga Modal (Beli)</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  id="product-modal"
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
              <label class="form-label" for="product-harga-jual">Harga Jual</label>
              <div class="input-prefix-wrapper">
                <span class="currency-prefix">Rp</span>
                <input
                  id="product-harga-jual"
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

          <!-- 5. Estimasi Laba per Transaksi -->
          <div class="margin-preview">
            <span>Estimasi Laba per Transaksi:</span>
            <span class="margin-amount money-display text-income">
              {{ formatRupiah(hargaJual - modal) }}
            </span>
          </div>

          <!-- 6. Stok Awal Fisik + Batas Peringatan Menipis (HANYA bila kategori fisik) -->
          <div v-if="isPhysical" class="form-row mt-2">
            <div class="form-group flex-1">
              <label class="form-label" for="product-stock">Stok Awal Fisik</label>
              <input
                id="product-stock"
                v-model.number="stock"
                type="number"
                min="0"
                class="form-input tabular-nums"
                placeholder="0"
              />
            </div>
            <div class="form-group flex-1">
              <label class="form-label" for="product-stock-min">Batas Peringatan Menipis</label>
              <input
                id="product-stock-min"
                v-model.number="stockMin"
                type="number"
                min="0"
                class="form-input tabular-nums"
                placeholder="2"
              />
            </div>
          </div>
        </div>

        <!-- Action Buttons -->
        <div v-if="isEditMode" class="form-actions-edit">
          <button
            type="submit"
            class="btn-submit btn-update"
            :disabled="isSubmitting || !name.trim()"
            data-testid="btn-update-product"
          >
            {{ isSubmitting ? 'Memperbarui...' : 'Update Produk' }}
          </button>

          <button
            type="button"
            class="btn-delete-product"
            :disabled="isSubmitting || isDeleting"
            data-testid="btn-delete-product"
            @click="showDeleteConfirm = true"
          >
            <Trash2 class="btn-action-icon" />
            <span>Hapus Produk</span>
          </button>
        </div>

        <button
          v-else
          type="submit"
          class="btn-submit"
          :disabled="isSubmitting || !name.trim()"
          data-testid="btn-save-product"
        >
          {{ isSubmitting ? 'Menyimpan...' : 'Simpan Produk Master' }}
        </button>
      </form>
    </div>

    <!-- Modal Konfirmasi Hapus Produk -->
    <div
      v-if="showDeleteConfirm"
      class="modal-overlay"
      data-testid="delete-confirm-modal"
      @click.self="showDeleteConfirm = false"
    >
      <div class="modal-box">
        <div class="modal-danger-header">
          <div class="modal-icon-danger">
            <AlertTriangle class="icon-warning" />
          </div>
          <div>
            <h3 class="modal-title">Hapus Produk?</h3>
            <p class="modal-desc">
              Apakah Anda yakin ingin menghapus produk <strong>"{{ name }}"</strong> dari Master Produk? Tindakan ini tidak dapat dibatalkan.
            </p>
          </div>
        </div>

        <div v-if="deleteError" class="error-banner mb-3">
          {{ deleteError }}
        </div>

        <div class="modal-actions">
          <button
            type="button"
            class="btn-modal-cancel"
            :disabled="isDeleting"
            @click="showDeleteConfirm = false"
          >
            Batal
          </button>
          <button
            type="button"
            class="btn-modal-danger"
            :disabled="isDeleting"
            data-testid="btn-confirm-delete"
            @click="handleDeleteProduct"
          >
            {{ isDeleting ? 'Menghapus...' : 'Ya, Hapus' }}
          </button>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { ChevronDown, Plus, Trash2, AlertTriangle } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import { productService } from '../services/productService';
import { brandService } from '../services/brandService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';
import type { Brand } from '../db/types';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const productId = computed(() => (route.params['id'] as string) || '');
const isEditMode = computed(() => Boolean(productId.value));

const showDeleteConfirm = ref(false);
const isDeleting = ref(false);
const deleteError = ref('');

// Fields form
const name = ref('');
const category = ref<'voucher' | 'perdana' | 'aksesoris' | 'pulsa' | 'data' | 'token_pln' | 'lainnya'>('voucher');
const operator = ref('');
const operatorInput = ref('');
const modal = ref<number>(0);
const hargaJual = ref<number>(0);
const stock = ref<number>(10);
const stockMin = ref<number>(2);

const errorMessage = ref('');
const isSubmitting = ref(false);

// Brand Combobox state
const availableBrands = ref<Brand[]>([]);
const isBrandDropdownOpen = ref(false);
const brandDropdownRef = ref<HTMLElement | null>(null);
const brandFeedback = ref('');
const brandFeedbackType = ref<'success' | 'error'>('success');
let feedbackTimeout: ReturnType<typeof setTimeout> | null = null;

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

const filteredBrands = computed(() => {
  const query = operatorInput.value.trim().toLowerCase();
  if (!query) return availableBrands.value;
  return availableBrands.value.filter((b) => b.name.toLowerCase().includes(query));
});

function setBrandFeedback(msg: string, type: 'success' | 'error' = 'success') {
  brandFeedback.value = msg;
  brandFeedbackType.value = type;
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
  feedbackTimeout = setTimeout(() => {
    brandFeedback.value = '';
  }, 3000);
}

async function loadBrands() {
  availableBrands.value = await brandService.listBrands();
}

function openBrandDropdown() {
  isBrandDropdownOpen.value = true;
}

function toggleBrandDropdown() {
  isBrandDropdownOpen.value = !isBrandDropdownOpen.value;
}

function handleBrandInput() {
  isBrandDropdownOpen.value = true;
  operator.value = operatorInput.value.trim();
}

function selectBrand(brandName: string) {
  operator.value = brandName;
  operatorInput.value = brandName;
  isBrandDropdownOpen.value = false;
}

async function handleAddBrand() {
  const brandName = operatorInput.value.trim();
  if (!brandName || brandName.length < 2) {
    setBrandFeedback('Nama brand minimal 2 karakter.', 'error');
    return;
  }

  try {
    const newBrand = await brandService.addBrand(brandName);
    await loadBrands();
    selectBrand(newBrand.name);
    setBrandFeedback(`Brand "${newBrand.name}" berhasil ditambahkan!`, 'success');
  } catch (err: unknown) {
    if (err instanceof Error) {
      setBrandFeedback(err.message, 'error');
    } else {
      setBrandFeedback('Gagal menambahkan brand.', 'error');
    }
  }
}

async function handleDeleteBrand(brand: Brand) {
  try {
    await brandService.removeBrand(brand.id);
    await loadBrands();
    if (operator.value === brand.name) {
      operator.value = '';
      operatorInput.value = '';
    }
    setBrandFeedback(`Brand "${brand.name}" telah dihapus.`, 'success');
  } catch (err: unknown) {
    if (err instanceof Error) {
      setBrandFeedback(err.message, 'error');
    }
  }
}

function handleClickOutside(e: MouseEvent) {
  if (brandDropdownRef.value && !brandDropdownRef.value.contains(e.target as Node)) {
    isBrandDropdownOpen.value = false;
  }
}

function onModalInput(e: Event) {
  const target = e.target as HTMLInputElement;
  modal.value = parseRupiah(target.value);
}

function onHargaJualInput(e: Event) {
  const target = e.target as HTMLInputElement;
  hargaJual.value = parseRupiah(target.value);
}

async function loadProductData() {
  if (!productId.value) return;
  try {
    const prod = await productService.getProduct(productId.value);
    if (!prod) {
      errorMessage.value = 'Produk tidak ditemukan.';
      return;
    }
    name.value = prod.name;
    category.value = prod.category as typeof category.value;
    operator.value = prod.operator || '';
    operatorInput.value = prod.operator || '';
    modal.value = prod.modal;
    hargaJual.value = prod.hargaJual;
    stock.value = prod.stock ?? 0;
    stockMin.value = prod.stockMin ?? 2;
  } catch (err: unknown) {
    errorMessage.value = err instanceof Error ? err.message : 'Gagal memuat produk.';
  }
}

async function handleSubmit() {
  errorMessage.value = '';
  isSubmitting.value = true;
  try {
    if (isEditMode.value) {
      await productService.updateProduct(
        productId.value,
        {
          name: name.value.trim(),
          category: category.value,
          operator: operator.value.trim() || undefined,
          modal: modal.value,
          hargaJual: hargaJual.value,
          stock: isPhysical.value ? stock.value : null,
          stockMin: stockMin.value,
        },
        { actorUserId: authStore.currentUser?.id || 'system' }
      );
    } else {
      await productService.addProduct(
        {
          name: name.value.trim(),
          category: category.value,
          operator: operator.value.trim() || undefined,
          denomination: undefined, // Denominasi dihapus dari form, tetap kompatibel
          modal: modal.value,
          hargaJual: hargaJual.value,
          stock: isPhysical.value ? stock.value : null,
          stockMin: stockMin.value,
          isActive: true,
        },
        { actorUserId: authStore.currentUser?.id || 'system' }
      );
    }
    await router.replace('/masters');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = isEditMode.value
        ? 'Gagal memperbarui produk master.'
        : 'Gagal menyimpan produk master.';
    }
  } finally {
    isSubmitting.value = false;
  }
}

async function handleDeleteProduct() {
  if (!productId.value) return;
  deleteError.value = '';
  isDeleting.value = true;
  try {
    await productService.deleteProduct(productId.value, {
      actorUserId: authStore.currentUser?.id || 'system',
    });
    showDeleteConfirm.value = false;
    await router.replace('/masters');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      deleteError.value = err.message;
    } else {
      deleteError.value = 'Gagal menghapus produk master.';
    }
  } finally {
    isDeleting.value = false;
  }
}

onMounted(async () => {
  await loadBrands();
  await loadProductData();
  if (typeof document !== 'undefined') {
    document.addEventListener('click', handleClickOutside);
  }
});

onUnmounted(() => {
  if (typeof document !== 'undefined') {
    document.removeEventListener('click', handleClickOutside);
  }
  if (feedbackTimeout) clearTimeout(feedbackTimeout);
});
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
  padding: 4px 8px;
  border-radius: 6px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
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

/* Form groups and labels with wrapping & overflow protection */
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.form-row {
  display: flex;
  gap: 10px;
}

.flex-1 {
  flex: 1;
  min-width: 0;
}

.form-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-main);
  white-space: normal;
  overflow-wrap: break-word;
  word-break: break-word;
}

.form-input,
.form-select {
  width: 100%;
  height: 48px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 15px;
  outline: none;
  box-sizing: border-box;
}

.form-input:focus,
.form-select:focus {
  border-color: var(--color-primary);
}

/* Brand Combobox */
.brand-combobox-wrapper {
  display: flex;
  gap: 8px;
  align-items: center;
  width: 100%;
}

.brand-input-container {
  position: relative;
  flex: 1;
  min-width: 0;
}

.brand-search-input {
  padding-right: 38px;
}

.btn-dropdown-toggle {
  position: absolute;
  right: 8px;
  top: 50%;
  transform: translateY(-50%);
  background: transparent;
  border: none;
  padding: 6px;
  cursor: pointer;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
}

.chevron-icon {
  width: 18px;
  height: 18px;
  transition: transform var(--transition-fast);
}

.chevron-icon.rotated {
  transform: rotate(180deg);
}

.btn-add-brand {
  width: 48px;
  height: 48px;
  flex-shrink: 0;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background-color var(--transition-fast);
}

.btn-add-brand:hover {
  background: var(--color-primary);
  color: var(--color-white);
}

.plus-icon {
  width: 20px;
  height: 20px;
}

.brand-dropdown-menu {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  max-height: 220px;
  overflow-y: auto;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  box-shadow: 0 8px 20px rgba(0, 0, 0, 0.12);
  z-index: 50;
}

.brand-list {
  list-style: none;
  margin: 0;
  padding: 4px 0;
}

.brand-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 14px;
  cursor: pointer;
  font-size: 14px;
  color: var(--text-main);
  transition: background-color var(--transition-fast);
}

.brand-item:hover,
.brand-item.selected {
  background: var(--surface-card-subtle);
  color: var(--color-primary);
  font-weight: 600;
}

.btn-delete-brand {
  background: transparent;
  border: none;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}

.btn-delete-brand:hover {
  color: var(--color-danger);
  background: var(--color-danger-subtle);
}

.trash-icon {
  width: 15px;
  height: 15px;
}

.brand-empty-hint {
  padding: 12px 14px;
  font-size: 12px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.brand-feedback {
  font-size: 12px;
  font-weight: 600;
  margin-top: 2px;
}

.brand-feedback.success {
  color: var(--color-income);
}

.brand-feedback.error {
  color: var(--color-danger);
}

/* Prefix wrapper for Currency */
.input-prefix-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  width: 100%;
}

.currency-prefix {
  position: absolute;
  left: 14px;
  font-weight: 700;
  color: var(--text-secondary);
  pointer-events: none;
}

.form-input.with-prefix {
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
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.form-actions-edit {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-top: 4px;
}

.btn-delete-product {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 48px;
  background: transparent;
  color: #ef4444;
  border: 1px solid #fca5a5;
  border-radius: var(--radius-btn);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-delete-product:hover:not(:disabled) {
  background: #fef2f2;
  border-color: #ef4444;
}

.btn-delete-product:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-action-icon {
  width: 18px;
  height: 18px;
}

/* Modal Konfirmasi Hapus */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.modal-box {
  background: var(--surface-card);
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 400px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.modal-danger-header {
  display: flex;
  gap: 14px;
  align-items: flex-start;
}

.modal-icon-danger {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: #fee2e2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.icon-warning {
  width: 22px;
  height: 22px;
  color: #dc2626;
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 4px 0;
}

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn-modal-cancel {
  padding: 10px 18px;
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  border-radius: var(--radius-btn);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-modal-danger {
  padding: 10px 20px;
  background: #dc2626;
  color: #ffffff;
  border: none;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-modal-danger:hover:not(:disabled) {
  background: #b91c1c;
}

.btn-modal-danger:disabled,
.btn-modal-cancel:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Responsiveness on screens <= 380px (e.g. 360px phones) */
@media (max-width: 380px) {
  .form-row {
    flex-direction: column;
    gap: 12px;
  }
}
</style>
