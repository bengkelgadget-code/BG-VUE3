<template>
  <AppScaffold>
    <div class="owner-tx-container">
      <div class="view-header">
        <button type="button" class="btn-back" @click="router.back()">← Kembali</button>
        <h2 class="page-title">Transaksi Owner</h2>
      </div>

      <p class="section-intro">
        Catat mutasi internal konter: transfer antar rekening, isi saldo provider/server, pembelian stok aksesoris, atau belanja operasional.
      </p>

      <!-- Feedback Banner -->
      <div v-if="successMessage" class="feedback-banner success" data-testid="owner-tx-success">
        {{ successMessage }}
      </div>
      <div v-if="errorMessage" class="feedback-banner error" data-testid="owner-tx-error">
        {{ errorMessage }}
      </div>

      <!-- Tab Jenis Transaksi Owner -->
      <div class="owner-tabs">
        <button
          v-for="tab in ownerTabs"
          :key="tab.key"
          type="button"
          class="owner-tab-btn"
          :class="{ active: selectedTab === tab.key }"
          :data-testid="`tab-${tab.key}`"
          @click="selectTab(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <form class="owner-tx-form" @submit.prevent="handleSubmit">
        <!-- 1. PINDAH DANA -->
        <div v-if="selectedTab === 'pindah_dana'" class="form-card">
          <div class="form-group">
            <label class="form-label" for="source-account-pindah">Rekening / Akun Asal</label>
            <select
              id="source-account-pindah"
              v-model="sourceAccountId"
              class="form-select"
              data-testid="select-source-account"
              required
            >
              <option value="" disabled>Pilih Akun Asal...</option>
              <option
                v-for="acc in availableSourceAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="dest-account-pindah">Rekening / Akun Tujuan</label>
            <select
              id="dest-account-pindah"
              v-model="destAccountId"
              class="form-select"
              data-testid="select-dest-account"
              required
            >
              <option value="" disabled>Pilih Akun Tujuan...</option>
              <option
                v-for="acc in availableDestAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
          </div>
        </div>

        <!-- 2. TOP-UP PROVIDER / SERVER -->
        <div v-else-if="selectedTab === 'deposit'" class="form-card">
          <div class="form-group">
            <label class="form-label">Tujuan Top-Up</label>
            <div class="radio-group">
              <label class="radio-label">
                <input
                  v-model="depositType"
                  type="radio"
                  value="deposit_provider"
                  data-testid="radio-deposit-provider"
                />
                <span>Saldo Aplikasi Provider (iSimple, dll)</span>
              </label>
              <label class="radio-label">
                <input
                  v-model="depositType"
                  type="radio"
                  value="deposit_server"
                  data-testid="radio-deposit-server"
                />
                <span>Saldo Server Pulsa</span>
              </label>
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="source-account-deposit">Akun Sumber Dana (Kas / Bank / E-Wallet)</label>
            <select
              id="source-account-deposit"
              v-model="sourceAccountId"
              class="form-select"
              data-testid="select-source-account"
              required
            >
              <option value="" disabled>Pilih Akun Sumber...</option>
              <option
                v-for="acc in paymentAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="dest-account-deposit">
              {{ depositType === 'deposit_provider' ? 'Akun Provider App Tujuan' : 'Akun Server Pulsa Tujuan' }}
            </label>
            <select
              id="dest-account-deposit"
              v-model="destAccountId"
              class="form-select"
              data-testid="select-dest-account"
              required
            >
              <option value="" disabled>Pilih Akun Tujuan...</option>
              <option
                v-for="acc in depositDestAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
            <p v-if="depositDestAccounts.length === 0" class="field-hint text-warning">
              Belum ada akun bertipe {{ depositType === 'deposit_provider' ? 'Provider App' : 'Server Pulsa' }}. Tambahkan di Master Akun.
            </p>
          </div>
        </div>

        <!-- 3. BELI AKSESORIS / STOK -->
        <div v-else-if="selectedTab === 'pembelian_stok'" class="form-card">
          <div class="form-group">
            <label class="form-label" for="product-aksesoris">Pilih Produk Aksesoris</label>
            <select
              id="product-aksesoris"
              v-model="selectedProductId"
              class="form-select"
              data-testid="select-product-stok"
              required
            >
              <option value="" disabled>Pilih Produk Master Aksesoris...</option>
              <option
                v-for="prod in aksesorisProducts"
                :key="prod.id"
                :value="prod.id"
              >
                {{ prod.name }} (Stok saat ini: {{ prod.stock ?? 0 }} pcs)
              </option>
            </select>
            <p v-if="aksesorisProducts.length === 0" class="field-hint text-warning">
              Belum ada produk lokal berkategori aksesoris di Master Produk.
            </p>
          </div>

          <div class="form-row">
            <div class="form-group col-qty">
              <label class="form-label" for="qty-stok">Jumlah Beli (Qty)</label>
              <input
                id="qty-stok"
                v-model.number="purchaseQty"
                type="number"
                min="1"
                class="form-input"
                data-testid="input-qty-stok"
                required
              />
            </div>

            <div class="form-group col-total">
              <label class="form-label" for="nominal-stok">Total Biaya Beli (Rp)</label>
              <input
                id="nominal-stok"
                type="text"
                class="form-input"
                data-testid="input-nominal"
                :value="displayNominal"
                required
                @input="onNominalInput"
              />
            </div>
          </div>

          <div class="form-group">
            <label class="form-label" for="source-account-stok">Akun Pembayaran (Kas / Rekening)</label>
            <select
              id="source-account-stok"
              v-model="sourceAccountId"
              class="form-select"
              data-testid="select-source-account"
              required
            >
              <option value="" disabled>Pilih Akun Sumber Dana...</option>
              <option
                v-for="acc in paymentAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
          </div>
        </div>

        <!-- 4. BELANJA LAIN / OPERASIONAL -->
        <div v-else-if="selectedTab === 'operasional'" class="form-card">
          <div class="form-group">
            <label class="form-label" for="source-account-operasional">Akun Sumber Dana (Kas / Rekening / E-Wallet)</label>
            <select
              id="source-account-operasional"
              v-model="sourceAccountId"
              class="form-select"
              data-testid="select-source-account"
              required
            >
              <option value="" disabled>Pilih Akun Sumber...</option>
              <option
                v-for="acc in paymentAccounts"
                :key="acc.id"
                :value="acc.id"
              >
                {{ acc.name }} (Saldo: {{ formatRupiah(balances[acc.id] ?? 0) }})
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="nominal-operasional">Nominal Pengeluaran (Rp)</label>
            <input
              id="nominal-operasional"
              type="text"
              class="form-input"
              data-testid="input-nominal"
              :value="displayNominal"
              required
              @input="onNominalInput"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="note-operasional">Catatan / Keperluan (Wajib)</label>
            <input
              id="note-operasional"
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Contoh: Belanja pribadi, listrik konter, ATK"
              data-testid="input-note"
              required
            />
          </div>
        </div>

        <!-- Nominal umum jika bukan pembelian_stok / operasional -->
        <div v-if="selectedTab === 'pindah_dana' || selectedTab === 'deposit'" class="form-card">
          <div class="form-group">
            <label class="form-label" for="nominal-general">Nominal Transfer / Top-Up (Rp)</label>
            <input
              id="nominal-general"
              type="text"
              class="form-input"
              data-testid="input-nominal"
              :value="displayNominal"
              required
              @input="onNominalInput"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="note-general">Catatan (Opsional)</label>
            <input
              id="note-general"
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Catatan tambahan (opsional)"
              data-testid="input-note"
            />
          </div>
        </div>

        <!-- Catatan untuk pembelian_stok -->
        <div v-if="selectedTab === 'pembelian_stok'" class="form-card">
          <div class="form-group">
            <label class="form-label" for="note-stok">Catatan Pembelian (Opsional)</label>
            <input
              id="note-stok"
              v-model="note"
              type="text"
              class="form-input"
              placeholder="Contoh: Grosir Pasar Sentral, nota #123"
              data-testid="input-note"
            />
          </div>
        </div>

        <!-- Tombol Submit -->
        <button
          type="submit"
          class="btn-submit"
          data-testid="btn-submit-owner-tx"
          :disabled="isSubmitting"
        >
          {{ isSubmitting ? 'Menyimpan...' : 'Simpan Transaksi Owner' }}
        </button>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { db } from '../db/database';
