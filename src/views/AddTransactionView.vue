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

      <form
        v-else
        class="tx-form"
        :class="{ 'keyboard-open': isKeyboardOpen }"
        @submit.prevent="handleSubmit"
        @focusin="onFormFocusIn"
        @focusout="onFormFocusOut"
        @keydown="handleFormKeyDown($event, $el)"
        @keyup="handleFormKeyUp($event, $el)"
      >
        <!-- Error Banner Form -->
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <!-- 1. Pilihan Jenis Layanan (Dropdown Searchable / Filterable) -->
        <div class="form-section">
          <label class="section-label" for="service-combobox-trigger">Pilih Jenis Layanan</label>
          <div ref="comboboxContainerRef" class="service-combobox-container">
            <SearchableSelect
              id="service-combobox-trigger"
              ref="layananTriggerRef"
              v-model="layanan"
              :options="serviceSelectOptions"
              placeholder="Pilih Layanan"
              search-placeholder="Cari layanan (transfer, pulsa, token, game, acc...)"
              data-testid="service-dropdown"
              trigger-test-id="service-dropdown-trigger"
              search-test-id="input-cari-layanan"
              menu-test-id="service-dropdown-menu"
              option-test-id-prefix="service-option-"
              item-class="service-option-item"
              empty-text="Tidak ada layanan yang cocok"
              @change="onSelectOption"
            />
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

          <!-- Kasus Khusus Tarik Tunai (A.3, T1) -->
          <div v-else-if="layanan === 'tarik_tunai'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana</label>
              <SearchableSelect
                ref="paymentAccountRef"
                v-model="paymentAccountId"
                :options="tarikTunaiKasOptions"
                placeholder="-- Pilih Kas (Kas Kecil / Kas Besar) --"
                search-placeholder="Cari kas..."
                data-testid="select-payment-account"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Rekening Terima Transfer</label>
              <SearchableSelect
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                :options="tarikTunaiBankOptions"
                placeholder="-- Pilih Rekening Bank Penerima --"
                search-placeholder="Cari rekening bank..."
                data-testid="select-source-account"
                required
              />
            </div>
          </div>

          <!-- Layanan Transfer / Top Up / PPOB (T5: tanpa kas) -->
          <div v-else-if="['transfer', 'topup_ewallet', 'ppob'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana Konter</label>
              <SearchableSelect
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                :options="bankAndEwalletOptions"
                placeholder="-- Pilih Akun Bank / E-Wallet --"
                search-placeholder="Cari bank / e-wallet..."
                data-testid="select-source-account"
                required
                @change="onSourceAccountChanged"
              />
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
              <SearchableSelect
                ref="productSelectRef"
                v-model="selectedProductId"
                :options="physicalProductOptions"
                placeholder="-- Pilih Produk --"
                search-placeholder="Cari produk fisik..."
                data-testid="select-physical-product"
                preserve-selected
                required
                @change="onProductSelected"
              />
            </div>
          </div>

          <!-- Layanan Digital (Pulsa / Paket Data / Token PLN / Game) -->
          <div v-else-if="currentLayananDef?.group === 'penjualan' && currentLayananDef.needsSourceAccount" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">{{ layanan === 'data' ? 'Akun Sumber (Server Pulsa / Aplikasi Provider)' : 'Akun Server Pulsa Catatan' }}</label>
              <SearchableSelect
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                :options="digitalSourceAccountOptions"
                :placeholder="layanan === 'data' ? '-- Pilih Server Pulsa / Aplikasi Provider --' : '-- Pilih Server Pulsa --'"
                search-placeholder="Cari server pulsa / provider..."
                required
                @change="onSourceAccountChanged"
              />
            </div>

            <div v-if="currentLayananDef?.needsReferenceNo" class="form-group">
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

            <div v-if="(currentLayananDef?.productCategories?.length ?? 0) > 0" class="form-group">
              <label class="form-label">Pilih Produk Digital dari Master</label>
              <SearchableSelect
                ref="productSelectRef"
                v-model="selectedProductId"
                :options="digitalProductOptions"
                placeholder="-- Pilih Produk Master --"
                search-placeholder="Cari produk digital..."
                data-testid="select-digital-product"
                preserve-selected
                required
                @change="onProductSelected"
              />
              <span v-if="availableDigitalProducts.length === 0" class="form-hint-warning">
                Belum ada produk digital. Minta Owner/Admin mengisi Master Produk atau menyinkronkan katalog dari Master Produk.
              </span>
            </div>
          </div>

          <!-- Layanan Operasional -->
          <div v-else-if="layanan === 'operasional'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana Operasional</label>
              <SearchableSelect
                ref="sourceAccountRef"
                v-model="sourceAccountId"
                :options="operasionalSourceOptions"
                placeholder="-- Pilih Akun Pengeluaran --"
                search-placeholder="Cari akun..."
                required
                @change="onSourceAccountChanged"
              />
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
            :debit-label="layanan === 'tarik_tunai' ? 'Potong di Dalam' : 'Debit Rekening'"
            :cash-label="'Cash'"
            :is-auto-fee="Boolean(matchedRule && !feeManualOverride)"
            :fee-manual-override="feeManualOverride"
            @update:model-value="onNominalChanged"
            @override-fee="onFeeOverridden"
            @enter="onNominalEnter"
            @admin-enter="onAdminEnter"
          />

          <!-- Hitungan Langsung Tarik Tunai (b37) -->
          <div
            v-if="layanan === 'tarik_tunai' && nominal > 0"
            class="tarik-tunai-calc-box mt-3"
            data-testid="tarik-tunai-calc"
          >
            <div class="calc-label">Hitungan Penyerahan Uang:</div>
            <div class="calc-value">
              <span v-if="feePaidBy === 'debit_rekening'">
                Tunai diserahkan: <strong class="text-accent">{{ formatRupiah(Math.max(0, nominal - fee)) }}</strong>
              </span>
              <span v-else>
                Tunai diserahkan: <strong class="text-accent">{{ formatRupiah(nominal) }}</strong> &bull; Fee tunai: <strong class="text-accent">{{ formatRupiah(fee) }}</strong>
              </span>
            </div>
          </div>

          <!-- Margin (Profit) untuk Paket Data (A.2) -->
          <div v-if="currentLayananDef?.hasMargin" class="form-group margin-input-group mt-3" data-testid="margin-input-group">
            <label class="form-label" for="margin-input">Margin (Profit)</label>
            <input
              id="margin-input"
              ref="marginInputRef"
              v-model.number="margin"
              type="number"
              inputmode="numeric"
              class="form-input"
              placeholder="Contoh: 5000"
              min="0"
              :max="nominal"
              data-testid="input-margin"
              @keydown.enter.prevent="onMarginEnter"
            />
            <span v-if="marginError" class="form-error-text" data-testid="margin-error">{{ marginError }}</span>
          </div>

          <!-- Banner Tarif / Peringatan Tarif Belum Ada -->
          <FeeBadge
            v-if="currentLayananDef?.hasFee"
            :no-rule-banner="nominal > 0 && !matchedRule && fee === 0"
            :rule-name="matchedRule ? `Admin Rp ${fee.toLocaleString('id-ID')}` : undefined"
          />

          <!-- Dropdown Diterima Di (b31) -->
          <div v-if="hasPaymentAccount" class="form-group mt-3" data-testid="payment-account-group">
            <label class="form-label" for="payment-account-select">Diterima Di</label>
            <SearchableSelect
              id="payment-account-select"
              ref="paymentAccountRef"
              v-model="paymentAccountId"
              :options="paymentAccountSelectOptions"
              placeholder="-- Pilih Akun Penerima --"
              search-placeholder="Cari akun..."
              data-testid="select-payment-account"
              required
            />
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
              <SearchableSelect
                ref="customerSelectRef"
                v-model="selectedCustomerId"
                :options="customerOptions"
                placeholder="-- Pilih Pelanggan Terdaftar --"
                search-placeholder="Cari pelanggan..."
                required
                @change="onCustomerChanged"
              />
            </div>
            <span class="form-hint">Pelanggan baru dapat ditambahkan di menu Master Pelanggan.</span>
          </div>

          <!-- Pelanggan Opsional untuk Jasa Transfer -->
          <div v-if="layanan === 'jasa_transfer'" class="form-group">
            <label class="form-label">Nama Pelanggan (Opsional)</label>
            <SearchableSelect
              v-model="selectedCustomerId"
              :options="jasaTransferCustomerOptions"
              placeholder="-- Tanpa Pelanggan / Pelanggan Umum --"
              search-placeholder="Cari pelanggan..."
              data-testid="select-customer-jasa-transfer"
            />
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
import { AlertCircle } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import MoneyInput from '../components/MoneyInput.vue';
import FeeBadge from '../components/FeeBadge.vue';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { getTodayWitaString, parseWitaDateToEpoch } from '../utils/datePeriod';
import { db } from '../db/database';
import { feeRuleService } from '../services/feeRuleService';
import { focusNextFormField, handleFormKeyDown, handleFormKeyUp } from '../utils/formNavigation';
import { transactionService } from '../services/transactionService';
import type { Account, Product, Customer, AdminFeeRule, ProductCatalogEntry, ProductCategory } from '../db/types';
import { AppError } from '../core/errors';
import { staffLayanan, getLayananDef } from '../core/layanan';
import { sortProductsForLayanan } from '../utils/productSort';
import SearchableSelect from '../components/SearchableSelect.vue';

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
const margin = ref<number | ''>(0);
const marginInputRef = ref<HTMLInputElement | null>(null);
const isKeyboardOpen = ref<boolean>(false);

