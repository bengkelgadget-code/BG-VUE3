<template>
  <AppScaffold title="Tambah Transaksi">
    <div class="add-tx-container">
      <!-- Header Ringkas -->
      <div class="view-header">
        <h1 class="page-title">Transaksi Baru</h1>
        <span class="tx-time">{{ currentWitaTime }} WITA</span>
      </div>

      <!-- Peringatan Jika Shift Belum Dibuka -->
      <div v-if="!activeShiftId" class="shift-warning-banner">
        <AlertCircle class="warn-icon" />
        <div class="warn-content">
          <span class="warn-title">Shift Belum Dibuka</span>
          <span class="warn-desc">Buka shift kasir terlebih dahulu untuk mencatat transaksi konter.</span>
        </div>
        <router-link to="/shifts" class="btn-warn-action">Buka Shift</router-link>
      </div>

      <form v-else class="tx-form" @submit.prevent="handleSubmit">
        <!-- Error Banner Form -->
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <!-- 1. Pilihan Jenis Layanan (Dropdown Searchable / Filterable) -->
        <div class="form-section">
          <label class="section-label" for="service-combobox-trigger">Pilih Jenis Layanan</label>
          <div ref="comboboxContainerRef" class="service-combobox-container">
            <!-- Trigger Button -->
            <button
              id="service-combobox-trigger"
              ref="layananTriggerRef"
              type="button"
              class="service-combobox-trigger"
              :class="{ open: isDropdownOpen }"
              aria-haspopup="listbox"
              :aria-expanded="isDropdownOpen"
              data-testid="service-dropdown-trigger"
              @click="toggleDropdown"
              @keydown.down.prevent="openDropdown"
              @keydown.enter.prevent="toggleDropdown"
            >
              <div class="trigger-selected">
                <component :is="selectedServiceObj?.icon" class="s-icon" />
                <span class="s-label">{{ selectedServiceObj?.label || 'Pilih Layanan' }}</span>
              </div>
              <ChevronDown class="chevron-icon" :class="{ rotated: isDropdownOpen }" />
            </button>

            <!-- Dropdown Menu -->
            <div
              v-if="isDropdownOpen"
              class="service-dropdown-menu"
              role="listbox"
              data-testid="service-dropdown-menu"
            >
              <div class="dropdown-search-wrapper">
                <Search class="search-icon" />
                <input
                  ref="searchInputRef"
                  v-model="searchQuery"
                  type="text"
                  class="dropdown-search-input"
                  placeholder="Cari layanan..."
                  data-testid="input-cari-layanan"
                  @keydown.down.prevent="moveHighlight(1)"
                  @keydown.up.prevent="moveHighlight(-1)"
                  @keydown.enter.prevent="selectHighlighted"
                  @keydown.esc.prevent="closeDropdown"
                />
              </div>

              <ul class="service-options-list">
                <li
                  v-for="(s, index) in filteredServices"
                  :key="s.code"
                  role="option"
                  :aria-selected="layanan === s.code"
                  class="service-option-item"
                  :class="{
                    active: layanan === s.code,
                    highlighted: index === highlightedIndex,
                  }"
                  :data-testid="`service-option-${s.code}`"
                  @click="onSelectOption(s.code)"
                  @mouseenter="highlightedIndex = index"
                >
                  <component :is="s.icon" class="s-icon-sm" />
                  <span class="s-option-label">{{ s.label }}</span>
                  <Check v-if="layanan === s.code" class="check-icon" />
                </li>
                <li v-if="filteredServices.length === 0" class="no-options-item">
                  Tidak ada layanan yang cocok
                </li>
              </ul>
            </div>
          </div>
        </div>

        <!-- 2. Detail Cascading Sesuai Jenis Layanan -->
        <div class="form-section card-section">
          <!-- Layanan Jasa Transfer -->
          <div v-if="layanan === 'jasa_transfer'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Nama Bank & No. Rekening Tujuan</label>
              <input
                ref="referenceNoRef"
                v-model="referenceNo"
                type="text"
                class="form-input"
                placeholder="Contoh: BCA 123456789 a.n. Budi"
                @keydown.enter.prevent="focusElement(moneyInputRef)"
              />
            </div>
          </div>

          <!-- Layanan Transfer / Tarik Tunai / Top Up / PPOB -->
          <div v-if="['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">
                {{ layanan === 'tarik_tunai' ? 'Rekening Konter Penerima Transfer' : 'Sumber Dana Konter' }}
              </label>
              <select
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                class="form-select"
                required
                @change="onSourceAccountChanged"
              >
                <option v-if="layanan === 'tarik_tunai'" disabled value="">-- Pilih Kas / Rekening Bank --</option>
                <option v-else disabled value="">-- Pilih Akun Bank / E-Wallet --</option>
                <option
                  v-for="acc in (layanan === 'tarik_tunai' ? availableTarikTunaiSourceAccounts : availableBankAccounts)"
                  :key="acc.id"
                  :value="acc.id"
                >
                  {{ acc.name }} (Saldo: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>

            <div v-if="layanan === 'transfer'" class="form-group">
              <label class="form-label">Nama Bank & No. Rekening Tujuan</label>
              <input
                ref="referenceNoRef"
                v-model="referenceNo"
                type="text"
                class="form-input"
                placeholder="Contoh: BCA 123456789 a.n. Budi"
                @keydown.enter.prevent="focusElement(moneyInputRef)"
              />
            </div>

            <div v-if="layanan === 'topup_ewallet'" class="form-group">
              <label class="form-label">Nomor HP / Akun Tujuan</label>
              <input
                ref="referenceNoRef"
                v-model="referenceNo"
                type="tel"
                class="form-input"
                placeholder="Contoh: DANA 08123456789"
                @keydown.enter.prevent="focusElement(moneyInputRef)"
              />
            </div>

            <div v-if="layanan === 'ppob'" class="form-group">
              <label class="form-label">ID Pelanggan / Nomor Tagihan</label>
              <input
                ref="referenceNoRef"
                v-model="referenceNo"
                type="text"
                class="form-input"
                placeholder="Nomor kontrak / ID tagihan"
                @keydown.enter.prevent="focusElement(moneyInputRef)"
              />
            </div>
          </div>

          <!-- Layanan Barang Fisik (Voucher / Perdana / ACC) -->
          <div v-else-if="currentLayananDef?.group === 'penjualan' && !currentLayananDef.needsSourceAccount" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Pilih Barang dari Master Produk</label>
              <input
                v-model="productFilterQuery"
                type="text"
                class="form-input mb-2"
                placeholder="Cari produk..."
                data-testid="filter-physical-product"
              />
              <select
                ref="productSelectRef"
                v-model="selectedProductId"
                class="form-select"
                required
                @change="onProductSelected"
              >
                <option disabled value="">-- Pilih Produk --</option>
                <option v-for="p in displayedPhysicalProducts" :key="p.id" :value="p.id">
                  {{ p.name }} (Harga: {{ formatRupiah(p.hargaJual) }} | Stok: {{ p.stock ?? 0 }})
                </option>
              </select>
            </div>
          </div>

          <!-- Layanan Digital (Pulsa / Paket Data / Token PLN / Game) -->
          <div v-else-if="currentLayananDef?.group === 'penjualan' && currentLayananDef.needsSourceAccount" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Akun Server Pulsa Catatan</label>
              <select
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                class="form-select"
                required
                @change="onSourceAccountChanged"
              >
                <option disabled value="">-- Pilih Server Pulsa --</option>
                <option v-for="acc in serverAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} (Saldo catatan: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">
                Nomor Tujuan / ID Pelanggan
                <span v-if="layanan === 'pulsa'" class="optional-tag">(Opsional)</span>
              </label>
              <input
                ref="referenceNoRef"
                v-model="referenceNo"
                type="tel"
                class="form-input"
                :placeholder="layanan === 'pulsa' ? '0812xxxx (opsional)' : (layanan === 'game' ? 'ID Game / Akun Tujuan' : (layanan === 'token_pln' ? 'No. Meter / ID Pelanggan' : '0812xxxx'))"
                :required="layanan !== 'pulsa'"
                @keydown.enter.prevent="onReferenceNoEnter"
              />
            </div>

            <div class="form-group">
              <label class="form-label">Pilih Produk Digital dari Master</label>
              <input
                v-model="productFilterQuery"
                type="text"
                class="form-input mb-2"
                placeholder="Cari produk..."
                data-testid="filter-digital-product"
              />
              <select
                ref="productSelectRef"
                v-model="selectedProductId"
                class="form-select"
                required
                @change="onProductSelected"
              >
                <option disabled value="">-- Pilih Produk Master --</option>
                <option v-for="p in displayedDigitalProducts" :key="p.id" :value="p.id">
                  {{ p.label }}
                </option>
              </select>
              <span v-if="displayedDigitalProducts.length === 0" class="form-hint-warning">
                Belum ada produk digital. Minta Owner/Admin mengisi Master Produk atau menyinkronkan katalog dari Master Produk.
              </span>
            </div>
          </div>

          <!-- Layanan Operasional -->
          <div v-else-if="layanan === 'operasional'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana Operasional</label>
              <select
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                class="form-select"
                required
                @change="onSourceAccountChanged"
              >
                <option disabled value="">-- Pilih Akun Pengeluaran --</option>
                <option v-for="acc in activeAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} (Saldo: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Keterangan Pengeluaran</label>
              <input
                ref="noteRef"
                v-model="note"
                type="text"
                class="form-input"
                placeholder="Contoh: Beli kertas struk / bayar listrik"
                required
                @keydown.enter.prevent="focusElement(moneyInputRef)"
              />
            </div>
          </div>
        </div>

        <!-- 3. Baris Nominal Pokok + Biaya Admin + Bayar Admin (Satu Baris) -->
        <div class="form-section card-section">
          <MoneyInput
            ref="moneyInputRef"
            v-model="nominal"
            v-model:fee="fee"
            v-model:feePaidBy="feePaidBy"
            :hide-admin="!currentLayananDef?.hasFee"
            :hide-fee-paid-by="!currentLayananDef?.hasFeePaidBy"
            :is-auto-fee="Boolean(matchedRule && !feeManualOverride)"
            :fee-manual-override="feeManualOverride"
            @update:model-value="onNominalChanged"
            @override-fee="onFeeOverridden"
            @enter="onNominalEnter"
            @admin-enter="onAdminEnter"
          />

          <!-- Banner Tarif / Peringatan Tarif Belum Ada -->
          <FeeBadge
            v-if="currentLayananDef?.hasFee"
            :no-rule-banner="nominal > 0 && !matchedRule && fee === 0"
            :rule-name="matchedRule ? `Admin Rp ${fee.toLocaleString('id-ID')}` : undefined"
          />

          <!-- Dropdown Diterima Di (b31) -->
          <div v-if="hasPaymentAccount" class="form-group mt-3" data-testid="payment-account-group">
            <label class="form-label" for="payment-account-select">Diterima Di</label>
            <select
              id="payment-account-select"
              ref="paymentAccountRef"
              v-model="paymentAccountId"
              class="form-select"
              data-testid="select-payment-account"
              required
            >
              <option disabled value="">-- Pilih Akun Penerima --</option>
              <option v-for="acc in availablePaymentAccounts" :key="acc.id" :value="acc.id">
                {{ getPaymentOptionLabel(acc) }}
              </option>
            </select>
          </div>
        </div>

        <!-- 4. Status Pembayaran (Lunas / Hutang) -->
        <div v-if="currentLayananDef?.supportsHutang" class="form-section card-section">
          <div class="form-group">
            <label class="form-label">Status Bayar</label>
            <div class="status-toggle">
              <button
                ref="statusLunasBtnRef"
                type="button"
                class="status-btn"
                :class="{ active: paymentStatus === 'lunas' }"
                @click="onPaymentStatusChanged('lunas')"
              >
                Lunas
              </button>
              <button
                ref="statusHutangBtnRef"
                type="button"
                class="status-btn"
                :class="{ active: paymentStatus === 'hutang' }"
                @click="onPaymentStatusChanged('hutang')"
              >
                Hutang
              </button>
            </div>
          </div>

          <!-- Jika Status Bayar = Hutang: Wajib Pilih / Isi Pelanggan -->
          <div v-if="paymentStatus === 'hutang' && layanan !== 'jasa_transfer'" class="debt-box">
            <label class="form-label text-warning">Pilih Pelanggan (Wajib)</label>
            <div class="customer-picker">
              <select
                ref="customerSelectRef"
                v-model="selectedCustomerId"
                class="form-select"
                required
                @change="onCustomerChanged"
              >
                <option disabled value="">-- Pilih Pelanggan Terdaftar --</option>
                <option v-for="c in customerList" :key="c.id" :value="c.id">
                  {{ c.name }} {{ c.phone ? `(${c.phone})` : '' }}
                </option>
              </select>
            </div>
            <span class="form-hint">Pelanggan baru dapat ditambahkan di menu Master Pelanggan.</span>
          </div>

          <!-- Pelanggan Opsional untuk Jasa Transfer -->
          <div v-if="layanan === 'jasa_transfer'" class="form-group">
            <label class="form-label">Nama Pelanggan (Opsional)</label>
            <select
              v-model="selectedCustomerId"
              class="form-select"
              data-testid="select-customer-jasa-transfer"
            >
              <option value="">-- Tanpa Pelanggan / Pelanggan Umum --</option>
              <option v-for="c in customerList" :key="c.id" :value="c.id">
                {{ c.name }} {{ c.phone ? `(${c.phone})` : '' }}
              </option>
            </select>
          </div>

          <div class="form-group mt-2">
            <label class="form-label">Catatan Tambahan (Opsional)</label>
            <input
              ref="noteRef"
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Catatan kecil / keterangan"
              @keydown.enter.prevent="focusElement(submitBtnRef)"
            />
          </div>
        </div>

        <!-- Tanggal Transaksi & Alasan Koreksi (Owner/Admin) -->
        <div class="form-section card-section">
          <div class="form-group">
            <div class="date-header-row">
              <label class="form-label">Tanggal Transaksi (WITA)</label>
              <span v-if="authStore.isAdmin" class="badge-role-tag admin-tag">Owner / Admin</span>
              <span v-else class="badge-role-tag kasir-tag">Otomatis (Kasir)</span>
            </div>

            <!-- Input Tanggal: aktif untuk Owner/Admin, disabled/readonly untuk Kasir -->
            <input
              v-if="authStore.isAdmin"
              v-model="transactionDateStr"
              type="date"
              :max="todayWita"
              class="form-input date-input"
              data-testid="input-tanggal-transaksi"
            />
            <input
              v-else
              :value="todayWita"
              type="date"
              disabled
              class="form-input date-input disabled-input"
              data-testid="input-tanggal-transaksi"
            />
            <span v-if="!authStore.isAdmin" class="form-hint">
              Kasir mencatat transaksi menggunakan tanggal dan waktu sistem saat ini.
            </span>
          </div>

          <!-- Alasan Perubahan Tanggal (Wajib jika diubah dari default oleh Owner/Admin) -->
          <div v-if="authStore.isAdmin && isDateChanged" class="form-group mt-2">
            <label class="form-label text-warning">Alasan Perubahan Tanggal (Wajib)</label>
            <input
              v-model="dateChangeReason"
              type="text"
              class="form-input"
              placeholder="Contoh: Transaksi susulan kemarin sore yang belum sempat diinput"
              data-testid="input-alasan-tanggal"
              required
            />
            <span class="form-hint text-warning">
              Pencatatan tanggal susulan/koreksi wajib mencantumkan alasan untuk jejak audit.
            </span>
          </div>
        </div>

        <!-- 5. Tombol Simpan Sticky di Bawah (Muncul hanya bila ada isi nominal / produk) -->
        <div v-if="showSaveBar" class="sticky-footer" data-testid="sticky-footer-bar">
          <button
            ref="submitBtnRef"
            type="submit"
            class="btn-submit-tx"
            :disabled="isSubmitting || nominal <= 0"
          >
            <span v-if="!isSubmitting">Simpan Transaksi</span>
            <span v-else>Menyimpan...</span>
          </button>
        </div>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  AlertCircle,
  ChevronDown,
  Search,
  Check,
} from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import MoneyInput from '../components/MoneyInput.vue';
import FeeBadge from '../components/FeeBadge.vue';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { getTodayWitaString, parseWitaDateToEpoch } from '../utils/datePeriod';
import { db } from '../db/database';
import { feeRuleService } from '../services/feeRuleService';
import { transactionService } from '../services/transactionService';
import type { Account, Product, Customer, AdminFeeRule, ProductCatalogEntry, ProductCategory } from '../db/types';
import { AppError } from '../core/errors';
import { staffLayanan, getLayananDef } from '../core/layanan';
import { sortProductsForLayanan } from '../utils/productSort';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const currentWitaTime = ref(formatTanggalWita(Date.now(), { hour: '2-digit', minute: '2-digit' }));
const activeShiftId = ref<string | null>(null);