import { transactionService } from '../services/transactionService';
import { accountService } from '../services/accountService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah, parseRupiah } from '../utils/format';
import { AppError } from '../core/errors';
import type { Account, Product } from '../db/types';

const router = useRouter();
const authStore = useAuthStore();

const ownerTabs = [
  { key: 'pindah_dana', label: 'Pindah Dana' },
  { key: 'deposit', label: 'Top-Up Provider / Server' },
  { key: 'pembelian_stok', label: 'Beli Aksesoris / Stok' },
  { key: 'operasional', label: 'Belanja Lain / Operasional' },
];

const selectedTab = ref<'pindah_dana' | 'deposit' | 'pembelian_stok' | 'operasional'>('pindah_dana');
const depositType = ref<'deposit_provider' | 'deposit_server'>('deposit_provider');

const allAccounts = ref<Account[]>([]);
const balances = ref<Record<string, number>>({});
const aksesorisProducts = ref<Product[]>([]);

const sourceAccountId = ref('');
const destAccountId = ref('');
const selectedProductId = ref('');
const purchaseQty = ref(1);
const nominal = ref(0);
const note = ref('');

const isSubmitting = ref(false);
const errorMessage = ref('');
const successMessage = ref('');

const displayNominal = computed(() => {
  if (nominal.value === 0) return '';
  return nominal.value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
});