const paymentAccountRef = ref<HTMLSelectElement | null>(null);

const currentLayananDef = computed(() => getLayananDef(layanan.value));

const marginError = computed(() => {
  if (!currentLayananDef.value?.hasMargin) return '';
  const m = margin.value;
  if (m === '' || m === null || m === undefined) return '';
  if (!Number.isInteger(m)) return 'Margin harus bilangan bulat.';
  if (m < 0) return 'Margin tidak boleh negatif.';
  if (m > nominal.value) return 'Margin tidak boleh lebih besar dari nominal.';
  return '';
});

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
const comboboxContainerRef = ref<HTMLElement | null>(null);
const layananTriggerRef = ref<HTMLButtonElement | null>(null);

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

const serviceSelectOptions = computed(() =>
  primaryServices.map((s) => ({
    value: s.code,
    label: s.label,
    hint: s.group === 'penjualan' ? 'Penjualan' : (s.group === 'transfer' ? 'Transfer & Keuangan' : 'Lainnya'),
    icon: s.icon,
    keywords: s.keywords,
  }))
);

// T5: Bank & E-Wallet saja, tanpa kas untuk transfer/topup/ppob
const bankAndEwalletOptions = computed(() =>
  activeAccounts.value
    .filter((a) => a.type === 'bank' || a.type === 'ewallet')
    .map((a) => ({
      value: a.id,
      label: `${a.name} (Saldo: ${formatRupiah(accountBalances.value[a.id] || a.initialBalance)})`,
    }))
);