// Tanggal Transaksi
const todayWita = getTodayWitaString();
const transactionDateStr = ref<string>(todayWita);
const dateChangeReason = ref<string>('');
const isDateChanged = computed(() => transactionDateStr.value !== todayWita);

// Form States
const layanan = ref<string>('transfer');
const sourceAccountId = ref<string>('');
const destAccountId = ref<string>('');
const paymentAccountId = ref<string>('');
const selectedProductId = ref<string>('');
const selectedCustomerId = ref<string>('');
const nominal = ref<number>(0);
const fee = ref<number>(0);
const feePaidBy = ref<'cash' | 'debit_rekening'>('cash');
const feeManualOverride = ref<boolean>(false);
const paymentStatus = ref<'lunas' | 'hutang'>('lunas');
const referenceNo = ref<string>('');
const note = ref<string>('');

const paymentAccountRef = ref<HTMLSelectElement | null>(null);

const currentLayananDef = computed(() => getLayananDef(layanan.value));

const hasPaymentAccount = computed(() => {
  return Boolean(currentLayananDef.value && currentLayananDef.value.paymentRule !== 'none');
});

const availablePaymentAccounts = computed<Account[]>(() => {
  if (!hasPaymentAccount.value) return [];
  const rule = currentLayananDef.value?.paymentRule;
  if (rule === 'kas') {
    return activeAccounts.value.filter((a) => a.type === 'kas');
  }
  if (rule === 'kas-bank') {
    return activeAccounts.value.filter((a) => a.type === 'bank' || a.type === 'kas');
  }
  return activeAccounts.value.filter(
    (a) => a.type === 'kas' || (a.type === 'bank' && a.name.toLowerCase().includes('mandiri'))
  );
});