function onNominalInput(e: Event) {
  const target = e.target as HTMLInputElement;
  nominal.value = parseRupiah(target.value);
}

function selectTab(tabKey: string) {
  selectedTab.value = tabKey as typeof selectedTab.value;
  sourceAccountId.value = '';
  destAccountId.value = '';
  selectedProductId.value = '';
  purchaseQty.value = 1;
  nominal.value = 0;
  note.value = '';
  errorMessage.value = '';
  successMessage.value = '';
}

// Akun sumber kas/bank/ewallet aktif
const paymentAccounts = computed(() => {
  return allAccounts.value.filter(
    (a) => a.isActive && (a.type === 'kas' || a.type === 'bank' || a.type === 'ewallet')
  );
});

// Pindah dana: semua akun aktif
const availableSourceAccounts = computed(() => {
  return allAccounts.value.filter((a) => a.isActive && a.id !== destAccountId.value);
});

const availableDestAccounts = computed(() => {
  return allAccounts.value.filter((a) => a.isActive && a.id !== sourceAccountId.value);
});

// Deposit tujuan
const depositDestAccounts = computed(() => {
  const targetType = depositType.value === 'deposit_provider' ? 'provider_app' : 'server_pulsa';
  return allAccounts.value.filter((a) => a.isActive && a.type === targetType);
});

async function loadData() {
  allAccounts.value = await db.accounts.filter((a) => a.isActive).toArray();
  balances.value = await accountService.getAllBalances();
  aksesorisProducts.value = await db.products
    .filter((p) => p.isActive && p.category === 'aksesoris')
    .toArray();
}

onMounted(async () => {
  await loadData();
});