// A.3, T1: Kasus khusus Tarik Tunai
const tarikTunaiKasOptions = computed(() =>
  activeAccounts.value
    .filter((a) => a.type === 'kas')
    .map((a) => ({
      value: a.id,
      label: `${a.name} (Saldo: ${formatRupiah(accountBalances.value[a.id] || a.initialBalance)})`,
    }))
);

const tarikTunaiBankOptions = computed(() =>
  activeAccounts.value
    .filter((a) => a.type === 'bank')
    .map((a) => ({
      value: a.id,
      label: `${a.name} (Saldo: ${formatRupiah(accountBalances.value[a.id] || a.initialBalance)})`,
    }))
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

const physicalProductOptions = computed(() =>
  availablePhysicalProducts.value.map((p) => ({
    value: p.id,
    label: `${p.name} (Harga: ${formatRupiah(p.hargaJual)} | Stok: ${p.stock ?? 0})`,
  }))
);

const digitalSourceAccountOptions = computed(() => {
  const allowed = currentLayananDef.value?.sourceTypes ?? ['server_pulsa'];
  return activeAccounts.value
    .filter((a) => allowed.includes(a.type))
    .map((acc) => ({
      value: acc.id,
      label: `${acc.name} (Saldo catatan: ${formatRupiah(accountBalances.value[acc.id] || acc.initialBalance)})`,
    }));
});

const digitalProductOptions = computed(() =>
  availableDigitalProducts.value.map((p) => ({
    value: p.id,
    label: p.label,
  }))
);

const operasionalSourceOptions = computed(() =>
  activeAccounts.value.map((acc) => ({
    value: acc.id,
    label: `${acc.name} (Saldo: ${formatRupiah(accountBalances.value[acc.id] || acc.initialBalance)})`,
  }))
);

const paymentAccountSelectOptions = computed(() =>
  availablePaymentAccounts.value.map((acc) => ({
    value: acc.id,
    label: getPaymentOptionLabel(acc),
  }))
);

const customerOptions = computed(() =>
  customerList.value.map((c) => ({
    value: c.id,
    label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
  }))
);

const jasaTransferCustomerOptions = computed(() => [
  { value: '', label: '-- Tanpa Pelanggan / Pelanggan Umum --' },
  ...customerList.value.map((c) => ({
    value: c.id,
    label: `${c.name} ${c.phone ? `(${c.phone})` : ''}`,
  })),
]);

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

function checkAndScrollFieldIntoView(el?: Element | null) {
  const target = el || (typeof document !== 'undefined' ? document.activeElement : null);
  if (!target || !(target instanceof HTMLElement)) return;
  if (target.tagName === 'BUTTON' || target.closest('.sticky-footer')) return;
  const footer = typeof document !== 'undefined' ? document.querySelector('.sticky-footer') : null;
  if (!footer) return;
  const targetRect = target.getBoundingClientRect();
  const footerRect = footer.getBoundingClientRect();
  if (targetRect.bottom >= footerRect.top - 10) {
    if (typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }
}

let baselineHeight = 0;

function updateKeyboardState() {
  if (typeof window === 'undefined') return;
  const currentHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
  if (!baselineHeight || currentHeight > baselineHeight) {
    baselineHeight = currentHeight;
  }
  const isResized = baselineHeight > 0 && (baselineHeight - currentHeight > 120);
  const activeEl = typeof document !== 'undefined' ? document.activeElement : null;
  const isInputActive = Boolean(
    activeEl &&
    (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.classList.contains('search-box-input')) &&
    !activeEl.classList.contains('visually-hidden-select')
  );
  isKeyboardOpen.value = isResized || isInputActive;
}

function onFormFocusIn(event: FocusEvent) {
  updateKeyboardState();
  nextTick(() => {
    checkAndScrollFieldIntoView(event.target as Element);
  });
}

function onFormFocusOut() {
  setTimeout(() => {
    updateKeyboardState();
  }, 100);
}

function handleViewportResize() {
  updateKeyboardState();
  if (isKeyboardOpen.value) {
    nextTick(() => {
      checkAndScrollFieldIntoView();
    });
  }
}

watch(showSaveBar, (visible) => {
  if (visible) {
    nextTick(() => {
      checkAndScrollFieldIntoView();
    });
  }
});

onMounted(async () => {
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
    const defaultKas = activeAccounts.value.find((a) => a.type === 'kas');
    paymentAccountId.value = defaultKas ? defaultKas.id : '';
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type !== 'bank') {
      const defaultBankAcc = activeAccounts.value.find((a) => a.type === 'bank');
      sourceAccountId.value = defaultBankAcc ? defaultBankAcc.id : '';
    }
  }

  // Cek shift aktif pengguna
  if (authStore.currentUser) {
    const shift = await db.shifts.where({ userId: authStore.currentUser.id, status: 'open' }).first();
    if (shift) {
      activeShiftId.value = shift.id;
    }
  }

  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.addEventListener('resize', handleViewportResize);
  }
});