function getPaymentOptionLabel(acc: Account): string {
  if (layanan.value !== 'tarik_tunai' && acc.type === 'bank' && acc.name.toLowerCase().includes('mandiri')) {
    return 'QR Mandiri (masuk ke Rekening Mandiri)';
  }
  return acc.name;
}

function initDefaultPaymentAccount() {
  if (!hasPaymentAccount.value) {
    paymentAccountId.value = '';
    return;
  }
  const options = availablePaymentAccounts.value;
  const kasKecil = options.find((a) => a.type === 'kas' && a.name.toLowerCase() === 'kas kecil');
  if (kasKecil) {
    paymentAccountId.value = kasKecil.id;
  } else {
    const firstKas = options.find((a) => a.type === 'kas');
    if (firstKas) {
      paymentAccountId.value = firstKas.id;
    } else {
      paymentAccountId.value = options[0]?.id || '';
    }
  }
}

const matchedRule = ref<AdminFeeRule | null>(null);
const errorMessage = ref<string>('');
const isSubmitting = ref<boolean>(false);

// Master Data Lists
const activeAccounts = ref<Account[]>([]);
const accountBalances = ref<Record<string, number>>({});
const productList = ref<Product[]>([]);
const catalogList = ref<ProductCatalogEntry[]>([]);
const customerList = ref<Customer[]>([]);

