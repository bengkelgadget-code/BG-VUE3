<template>
  <AppScaffold>
    <div class="add-tx-container">
      <div class="view-header">
        <h2 class="page-title">Tambah Transaksi</h2>
        <span class="tx-time">{{ currentWitaTime }}</span>
      </div>

      <!-- Warning Bila Belum Buka Shift -->
      <div v-if="!activeShiftId" class="shift-warning-banner">
        <AlertCircle class="warn-icon" />
        <div class="warn-content">
          <span class="warn-title">Shift Belum Dibuka</span>
          <span class="warn-desc">Anda harus membuka shift terlebih dahulu untuk mencatat transaksi.</span>
        </div>
        <router-link to="/shifts/open" class="btn-warn-action">Buka Shift</router-link>
      </div>

      <form v-else class="tx-form" @submit.prevent="handleSubmit">
        <div v-if="errorMessage" class="error-banner">
          {{ errorMessage }}
        </div>

        <!-- 1. Pilihan Jenis Layanan (Grid Tombol Ikon) -->
        <div class="form-section">
          <label class="section-label">Pilih Jenis Layanan</label>
          <div class="service-grid">
            <button
              v-for="s in primaryServices"
              :key="s.code"
              type="button"
              class="service-btn"
              :class="{ active: layanan === s.code }"
              @click="selectService(s.code)"
            >
              <component :is="s.icon" class="s-icon" />
              <span class="s-label">{{ s.label }}</span>
            </button>
          </div>
        </div>

        <!-- 2. Detail Cascading Sesuai Jenis Layanan -->
        <div class="form-section card-section">
          <!-- Layanan Transfer / Tarik Tunai / Top Up -->
          <div v-if="['transfer', 'tarik_tunai', 'topup_ewallet'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">
                {{ layanan === 'tarik_tunai' ? 'Rekening Konter Penerima Transfer' : 'Sumber Dana Konter' }}
              </label>
              <select v-model="sourceAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Bank / E-Wallet --</option>
                <option v-for="acc in availableBankAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} (Saldo: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>

            <div v-if="layanan === 'transfer'" class="form-group">
              <label class="form-label">Nama Bank & No. Rekening Tujuan</label>
              <input
                v-model="referenceNo"
                type="text"
                class="form-input"
                placeholder="Contoh: BCA 123456789 a.n. Budi"
              />
            </div>

            <div v-if="layanan === 'topup_ewallet'" class="form-group">
              <label class="form-label">Nomor HP / Akun Tujuan</label>
              <input
                v-model="referenceNo"
                type="tel"
                class="form-input"
                placeholder="Contoh: DANA 08123456789"
              />
            </div>
          </div>

          <!-- Layanan Barang Fisik (Voucher / Perdana / Aksesoris) -->
          <div v-else-if="['voucher', 'perdana', 'aksesoris'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Pilih Barang dari Master Produk</label>
              <select v-model="selectedProductId" class="form-select" required @change="onProductSelected">
                <option disabled value="">-- Pilih Produk --</option>
                <option v-for="p in availablePhysicalProducts" :key="p.id" :value="p.id">
                  {{ p.name }} (Harga: {{ formatRupiah(p.hargaJual) }} | Stok: {{ p.stock ?? 0 }})
                </option>
              </select>
            </div>
          </div>

          <!-- Layanan Digital (Pulsa / Paket Data / Token PLN) -->
          <div v-else-if="['pulsa', 'data', 'token_pln'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Akun Server Pulsa Catatan</label>
              <select v-model="sourceAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Server Pulsa --</option>
                <option v-for="acc in serverAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} (Saldo catatan: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">Nomor Tujuan / ID Pelanggan</label>
              <input
                v-model="referenceNo"
                type="tel"
                class="form-input"
                placeholder="0812xxxx atau No. Meter"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Pilih Produk Digital dari Master</label>
              <select v-model="selectedProductId" class="form-select" required @change="onProductSelected">
                <option disabled value="">-- Pilih Produk Master --</option>
                <option v-for="p in availableDigitalProducts" :key="p.id" :value="p.id">
                  {{ p.name }} (Harga: {{ formatRupiah(p.hargaJual) }})
                </option>
              </select>
              <span v-if="availableDigitalProducts.length === 0" class="form-hint-warning">
                Belum ada produk digital di Master Produk. Minta Owner/Admin mengisi master terlebih dahulu.
              </span>
            </div>
          </div>

          <!-- Layanan Operasional -->
          <div v-else-if="layanan === 'operasional'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana Operasional</label>
              <select v-model="sourceAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Pengeluaran --</option>
                <option v-for="acc in activeAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} (Saldo: {{ formatRupiah(accountBalances[acc.id] || acc.initialBalance) }})
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Keterangan Pengeluaran</label>
              <input
                v-model="note"
                type="text"
                class="form-input"
                placeholder="Contoh: Beli kertas struk / bayar listrik"
                required
              />
            </div>
          </div>

          <!-- Layanan Pindah Dana -->
          <div v-else-if="layanan === 'pindah_dana'" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Akun Asal (Keluar)</label>
              <select v-model="sourceAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Asal --</option>
                <option v-for="acc in activeAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Akun Tujuan (Masuk)</label>
              <select v-model="destAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Tujuan --</option>
                <option
                  v-for="acc in activeAccounts.filter((a) => a.id !== sourceAccountId)"
                  :key="acc.id"
                  :value="acc.id"
                >
                  {{ acc.name }}
                </option>
              </select>
            </div>
          </div>

          <!-- Layanan Deposit Server / Provider (Dicatat) -->
          <div v-else-if="['deposit_server', 'deposit_provider'].includes(layanan)" class="cascading-fields">
            <div class="form-group">
              <label class="form-label">Sumber Dana (Rekening / Kas Keluar)</label>
              <select v-model="sourceAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Sumber Dana --</option>
                <option v-for="acc in activeAccounts.filter(a => ['bank', 'kas'].includes(a.type))" :key="acc.id" :value="acc.id">
                  {{ acc.name }}
                </option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label">Akun Saldo Catatan (Bertambah)</label>
              <select v-model="destAccountId" class="form-select" required>
                <option disabled value="">-- Pilih Akun Catatan --</option>
                <option
                  v-for="acc in activeAccounts.filter((a) => layanan === 'deposit_server' ? a.type === 'server_pulsa' : a.type === 'provider_app')"
                  :key="acc.id"
                  :value="acc.id"
                >
                  {{ acc.name }} (catatan)
                </option>
              </select>
            </div>
          </div>
        </div>

        <!-- 3. Baris Nominal Pokok + Biaya Admin + Bayar Admin (Satu Baris) -->
        <div class="form-section card-section">
          <MoneyInput
            v-model="nominal"
            v-model:fee="fee"
            v-model:feePaidBy="feePaidBy"
            :hide-admin="['voucher', 'perdana', 'aksesoris', 'pulsa', 'data', 'token_pln', 'operasional', 'pindah_dana', 'deposit_server', 'deposit_provider'].includes(layanan)"
            :is-auto-fee="Boolean(matchedRule && !feeManualOverride)"
            :fee-manual-override="feeManualOverride"
            @update:model-value="onNominalChanged"
            @override-fee="onFeeOverridden"
          />

          <!-- Banner Tarif / Peringatan Tarif Belum Ada -->
          <FeeBadge
            v-if="['transfer', 'tarik_tunai', 'topup_ewallet', 'ppob'].includes(layanan)"
            :no-rule-banner="nominal > 0 && !matchedRule && fee === 0"
            :rule-name="matchedRule ? `Admin Rp ${fee.toLocaleString('id-ID')}` : undefined"
          />
        </div>

        <!-- 4. Metode Terima & Status Pembayaran (Lunas / Hutang) -->
        <div v-if="!['operasional', 'pindah_dana', 'deposit_server', 'deposit_provider'].includes(layanan)" class="form-section card-section">
          <div class="form-row">
            <div class="form-group flex-1">
              <label class="form-label">Diterima Lewat</label>
              <select v-model="paymentAccountId" class="form-select" required>
                <option v-for="acc in receivableAccounts" :key="acc.id" :value="acc.id">
                  {{ acc.name }} ({{ acc.type }})
                </option>
              </select>
            </div>

            <div class="form-group flex-1">
              <label class="form-label">Status Bayar</label>
              <div class="status-toggle">
                <button
                  type="button"
                  class="status-btn"
                  :class="{ active: paymentStatus === 'lunas' }"
                  @click="paymentStatus = 'lunas'"
                >
                  Lunas
                </button>
                <button
                  type="button"
                  class="status-btn"
                  :class="{ active: paymentStatus === 'hutang' }"
                  @click="paymentStatus = 'hutang'"
                >
                  Hutang
                </button>
              </div>
            </div>
          </div>

          <!-- Jika Status Bayar = Hutang: Wajib Pilih / Isi Pelanggan -->
          <div v-if="paymentStatus === 'hutang'" class="debt-box">
            <label class="form-label text-warning">Pilih Pelanggan (Wajib)</label>
            <div class="customer-picker">
              <select v-model="selectedCustomerId" class="form-select" required>
                <option disabled value="">-- Pilih Pelanggan Terdaftar --</option>
                <option v-for="c in customerList" :key="c.id" :value="c.id">
                  {{ c.name }} {{ c.phone ? `(${c.phone})` : '' }}
                </option>
              </select>
            </div>
            <span class="form-hint">Pelanggan baru dapat ditambahkan di menu Master Pelanggan.</span>
          </div>

          <div class="form-group mt-2">
            <label class="form-label">Catatan Tambahan (Opsional)</label>
            <input
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Catatan kecil / keterangan"
            />
          </div>
        </div>

        <!-- 5. Tombol Simpan Sticky di Bawah -->
        <div class="sticky-footer">
          <div class="summary-preview">
            <span class="preview-label">Total Transaksi</span>
            <span class="preview-amount money-display">
              {{ formatRupiah(layanan === 'tarik_tunai' ? nominal : (feePaidBy === 'cash' ? nominal + fee : nominal)) }}
            </span>
          </div>
          <button type="submit" class="btn-submit-tx" :disabled="isSubmitting || nominal <= 0">
            <span v-if="!isSubmitting">Simpan Transaksi</span>
            <span v-else>Menyimpan...</span>
          </button>
        </div>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import {
  ArrowRightLeft,
  Banknote,
  Smartphone,
  Wallet,
  Receipt,
  Ticket,
  Package,
  Layers,
  Zap,
  TrendingDown,
  RefreshCw,
  AlertCircle,
} from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import MoneyInput from '../components/MoneyInput.vue';
import FeeBadge from '../components/FeeBadge.vue';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { db } from '../db/database';
import { feeRuleService } from '../services/feeRuleService';
import { transactionService } from '../services/transactionService';
import type { Account, Product, Customer, AdminFeeRule } from '../db/types';
import { AppError } from '../core/errors';