onUnmounted(() => {
  if (typeof window !== 'undefined' && window.visualViewport) {
    window.visualViewport.removeEventListener('resize', handleViewportResize);
  }
});

function onSelectOption(code: string | number) {
  const strCode = String(code);
  selectService(strCode);
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
    } else if ('$el' in el && el.$el) {
      const input = el.$el.querySelector<HTMLElement>(
        'input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), .searchable-select-trigger:not([disabled])'
      );
      if (input && typeof input.focus === 'function') {
        input.focus();
      } else if (typeof el.$el.focus === 'function') {
        el.$el.focus();
      }
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
    } else if (layanan.value === 'data') {
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
  margin.value = 0;
  const def = getLayananDef(code);
  if (!def?.touchesBalances || code === 'jasa_transfer') {
    paymentAccountId.value = '';
    paymentStatus.value = 'lunas';
    feePaidBy.value = 'cash';
  }
  if (def?.group === 'penjualan' && def.needsSourceAccount) {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    const isCurValid = curAcc && (def.sourceTypes.includes(curAcc.type));
    if (!isCurValid) {
      const defaultAcc = activeAccounts.value.find((a) => def.sourceTypes.includes(a.type));
      if (defaultAcc) sourceAccountId.value = defaultAcc.id;
    }
  }
  if (code === 'tarik_tunai') {
    const defaultKas = activeAccounts.value.find((a) => a.type === 'kas');
    paymentAccountId.value = defaultKas ? defaultKas.id : '';
    const defaultBank = activeAccounts.value.find((a) => a.type === 'bank');
    sourceAccountId.value = defaultBank ? defaultBank.id : '';
  } else if (['transfer', 'topup_ewallet', 'ppob'].includes(code)) {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type === 'kas') {
      const fallback = bankAndEwalletOptions.value[0];
      sourceAccountId.value = fallback ? String(fallback.value) : '';
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
  margin.value = 0;
  const def = getLayananDef(newCode);
  if (!def?.touchesBalances || newCode === 'jasa_transfer') {
    paymentAccountId.value = '';
    paymentStatus.value = 'lunas';
    feePaidBy.value = 'cash';
    return;
  }
  if (newCode === 'tarik_tunai') {
    const defaultKas = activeAccounts.value.find((a) => a.type === 'kas');
    paymentAccountId.value = defaultKas ? defaultKas.id : '';
    const defaultBank = activeAccounts.value.find((a) => a.type === 'bank');
    sourceAccountId.value = defaultBank ? defaultBank.id : '';
  } else if (['transfer', 'topup_ewallet', 'ppob'].includes(newCode)) {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    if (!curAcc || curAcc.type === 'kas') {
      const fallback = bankAndEwalletOptions.value[0];
      sourceAccountId.value = fallback ? String(fallback.value) : '';
    }
  }
  if (def?.group === 'penjualan' && def.needsSourceAccount) {
    const curAcc = activeAccounts.value.find((a) => a.id === sourceAccountId.value);
    const isCurValid = curAcc && (def.sourceTypes.includes(curAcc.type));
    if (!isCurValid) {
      const defaultAcc = activeAccounts.value.find((a) => def.sourceTypes.includes(a.type));
      if (defaultAcc) sourceAccountId.value = defaultAcc.id;
    }
  }
  initDefaultPaymentAccount();
  recalculateFee();
});