// Dropdown Combobox State
const isDropdownOpen = ref(false);
const searchQuery = ref('');
const highlightedIndex = ref(0);
const comboboxContainerRef = ref<HTMLElement | null>(null);
const layananTriggerRef = ref<HTMLButtonElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

// Element Refs for Auto-Focus
const sourceAccountRef = ref<HTMLSelectElement | null>(null);
const productSelectRef = ref<HTMLSelectElement | null>(null);
const referenceNoRef = ref<HTMLInputElement | null>(null);
const moneyInputRef = ref<InstanceType<typeof MoneyInput> | null>(null);
const statusLunasBtnRef = ref<HTMLButtonElement | null>(null);
const statusHutangBtnRef = ref<HTMLButtonElement | null>(null);
const customerSelectRef = ref<HTMLSelectElement | null>(null);
const noteRef = ref<HTMLInputElement | null>(null);
const submitBtnRef = ref<HTMLButtonElement | null>(null);

const primaryServices = staffLayanan();

const selectedServiceObj = computed(() => {
  return primaryServices.find((s) => s.code === layanan.value) || currentLayananDef.value || primaryServices[0];
});

const filteredServices = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return primaryServices;
  return primaryServices.filter((s) => {
    if (s.label.toLowerCase().includes(q)) return true;
    if (s.code.toLowerCase().includes(q)) return true;
    return s.keywords.some((k) => k.toLowerCase().includes(q));
  });
});

const availableBankAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'bank' || a.type === 'ewallet' || a.type === 'kas')
);

const availableTarikTunaiSourceAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'kas' || a.type === 'bank')
);

const serverAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'server_pulsa')
);

const availablePhysicalProducts = computed(() => {
  const cats = currentLayananDef.value?.productCategories ?? [];
  const filtered = productList.value.filter(
    (p) => p.isActive && cats.includes(p.category)
  );
  return sortProductsForLayanan(filtered, layanan.value);
});

export interface DigitalProductDisplay {
  id: string;
  name: string;
  hargaJual: number;
  isCatalog: boolean;
  label: string;
  category: ProductCategory;
  operator?: string;
  externalProductRef?: string;
}

const availableDigitalProducts = computed<DigitalProductDisplay[]>(() => {
  const cats = currentLayananDef.value?.productCategories ?? [];
  const localDigital = productList.value.filter(
    (p) => p.isActive && cats.includes(p.category)
  );

  const overriddenRefs = new Set(
    localDigital.map((p) => p.externalProductRef).filter((ref): ref is string => Boolean(ref))
  );

  const localFormatted: DigitalProductDisplay[] = localDigital.map((p) => ({
    id: p.id,
    name: p.name,
    hargaJual: p.hargaJual,
    isCatalog: false,
    label: `${p.name} (Harga: ${formatRupiah(p.hargaJual)})`,
    category: p.category,
    operator: p.operator,
    externalProductRef: p.externalProductRef,
  }));

  const catalogDigital = catalogList.value
    .filter(
      (c) =>
        c.isActive &&
        cats.includes(c.category) &&
        !overriddenRefs.has(c.id)
    )
    .map((c) => ({
      id: c.id,
      name: c.name,
      hargaJual: c.hargaJual ?? 0,
      isCatalog: true,
      label: `${c.name} (Harga: ${formatRupiah(c.hargaJual ?? 0)}) · KATALOG`,
      category: c.category,
      operator: c.operator,
    }));

  const merged = [...localFormatted, ...catalogDigital];
  return sortProductsForLayanan(merged, layanan.value);
});

// Filter teks di dropdown produk (b33)
const productFilterQuery = ref('');

const displayedPhysicalProducts = computed(() => {
  const q = productFilterQuery.value.trim().toLowerCase();
  const all = availablePhysicalProducts.value;
  if (!q) return all;
  return all.filter((p) => {
    if (p.id === selectedProductId.value) return true; // produk terpilih selalu tampil
    const matchName = p.name.toLowerCase().includes(q);
    const matchOp = (p.operator || '').toLowerCase().includes(q);
    return matchName || matchOp;
  });
});

const displayedDigitalProducts = computed(() => {
  const q = productFilterQuery.value.trim().toLowerCase();
  const all = availableDigitalProducts.value;
  if (!q) return all;
  return all.filter((p) => {
    if (p.id === selectedProductId.value) return true; // produk terpilih selalu tampil
    const matchName = p.name.toLowerCase().includes(q);
    const matchOp = (p.operator || '').toLowerCase().includes(q);
    const matchLabel = p.label.toLowerCase().includes(q);
    return matchName || matchOp || matchLabel;
  });
});

// Footer Simpan Transaksi baru muncul setelah nominal diisi atau produk berharga dipilih (b33)
const showSaveBar = computed(() => {
  if (nominal.value > 0) return true;
  if (selectedProductId.value) {
    const phys = availablePhysicalProducts.value.find((p) => p.id === selectedProductId.value);
    if (phys && (phys.hargaJual ?? 0) > 0) return true;
    const digi = availableDigitalProducts.value.find((p) => p.id === selectedProductId.value);
    if (digi && (digi.hargaJual ?? 0) > 0) return true;
  }
  return false;
});