const router = useRouter();
const route = useRoute();
const authStore = useAuthStore();

const currentWitaTime = ref(formatTanggalWita(Date.now(), { hour: '2-digit', minute: '2-digit' }));
const activeShiftId = ref<string | null>(null);

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

const matchedRule = ref<AdminFeeRule | null>(null);
const errorMessage = ref<string>('');
const isSubmitting = ref<boolean>(false);

// Master Data Lists
const activeAccounts = ref<Account[]>([]);
const accountBalances = ref<Record<string, number>>({});
const productList = ref<Product[]>([]);
const customerList = ref<Customer[]>([]);

const primaryServices = [
  { code: 'transfer', label: 'Transfer', icon: ArrowRightLeft },
  { code: 'tarik_tunai', label: 'Tarik Tunai', icon: Banknote },
  { code: 'topup_ewallet', label: 'E-Wallet', icon: Wallet },
  { code: 'pulsa', label: 'Pulsa', icon: Smartphone },
  { code: 'data', label: 'Paket Data', icon: Layers },
  { code: 'token_pln', label: 'Token PLN', icon: Zap },
  { code: 'voucher', label: 'Voucher', icon: Ticket },
  { code: 'perdana', label: 'Perdana', icon: Package },
  { code: 'aksesoris', label: 'Aksesoris', icon: Package },
  { code: 'ppob', label: 'Tagihan PPOB', icon: Receipt },
  { code: 'pindah_dana', label: 'Pindah Dana', icon: RefreshCw },
  { code: 'deposit_server', label: 'Deposit Server', icon: Smartphone },
  { code: 'deposit_provider', label: 'Deposit Provider', icon: Layers },
  { code: 'operasional', label: 'Operasional', icon: TrendingDown },
];

const availableBankAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'bank' || a.type === 'ewallet' || a.type === 'kas')
);

const serverAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'server_pulsa')
);

const receivableAccounts = computed(() =>
  activeAccounts.value.filter((a) => a.type === 'kas' || a.type === 'bank' || a.type === 'ewallet')
);

const availablePhysicalProducts = computed(() =>
  productList.value.filter(
    (p) => p.isActive && (p.category === 'voucher' || p.category === 'perdana' || p.category === 'aksesoris')
  )
);

const availableDigitalProducts = computed(() =>
  productList.value.filter(
    (p) => p.isActive && (p.category === 'pulsa' || p.category === 'data' || p.category === 'token_pln')
  )
);

onMounted(async () => {
  // Ambil jenis dari query parameter jika ada (misal dari Aksi Cepat Home)
  const qType = route.query['type'];
  if (typeof qType === 'string' && qType) {
    layanan.value = qType;
  }

  // Muat akun
  activeAccounts.value = await db.accounts.filter((a) => a.isActive).toArray();
  // Muat produk
  productList.value = await db.products.filter((p) => p.isActive).toArray();
  // Muat pelanggan
  customerList.value = await db.customers.toArray();

  // Tentukan akun default
  const defaultKas = activeAccounts.value.find((a) => a.type === 'kas');
  if (defaultKas) {
    paymentAccountId.value = defaultKas.id;
  }
  const defaultBank = activeAccounts.value.find((a) => a.type === 'bank');
  if (defaultBank) {
    sourceAccountId.value = defaultBank.id;
  }
  const defaultServer = activeAccounts.value.find((a) => a.type === 'server_pulsa');
  if (defaultServer && (layanan.value === 'pulsa' || layanan.value === 'data' || layanan.value === 'token_pln')) {
    sourceAccountId.value = defaultServer.id;
  }

  // Cek shift aktif pengguna
  if (authStore.currentUser) {
    const shift = await db.shifts.where({ userId: authStore.currentUser.id, status: 'open' }).first();
    if (shift) {
      activeShiftId.value = shift.id;
    }
  }
});