async function onNominalChanged(val: number) {
  nominal.value = val;
  if (!feeManualOverride.value) {
    await recalculateFee();
  }
}

function onNominalEnter() {
  if (currentLayananDef.value?.hasMargin) {
    focusElement(marginInputRef.value);
    return;
  }
  const hasAdmin = ['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob', 'jasa_transfer'].includes(layanan.value);
  if (hasAdmin) {
    if (moneyInputRef.value && typeof moneyInputRef.value.focusAdmin === 'function') {
      moneyInputRef.value.focusAdmin();
    } else {
      const moneyEl = (moneyInputRef.value?.$el || moneyInputRef.value) as HTMLElement;
      focusNextFormField(moneyEl);
    }
  } else {
    const moneyEl = (moneyInputRef.value?.$el || moneyInputRef.value) as HTMLElement;
    focusNextFormField(moneyEl);
  }
}

function onMarginEnter() {
  if (marginInputRef.value) {
    focusNextFormField(marginInputRef.value);
  } else {
    focusElement(submitBtnRef.value);
  }
}

function onAdminEnter() {
  const moneyEl = (moneyInputRef.value?.$el || moneyInputRef.value) as HTMLElement;
  focusNextFormField(moneyEl);
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

  // Validasi fee untuk Tarik Tunai
  if (layanan.value === 'tarik_tunai' && fee.value > nominal.value) {
    errorMessage.value = 'Biaya admin tidak boleh lebih besar dari nominal.';
    return;
  }

  // Validasi margin untuk Paket Data
  if (currentLayananDef.value?.hasMargin) {
    const m = margin.value === '' ? 0 : margin.value;
    if (!Number.isInteger(m)) {
      errorMessage.value = 'Margin harus bilangan bulat.';
      return;
    }
    if (m < 0) {
      errorMessage.value = 'Margin tidak boleh negatif.';
      return;
    }
    if (m > nominal.value) {
      errorMessage.value = 'Margin tidak boleh lebih besar dari nominal.';
      return;
    }
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
        productId: (layanan.value === 'data') ? undefined : (selectedProductId.value || undefined),
        margin: (layanan.value === 'data') ? (typeof margin.value === 'number' ? margin.value : 0) : undefined,
        paymentAccountId: (layanan.value === 'tarik_tunai' || hasPaymentAccount.value) ? (paymentAccountId.value || undefined) : undefined,
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
        referenceNo: (layanan.value === 'data') ? undefined : (referenceNo.value || undefined),
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
  padding-bottom: 200px;
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

.tarik-tunai-calc-box {
  background: var(--surface-card-subtle, #f8fafc);
  border: 1px dashed var(--color-primary-light, #93c5fd);
  border-radius: var(--radius-btn);
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.calc-label {
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
}

.calc-value {
  font-size: 13px;
  color: var(--text-main);
}

.text-accent {
  color: var(--color-primary);
  font-weight: 700;
}

.sticky-footer {
  position: fixed;
  left: 16px;
  right: 16px;
  max-width: min(calc(100vw - 32px), 568px);
  margin: 0 auto;
  bottom: 74px;
  --keyboard-inset: env(keyboard-inset-height, 0px);
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 10px 14px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  display: flex;
  flex-direction: column;
  z-index: 50;
  transition: bottom 0.15s ease-out;
}

.keyboard-open .sticky-footer,
.tx-form.keyboard-open .sticky-footer {
  bottom: 8px;
}

.form-input,
:deep(.form-input),
:deep(.searchable-select-trigger),
:deep(.money-input-field) {
  scroll-margin-bottom: 180px;
}

.margin-input-group {
  margin-top: 12px;
}

.form-error-text {
  font-size: 11px;
  color: var(--color-danger, #ef4444);
  margin-top: 4px;
  display: block;
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