onMounted(async () => {
  document.addEventListener('pointerdown', handleClickOutside);

  // Ambil jenis dari query parameter jika ada (misal dari Aksi Cepat Home), hanya yang diizinkan untuk staf
  const qType = route.query['type'];
  if (typeof qType === 'string' && qType) {
    const isAllowedStaffService = primaryServices.some((s) => s.code === qType);
    if (isAllowedStaffService) {
      layanan.value = qType;
    }
  }

  // Muat akun
  activeAccounts.value = await db.accounts.filter((a) => a.isActive).toArray();
  initDefaultPaymentAccount();
  // Muat produk lokal
  productList.value = await db.products.filter((p) => p.isActive).toArray();
  // Muat katalog
  catalogList.value = await db.productCatalogCache.filter((c) => c.isActive).toArray();
  // Muat pelanggan
  customerList.value = await db.customers.toArray();

  const defaultBank = activeAccounts.value.find((a) => a.type === 'bank');
  if (defaultBank) {
    sourceAccountId.value = defaultBank.id;
  }
  const defaultServer = activeAccounts.value.find((a) => a.type === 'server_pulsa');
  if (defaultServer && (layanan.value === 'pulsa' || layanan.value === 'data' || layanan.value === 'token_pln')) {
    sourceAccountId.value = defaultServer.id;
  }
  if (layanan.value === 'tarik_tunai') {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type === 'ewallet') {
      const fallback = availableTarikTunaiSourceAccounts.value[0];
      if (fallback) {
        sourceAccountId.value = fallback.id;
      }
    }
  }

  // Cek shift aktif pengguna
  if (authStore.currentUser) {
    const shift = await db.shifts.where({ userId: authStore.currentUser.id, status: 'open' }).first();
    if (shift) {
      activeShiftId.value = shift.id;
    }
  }
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});