function selectService(code: string) {
  layanan.value = code;
  selectedProductId.value = '';
  errorMessage.value = '';
  if (['pulsa', 'data', 'token_pln'].includes(code)) {
    const defaultServer = activeAccounts.value.find((a) => a.type === 'server_pulsa');
    if (defaultServer) sourceAccountId.value = defaultServer.id;
  }
  recalculateFee();
}

async function onNominalChanged(val: number) {
  nominal.value = val;
  if (!feeManualOverride.value) {
    await recalculateFee();
  }
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
  const prod = productList.value.find((p) => p.id === selectedProductId.value);
  if (prod) {
    nominal.value = prod.hargaJual;
    fee.value = 0;
  }
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

  isSubmitting.value = true;
  try {
    await transactionService.addTransaction(
      {
        layanan: layanan.value,
        productId: selectedProductId.value || undefined,
        accountId: paymentAccountId.value || undefined,
        sourceAccountId: sourceAccountId.value || undefined,
        destAccountId: destAccountId.value || undefined,
        nominal: nominal.value,
        fee: fee.value,
        feePaidBy: feePaidBy.value,
        feeRuleId: matchedRule.value?.id,
        feeManualOverride: feeManualOverride.value,
        paymentMethod: 'tunai',
        paymentStatus: paymentStatus.value,
        customerId: selectedCustomerId.value || undefined,
        referenceNo: referenceNo.value || undefined,
        note: note.value || undefined,
        date: Date.now(),
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
  color: #ffffff;
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

.service-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.service-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-btn);
  color: var(--text-main);
  cursor: pointer;
  transition: all var(--transition-fast);
}

.service-btn.active {
  background: var(--color-primary-light);
  border-color: var(--color-primary);
  color: var(--color-primary-dark);
  font-weight: 700;
}

.s-icon {
  width: 20px;
  height: 20px;
}

.s-label {
  font-size: 10px;
  text-align: center;
  line-height: 1.2;
}

.cascading-fields {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.form-row {
  display: flex;
  gap: 10px;
}

.flex-1 {
  flex: 1;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-select,
.form-input {
  height: 46px;
  padding: 0 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
  transition: border-color var(--transition-fast);
}

.form-select:focus,
.form-input:focus {
  border-color: var(--border-focus);
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
  color: #ffffff;
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
  padding: 14px 16px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
  display: flex;
  flex-direction: column;
  gap: 10px;
  z-index: 20;
}

.summary-preview {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preview-label {
  font-size: 13px;
  font-weight: 600;
  color: var(--text-secondary);
}

.preview-amount {
  font-size: 20px;
  font-weight: 800;
  color: var(--color-primary-dark);
}

.btn-submit-tx {
  height: 52px;
  border: none;
  border-radius: var(--radius-btn);
  background: var(--color-primary);
  color: #ffffff;
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
</style>