async function handleSubmit() {
  errorMessage.value = '';
  successMessage.value = '';
  isSubmitting.value = true;

  try {
    const actorUserId = authStore.currentUser?.id;
    if (!actorUserId) {
      throw new AppError('Sesi pengguna tidak valid. Silakan login kembali.');
    }

    if (!nominal.value || nominal.value <= 0) {
      throw new AppError('Nominal harus lebih besar dari Rp0.');
    }

    let layanan = '';
    let srcAcc = sourceAccountId.value;
    let dstAcc: string | undefined = destAccountId.value;
    let prodId: string | undefined = undefined;
    let cartItems: { productId: string; qty: number; nominal: number }[] | undefined = undefined;

    if (selectedTab.value === 'pindah_dana') {
      layanan = 'pindah_dana';
      if (!srcAcc || !dstAcc) {
        throw new AppError('Pilih akun asal dan akun tujuan pindah dana.');
      }
      if (srcAcc === dstAcc) {
        throw new AppError('Akun asal dan akun tujuan tidak boleh sama.');
      }
    } else if (selectedTab.value === 'deposit') {
      layanan = depositType.value;
      if (!srcAcc || !dstAcc) {
        throw new AppError('Pilih akun sumber dan akun tujuan deposit.');
      }
    } else if (selectedTab.value === 'pembelian_stok') {
      layanan = 'pembelian_stok';
      if (!selectedProductId.value) {
        throw new AppError('Pilih produk aksesoris yang dibeli.');
      }
      if (!purchaseQty.value || purchaseQty.value < 1) {
        throw new AppError('Jumlah beli minimal 1 pcs.');
      }
      if (!srcAcc) {
        throw new AppError('Pilih akun pembayaran untuk pembelian stok.');
      }
      prodId = selectedProductId.value;
      cartItems = [
        {
          productId: selectedProductId.value,
          qty: purchaseQty.value,
          nominal: nominal.value,
        },
      ];
      dstAcc = undefined;
    } else if (selectedTab.value === 'operasional') {
      layanan = 'operasional';
      if (!srcAcc) {
        throw new AppError('Pilih akun sumber dana operasional.');
      }
      if (!note.value || note.value.trim().length < 3) {
        throw new AppError('Catatan keperluan operasional wajib diisi (minimal 3 karakter).');
      }
      dstAcc = undefined;
    }

    await transactionService.addTransaction(
      {
        layanan,
        sourceAccountId: srcAcc,
        destAccountId: dstAcc,
        productId: prodId,
        cartItems,
        nominal: nominal.value,
        fee: 0,
        feePaidBy: 'cash',
        feeManualOverride: false,
        paymentMethod: 'tunai',
        paymentStatus: 'lunas',
        date: Date.now(),
        note: note.value.trim() || undefined,
      },
      {
        actorUserId,
        shiftId: null, // Transaksi Owner tidak memerlukan shift
      }
    );

    successMessage.value = 'Transaksi Owner berhasil disimpan.';
    await loadData();
    // Reset form
    nominal.value = 0;
    note.value = '';
    purchaseQty.value = 1;

    setTimeout(() => {
      router.push('/transactions');
    }, 1200);
  } catch (err: unknown) {
    if (err instanceof AppError) {
      errorMessage.value = err.message;
    } else if (err instanceof Error) {
      errorMessage.value = err.message;
    } else {
      errorMessage.value = 'Terjadi kesalahan saat menyimpan transaksi Owner.';
    }
  } finally {
    isSubmitting.value = false;
  }
}
</script>

<style scoped>
.owner-tx-container {
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
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  cursor: pointer;
  padding: 4px 8px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin: 0;
}

.feedback-banner {
  padding: 10px 14px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  font-weight: 600;
}

.feedback-banner.success {
  background: #ecfdf5;
  color: #065f46;
  border: 1px solid #a7f3d0;
}

.feedback-banner.error {
  background: #fef2f2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.owner-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.owner-tab-btn {
  padding: 8px 14px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.owner-tab-btn.active {
  background: var(--color-primary);
  color: var(--color-white);
  border-color: var(--color-primary);
}

.owner-tx-form {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.form-card {
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-btn);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
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

.form-select,
.form-input {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: var(--radius-sm);
  font-size: 14px;
  background: var(--surface-input);
  color: var(--text-main);
}

.form-row {
  display: flex;
  gap: 12px;
}

.col-qty {
  flex: 1;
}

.col-total {
  flex: 2;
}

.radio-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 4px;
}

.radio-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-main);
  cursor: pointer;
}

.field-hint {
  font-size: 12px;
  margin-top: 4px;
}

.text-warning {
  color: #b45309;
}

.btn-submit {
  padding: 12px;
  border-radius: var(--radius-btn);
  border: none;
  background: var(--color-primary);
  color: var(--color-white);
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}

.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