function toggleDropdown() {
  if (isDropdownOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function openDropdown() {
  isDropdownOpen.value = true;
  searchQuery.value = '';
  const idx = filteredServices.value.findIndex((s) => s.code === layanan.value);
  highlightedIndex.value = idx >= 0 ? idx : 0;
  nextTick(() => {
    searchInputRef.value?.focus();
  });
}

function closeDropdown() {
  isDropdownOpen.value = false;
  searchQuery.value = '';
}

function moveHighlight(step: number) {
  if (filteredServices.value.length === 0) return;
  const len = filteredServices.value.length;
  highlightedIndex.value = (highlightedIndex.value + step + len) % len;
}

function selectHighlighted() {
  if (filteredServices.value.length === 0) return;
  const target = filteredServices.value[highlightedIndex.value];
  if (target) {
    onSelectOption(target.code);
  }
}

function onSelectOption(code: string) {
  selectService(code);
  closeDropdown();
  focusNextFieldAfterService(code);
}

function handleClickOutside(event: MouseEvent) {
  if (
    comboboxContainerRef.value &&
    !comboboxContainerRef.value.contains(event.target as Node)
  ) {
    closeDropdown();
  }
}

interface FocusableElement {
  focus?: () => void;
  focusNominal?: () => void;
  $el?: HTMLElement;
}

function focusElement(el: HTMLElement | FocusableElement | null | undefined) {
  if (!el) return;
  if (el === submitBtnRef.value && !showSaveBar.value) return;
  nextTick(() => {
    if ('focusNominal' in el && typeof el.focusNominal === 'function') {
      el.focusNominal();
    } else if (typeof el.focus === 'function') {
      el.focus();
    } else if ('$el' in el && el.$el && typeof el.$el.focus === 'function') {
      el.$el.focus();
    } else if ('$el' in el && el.$el) {
      const input = el.$el.querySelector<HTMLElement>('input, select, textarea, button');
      if (input && typeof input.focus === 'function') {
        input.focus();
      }
    }
  });
}

function focusNextFieldAfterService(code: string) {
  nextTick(() => {
    const def = getLayananDef(code);
    if (code === 'jasa_transfer') {
      focusElement(referenceNoRef.value);
    } else if (['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(code)) {
      focusElement(sourceAccountRef.value);
    } else if (def?.group === 'penjualan' && !def.needsSourceAccount) {
      focusElement(productSelectRef.value);
    } else if (def?.group === 'penjualan' && def.needsSourceAccount) {
      if (sourceAccountId.value) {
        focusElement(referenceNoRef.value);
      } else {
        focusElement(sourceAccountRef.value);
      }
    } else if (code === 'operasional') {
      focusElement(sourceAccountRef.value);
    }
  });
}

function onSourceAccountChanged() {
  nextTick(() => {
    const def = currentLayananDef.value;
    if (['transfer', 'topup_ewallet', 'ppob'].includes(layanan.value)) {
      focusElement(referenceNoRef.value);
    } else if (layanan.value === 'tarik_tunai') {
      focusElement(moneyInputRef.value);
    } else if (def?.group === 'penjualan' && def.needsSourceAccount) {
      focusElement(referenceNoRef.value);
    } else if (layanan.value === 'operasional') {
      focusElement(noteRef.value);
    }
  });
}

function onReferenceNoEnter() {
  const def = currentLayananDef.value;
  if (def?.group === 'penjualan' && def.needsSourceAccount) {
    focusElement(productSelectRef.value);
  } else {
    focusElement(moneyInputRef.value);
  }
}

function selectService(code: string) {
  layanan.value = code;
  selectedProductId.value = '';
  productFilterQuery.value = '';
  errorMessage.value = '';
  const def = getLayananDef(code);
  if (!def?.touchesBalances || code === 'jasa_transfer') {
    paymentAccountId.value = '';
    paymentStatus.value = 'lunas';
    feePaidBy.value = 'cash';
  }
  if (def?.group === 'penjualan' && def.needsSourceAccount) {
    const defaultServer = activeAccounts.value.find((a) => a.type === 'server_pulsa');
    if (defaultServer) sourceAccountId.value = defaultServer.id;
  }
  if (code === 'tarik_tunai') {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type === 'ewallet') {
      const fallback = availableTarikTunaiSourceAccounts.value[0];
      sourceAccountId.value = fallback ? fallback.id : '';
    }
  }
  const validIds = availablePaymentAccounts.value.map((a) => a.id);
  if (!validIds.includes(paymentAccountId.value)) {
    initDefaultPaymentAccount();
  }
  recalculateFee();
}

watch(layanan, (newCode) => {
  productFilterQuery.value = '';
  selectedProductId.value = '';
  const def = getLayananDef(newCode);
  if (!def?.touchesBalances || newCode === 'jasa_transfer') {
    paymentAccountId.value = '';
    paymentStatus.value = 'lunas';
    feePaidBy.value = 'cash';
    return;
  }
  if (newCode === 'tarik_tunai') {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type === 'ewallet') {
      const fallback = availableTarikTunaiSourceAccounts.value[0];
      sourceAccountId.value = fallback ? fallback.id : '';
    }
  }
  if (def?.group === 'penjualan' && def.needsSourceAccount) {
    const defaultServer = activeAccounts.value.find((a) => a.type === 'server_pulsa');
    if (defaultServer) sourceAccountId.value = defaultServer.id;
  }
  const validIds = availablePaymentAccounts.value.map((a) => a.id);
  if (!validIds.includes(paymentAccountId.value)) {
    initDefaultPaymentAccount();
  }
});

async function onNominalChanged(val: number) {
  nominal.value = val;
  if (!feeManualOverride.value) {
    await recalculateFee();
  }
}

function onNominalEnter() {
  const hasAdmin = ['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob', 'jasa_transfer'].includes(layanan.value);
  if (hasAdmin) {
    if (moneyInputRef.value && typeof moneyInputRef.value.focusAdmin === 'function') {
      moneyInputRef.value.focusAdmin();
    } else {
      focusElement(statusLunasBtnRef.value);
    }
  } else {
    if (layanan.value === 'operasional') {
      focusElement(noteRef.value || submitBtnRef.value);
    } else {
      focusElement(statusLunasBtnRef.value);
    }
  }
}

function onAdminEnter() {
  if (layanan.value === 'jasa_transfer') {
    focusElement(noteRef.value || submitBtnRef.value);
    return;
  }
  focusElement(statusLunasBtnRef.value);
}

function onPaymentStatusChanged(status: 'lunas' | 'hutang') {
  paymentStatus.value = status;
  if (status === 'hutang') {
    nextTick(() => {
      focusElement(customerSelectRef.value);
    });
  } else {
    nextTick(() => {
      focusElement(noteRef.value);
    });
  }
}

function onCustomerChanged() {
  nextTick(() => {
    focusElement(noteRef.value);
  });
}

async function recalculateFee() {
  if (['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(layanan.value) && nominal.value > 0) {
    const res = await feeRuleService.resolveFee({ layanan: layanan.value, nominal: nominal.value });
    if (res) {
      fee.value = res.fee;
      matchedRule.value = res.rule;
    } else {
      fee.value = 0;
      matchedRule.value = null;
    }
  } else {
    fee.value = 0;
    matchedRule.value = null;
  }
}

function onFeeOverridden(val: number) {
  fee.value = val;
  feeManualOverride.value = true;
}

function onProductSelected() {
  const allAvailable = [
    ...availablePhysicalProducts.value.map((p) => ({ id: p.id, hargaJual: p.hargaJual })),
    ...availableDigitalProducts.value.map((p) => ({ id: p.id, hargaJual: p.hargaJual })),
  ];
  const prod = allAvailable.find((p) => p.id === selectedProductId.value);
  if (prod) {
    nominal.value = prod.hargaJual;
    fee.value = 0;
  }
  nextTick(() => {
    focusElement(statusLunasBtnRef.value);
  });
}

async function handleSubmit() {
  errorMessage.value = '';
  if (!activeShiftId.value) {
    errorMessage.value = 'Buka shift terlebih dahulu sebelum mencatat transaksi.';
    return;
  }

  if (nominal.value <= 0) {
    errorMessage.value = 'Nominal transaksi harus lebih besar dari Rp0.';
    return;
  }

  // Validasi jika Owner/Admin mengubah tanggal dari default
  if (authStore.isAdmin && isDateChanged.value) {
    if (!dateChangeReason.value.trim() || dateChangeReason.value.trim().length < 3) {
      errorMessage.value = 'Alasan perubahan tanggal transaksi wajib diisi minimal 3 karakter.';
      return;
    }
    if (transactionDateStr.value > todayWita) {
      errorMessage.value = 'Tanggal transaksi tidak boleh di masa depan.';
      return;
    }
  }

  const txDate = (authStore.isAdmin && isDateChanged.value)
    ? parseWitaDateToEpoch(transactionDateStr.value)
    : Date.now();

  isSubmitting.value = true;
  try {
    await transactionService.addTransaction(
      {
        layanan: layanan.value,
        productId: selectedProductId.value || undefined,
        paymentAccountId: hasPaymentAccount.value ? (paymentAccountId.value || undefined) : undefined,
        sourceAccountId: (layanan.value === 'jasa_transfer') ? undefined : (sourceAccountId.value || undefined),
        destAccountId: destAccountId.value || undefined,
        nominal: nominal.value,
        fee: fee.value,
        feePaidBy: (layanan.value === 'jasa_transfer') ? 'cash' : feePaidBy.value,
        feeRuleId: matchedRule.value?.id,
        feeManualOverride: feeManualOverride.value,
        paymentMethod: 'tunai',
        paymentStatus: (layanan.value === 'jasa_transfer') ? 'lunas' : paymentStatus.value,
        customerId: selectedCustomerId.value || undefined,
        referenceNo: referenceNo.value || undefined,
        note: note.value || undefined,
        date: txDate,
        dateChangeReason: (authStore.isAdmin && isDateChanged.value) ? dateChangeReason.value.trim() : undefined,
      },
      {
        actorUserId: authStore.currentUser?.id || 'system',
        shiftId: activeShiftId.value,
      }
    );

    // Sukses: kembali ke riwayat transaksi
    router.replace('/transactions');
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Gagal menyimpan transaksi. Pastikan data terisi dengan benar.';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.add-tx-container {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding-bottom: 24px;
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

.tx-time {
  font-size: 12px;
  color: var(--text-secondary);
}

.shift-warning-banner {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--color-warning-subtle);
  padding: 14px 16px;
  border-radius: var(--radius-card);
  border: 1px solid var(--color-warning);
}

.warn-icon {
  width: 28px;
  height: 28px;
  color: var(--color-warning);
  flex-shrink: 0;
}

.warn-content {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.warn-title {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.warn-desc {
  font-size: 11px;
  color: var(--text-secondary);
}

.btn-warn-action {
  padding: 6px 14px;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.tx-form {
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

.form-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.card-section {
  background: var(--surface-card);
  padding: 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
}

.section-label {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

/* Service Combobox */
.service-combobox-container {
  position: relative;
  width: 100%;
}

.service-combobox-trigger {
  width: 100%;
  height: 48px;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-btn);
  padding: 0 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
}

.service-combobox-trigger:focus,
.service-combobox-trigger.open {
  border-color: var(--border-focus);
  outline: none;
  box-shadow: 0 0 0 3px var(--color-primary-light);
}

.trigger-selected {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--text-main);
  font-weight: 600;
  font-size: 14px;
}

.s-icon {
  width: 20px;
  height: 20px;
  color: var(--color-primary);
}

.chevron-icon {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  transition: transform var(--transition-fast);
}

.chevron-icon.rotated {
  transform: rotate(180deg);
}

.service-dropdown-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  right: 0;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.1);
  padding: 8px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
}

.dropdown-search-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.dropdown-search-input {
  width: 100%;
  height: 38px;
  padding: 0 10px 0 32px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card-subtle);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}

.dropdown-search-input:focus {
  border-color: var(--border-focus);
  background: var(--surface-card);
}

.service-options-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 240px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.service-option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  color: var(--text-main);
  font-size: 13px;
  transition: background-color var(--transition-fast);
}

.service-option-item.highlighted,
.service-option-item:hover {
  background: var(--surface-card-subtle);
}

.service-option-item.active {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-weight: 700;
}

.s-icon-sm {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.s-option-label {
  flex: 1;
}

.check-icon {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
}

.no-options-item {
  padding: 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.cascading-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-hint,
.form-hint-warning {
  font-size: 11px;
}

.form-hint {
  color: var(--text-muted);
}

.form-hint-warning {
  color: var(--color-warning);
}

.status-toggle {
  display: flex;
  height: 46px;
  background: var(--surface-card-subtle);
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  padding: 3px;
  gap: 3px;
}

.status-btn {
  flex: 1;
  border: none;
  border-radius: 12px;
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.status-btn.active {
  background: var(--color-primary);
  color: var(--color-white);
  font-weight: 700;
}

.debt-box {
  margin-top: 10px;
  padding: 10px 12px;
  background: var(--color-warning-subtle);
  border-radius: var(--radius-btn);
  border: 1px dashed var(--color-warning);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.text-warning {
  color: var(--color-warning);
}

.sticky-footer {
  position: sticky;
  bottom: 70px;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 12px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  z-index: 20;
}

.btn-submit-tx {
  width: 100%;
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 16px;
  font-weight: 700;
  cursor: pointer;
  transition: background-color var(--transition-fast), transform var(--transition-fast);
}

.btn-submit-tx:active {
  transform: scale(0.98);
  background: var(--color-primary-dark);
}

.btn-submit-tx:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.date-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.badge-role-tag {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 999px;
}

.admin-tag {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.kasir-tag {
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
}

.date-input {
  font-family: inherit;
}

.disabled-input {
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
  cursor: not-allowed;
}
</style>
