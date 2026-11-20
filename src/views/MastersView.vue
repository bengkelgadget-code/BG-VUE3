<template>
  <AppScaffold>
    <div class="masters-container">
      <div class="view-header">
        <div class="header-title-block">
          <h2 class="page-title">Master Produk</h2>
          <span v-if="lastSyncText" class="sync-timestamp" data-testid="sync-timestamp">{{ lastSyncText }}</span>
        </div>
        <div class="header-actions">
          <button
            v-if="authStore.isAdmin"
            type="button"
            class="btn-sync"
            :disabled="isSyncing"
            title="Sinkronkan Katalog Server Pulsa"
            data-testid="btn-sync-catalog"
            @click="() => handleManualSync(false)"
          >
            <RefreshCw class="sync-icon" :class="{ 'spin-anim': isSyncing }" />
            <span>{{ isSyncing ? 'Menyinkronkan...' : 'Sinkronkan Katalog' }}</span>
          </button>
          <router-link to="/masters/product/add" class="btn-add">
            + Tambah Produk
          </router-link>
        </div>
      </div>

      <!-- Umpan balik aktivasi produk (b21-D): jangan gagal diam-diam -->
      <div v-if="activateSuccessMessage" class="activate-banner success" data-testid="activate-success">
        {{ activateSuccessMessage }}
      </div>
      <div v-if="activateErrorMessage" class="activate-banner error" data-testid="activate-error">
        {{ activateErrorMessage }}
      </div>

      <!-- Umpan balik sinkronisasi katalog -->
      <div v-if="syncMessage" class="activate-banner success" data-testid="sync-success">
        {{ syncMessage }}
      </div>
      <div v-if="syncError" class="activate-banner error" data-testid="sync-error">
        <div class="sync-error-content">
          <span>{{ syncError }}</span>
          <button type="button" class="btn-retry-sync" @click="() => handleManualSync(false)">
            Coba Lagi
          </button>
        </div>
      </div>

      <!-- Category Filter Tabs: pulsa, token_pln, game, voucher, perdana, aksesoris (b24) -->
      <div class="category-tabs">
        <button
          v-for="cat in categories"
          :key="cat.key"
          type="button"
          class="cat-tab"
          :class="{ active: selectedCategory === cat.key }"
          @click="selectedCategory = cat.key"
        >
          {{ cat.label }}
        </button>
      </div>

      <!-- Pencarian produk (b22) -->
      <div class="search-box">
        <Search class="search-icon" />
        <input
          v-model="searchQuery"
          type="text"
          class="search-input"
          placeholder="Cari nama produk atau operator…"
          data-testid="search-produk"
          aria-label="Cari produk"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="search-clear"
          data-testid="search-clear"
          title="Bersihkan pencarian"
          aria-label="Bersihkan pencarian"
          @click="searchQuery = ''"
        >
          <X class="search-clear-icon" />
        </button>
      </div>

      <!-- Bantuan saat produk lokal kosong tapi katalog tersedia -->
      <div
        v-if="localProducts.length === 0 && catalogEntries.length > 0 && filteredProducts.length > 0"
        class="catalog-helper-banner"
        data-testid="catalog-helper-banner"
      >
        💡 Ketuk produk katalog untuk mengatur modal & harga jual.
      </div>

      <!-- Empty State: Hasil Pencarian Kosong -->
      <EmptyState
        v-if="filteredProducts.length === 0 && searchQuery.trim() !== ''"
        title="Tidak Ada Produk yang Cocok"
        :description="`Tidak ada produk yang cocok dengan '${searchQuery.trim()}'. Coba kata kunci lain.`"
      >
        <template #action>
          <button
            type="button"
            class="btn-primary"
            data-testid="search-clear-empty"
            @click="searchQuery = ''"
          >
            Bersihkan Pencarian
          </button>
        </template>
      </EmptyState>

      <!-- Empty State: Belum Ada Produk Master (Lokal & Katalog Kosong) -->
      <EmptyState
        v-else-if="filteredProducts.length === 0 && localProducts.length === 0 && catalogEntries.length === 0"
        title="Belum Ada Produk Master"
        description="Master produk lokal kosong saat awal. Tambahkan voucher, perdana, aksesoris, atau sinkronkan katalog Server Pulsa."
      >
        <template #action>
          <div class="empty-actions">
            <button
              v-if="authStore.isAdmin"
              type="button"
              class="btn-primary"
              :disabled="isSyncing"
              @click="() => handleManualSync(false)"
            >
              Sinkronkan Katalog Sekarang
            </button>
            <router-link to="/masters/product/add" class="btn-primary">
              + Tambah Produk Pertama
            </router-link>
          </div>
        </template>
      </EmptyState>

      <!-- Empty State: Kategori Kosong -->
      <EmptyState
        v-else-if="filteredProducts.length === 0"
        title="Belum Ada Produk di Kategori Ini"
        description="Tidak ada produk lokal maupun katalog aktif pada kategori yang dipilih."
      >
        <template #action>
          <router-link to="/masters/product/add" class="btn-primary">
            + Tambah Produk Baru
          </router-link>
        </template>
      </EmptyState>

      <!-- Daftar Produk (Lokal + Katalog Gabungan) -->
      <div v-else class="product-list">
        <div
          v-for="p in filteredProducts"
          :key="p.id"
          class="product-card"
          :class="{
            'product-inactive': p.isActive === false,
            'catalog-card': p.isCatalog,
          }"
          role="button"
          tabindex="0"
          :title="p.isCatalog ? `Atur modal & harga jual untuk ${p.name}` : `Klik untuk edit ${p.name}`"
          :data-testid="`product-card-${p.id}`"
          @click="handleCardClick(p)"
          @keydown.enter="handleCardClick(p)"
        >
          <div class="prod-left">
            <div class="prod-name-row">
              <span class="prod-name">{{ p.name }}</span>
              <span v-if="p.isCatalog" class="badge-catalog" data-testid="badge-catalog">KATALOG</span>
              <span v-else-if="p.isActive === false" class="badge-inactive" data-testid="badge-inactive">NONAKTIF</span>
            </div>
            <span class="prod-cat">{{ p.category.toUpperCase() }} {{ p.operator ? `• ${p.operator}` : '' }}</span>
            <span v-if="!p.isCatalog && p.stock !== null" class="prod-stock">
              Stok: <strong>{{ p.stock }}</strong> pcs (Min: {{ p.stockMin }})
            </span>
            <span v-else-if="p.isCatalog" class="prod-sku">
              SKU: {{ p.id }}
            </span>
          </div>

          <div class="prod-right-wrapper">
            <div v-if="p.isCatalog" class="prod-right catalog-pricing">
              <span class="prod-jual money-display" :class="{ 'text-muted': !p.hargaJual }">Jual: {{ p.hargaJual ? formatRupiah(p.hargaJual) : '—' }}</span>
              <span class="prod-modal money-display" :class="{ 'text-muted': !p.modal }">Modal: {{ p.modal ? formatRupiah(p.modal) : '—' }}</span>
              <span class="prod-hint-setup">{{ (p.hargaJual || p.modal) ? 'Atur / Pakai (Harga DB) →' : 'Atur Harga →' }}</span>
            </div>
            <div v-else class="prod-right">
              <span class="prod-jual money-display">Jual: {{ formatRupiah(p.hargaJual) }}</span>
              <span class="prod-modal money-display">Modal: {{ formatRupiah(p.modal) }}</span>
              <span class="prod-laba money-display">Laba: {{ formatRupiah(p.hargaJual - p.modal) }}</span>
            </div>

            <button
              v-if="!p.isCatalog && p.isActive === false"
              type="button"
              class="btn-activate-card"
              :data-testid="`btn-activate-${p.id}`"
              title="Aktifkan produk ini"
              @click.stop="handleActivateProduct(p.id)"
            >
              Aktifkan
            </button>
            <ChevronRight v-else class="prod-arrow" />
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ChevronRight, Search, X, RefreshCw } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { db } from '../db/database';
import { formatRupiah, formatTanggalWita } from '../utils/format';
import { productService } from '../services/productService';
import { catalogService } from '../services/catalogService';
import { useAuthStore } from '../stores/authStore';
import { compareProducts } from '../utils/productSort';
import type { Product, ProductCategory, ProductCatalogEntry } from '../db/types';

interface DisplayItem {
  id: string;
  name: string;
  category: ProductCategory;
  operator?: string;
  modal: number;
  hargaJual: number;
  stock: number | null;
  stockMin?: number;
  isActive?: boolean;
  isCatalog: boolean;
  externalProductRef?: string;
}

const router = useRouter();
const authStore = useAuthStore();

const localProducts = ref<Product[]>([]);
const catalogEntries = ref<ProductCatalogEntry[]>([]);
const selectedCategory = ref<string>('all');
const searchQuery = ref<string>('');

const activateSuccessMessage = ref<string>('');
const activateErrorMessage = ref<string>('');

const isSyncing = ref<boolean>(false);
const syncMessage = ref<string>('');
const syncError = ref<string>('');
const lastSyncText = ref<string>('');

/**
 * Urutan kategori chip (b24):
 * pulsa -> token_pln -> game -> voucher -> perdana -> aksesoris
 * Catatan: Kategori 'data' dihapus dari chip dan diganti 'game' (revisi 20 Nov 2026).
 * Produk lokal 'data' tetap tampil di chip 'Semua' dan pencarian.
 */
const categories = [
  { key: 'all', label: 'Semua' },
  { key: 'pulsa', label: 'Pulsa' },
  { key: 'token_pln', label: 'Token PLN' },
  { key: 'game', label: 'Game' },
  { key: 'voucher', label: 'Voucher' },
  { key: 'perdana', label: 'Perdana' },
  { key: 'aksesoris', label: 'Aksesoris' },
];

onMounted(async () => {
  await loadData();
  await checkAndAutoSync();
});

async function loadData() {
  localProducts.value = await db.products.toArray();
  catalogEntries.value = await db.productCatalogCache.filter((c) => c.isActive).toArray();
  await updateLastSyncText();
}

async function updateLastSyncText() {
  const ts = await catalogService.getLastSyncAt();
  if (ts > 0) {
    lastSyncText.value = `Terakhir sync: ${formatTanggalWita(ts, { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    lastSyncText.value = '';
  }
}

async function checkAndAutoSync() {
  if (typeof import.meta !== 'undefined' && import.meta.env?.MODE === 'test') {
    return;
  }
  const count = await db.productCatalogCache.count();
  if (count === 0 && authStore.isAdmin) {
    await handleManualSync(true);
  }
}

async function handleManualSync(isAuto = false) {
  if (isSyncing.value) return;
  isSyncing.value = true;
  syncError.value = '';
  if (!isAuto) syncMessage.value = '';

  try {
    const res = await catalogService.syncCatalog({
      actorUserId: authStore.currentUser?.id || 'system',
    });
    await loadData();
    const localInfo = res.localUpdated ? `, ${res.localUpdated} harga produk lokal diperbarui` : '';
    let msg = `Sinkronisasi selesai: ${res.added + res.updated} produk katalog (${res.added} baru, ${res.updated} diperbarui${localInfo}).`;
    if (res.notice) {
      msg += ` ${res.notice}`;
    }
    syncMessage.value = msg;
  } catch (err: unknown) {
    syncError.value =
      err instanceof Error
        ? err.message
        : 'Gagal menyinkronkan katalog Server Pulsa.';
  } finally {
    isSyncing.value = false;
  }
}

async function handleActivateProduct(id: string) {
  activateSuccessMessage.value = '';
  activateErrorMessage.value = '';
  try {
    await productService.activateProduct(id, {
      actorUserId: authStore.currentUser?.id || 'system',
    });
    await loadData();
    activateSuccessMessage.value = 'Produk berhasil diaktifkan kembali.';
  } catch (err) {
    activateErrorMessage.value =
      err instanceof Error ? err.message : 'Gagal mengaktifkan produk.';
  }
}

function handleCardClick(item: DisplayItem) {
  if (item.isCatalog) {
    router.push({
      path: '/masters/product/add',
      query: { catalog: item.id },
    });
  } else {
    router.push(`/masters/product/${item.id}/edit`);
  }
}

/**
 * Menggabungkan produk lokal dan entri katalog aktif:
 * - Dedupe: jika SKU katalog sudah menjadi produk lokal, kartu katalog dilewati.
 * - Filter kategori & query pencarian.
 * - Urutkan dengan compareProducts (kategori dulu, lalu aturan b23 di dalam kategori).
 */
const filteredProducts = computed<DisplayItem[]>(() => {
  const q = searchQuery.value.trim().toLowerCase();

  const localCatalogRefs = new Set(
    localProducts.value
      .map((p) => p.externalProductRef)
      .filter((ref): ref is string => Boolean(ref))
  );

  const items: DisplayItem[] = [];

  for (const p of localProducts.value) {
    items.push({
      id: p.id,
      name: p.name,
      category: p.category,
      operator: p.operator,
      modal: p.modal,
      hargaJual: p.hargaJual,
      stock: p.stock ?? null,
      stockMin: p.stockMin,
      isActive: p.isActive !== false,
      isCatalog: false,
      externalProductRef: p.externalProductRef,
    });
  }

  for (const c of catalogEntries.value) {
    if (!localCatalogRefs.has(c.id)) {
      items.push({
        id: c.id,
        name: c.name,
        category: c.category,
        operator: c.operator,
        modal: c.modal ?? 0,
        hargaJual: c.hargaJual ?? 0,
        stock: null,
        isActive: true,
        isCatalog: true,
      });
    }
  }

  const matched = items.filter((item) => {
    const matchesCategory =
      selectedCategory.value === 'all' || item.category === selectedCategory.value;
    const matchesQuery =
      q === '' ||
      item.name.toLowerCase().includes(q) ||
      (item.operator ?? '').toLowerCase().includes(q);
    const matchesActive = q !== '' ? true : item.isActive !== false;
    return matchesCategory && matchesQuery && matchesActive;
  });

  return [...matched].sort(compareProducts);
});
</script>

<style scoped>
.masters-container {
  display: flex;
  flex-direction: column;
  gap: 14px;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.header-title-block {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.sync-timestamp {
  font-size: 11px;
  color: var(--text-muted);
}

.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.btn-sync {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--surface-card);
  color: var(--color-primary);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: all var(--transition-fast);
}

.btn-sync:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.sync-icon {
  width: 14px;
  height: 14px;
}

.spin-anim {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.btn-add {
  padding: 8px 14px;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
}

.search-box {
  position: relative;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  width: 16px;
  height: 16px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-input {
  width: 100%;
  height: 44px;
  padding: 0 40px 0 36px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}

.search-input:focus {
  border-color: var(--color-primary);
}

.search-clear {
  position: absolute;
  right: 6px;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 50%;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.search-clear:hover {
  background: var(--bg-hover, #e2e8f0);
}

.search-clear-icon {
  width: 16px;
  height: 16px;
}

.activate-banner {
  padding: 10px 14px;
  border-radius: var(--radius-btn);
  font-size: 13px;
  font-weight: 600;
}

.activate-banner.success {
  background: var(--color-success-subtle, #dcfce7);
  color: var(--color-success);
}

.activate-banner.error {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.sync-error-content {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.btn-retry-sync {
  padding: 4px 8px;
  background: var(--color-danger);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
}

.catalog-helper-banner {
  padding: 8px 12px;
  background: var(--surface-card-subtle);
  border-left: 3px solid var(--color-primary);
  border-radius: var(--radius-sm);
  font-size: 12px;
  color: var(--text-secondary);
}

.category-tabs {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 4px;
}

.cat-tab {
  padding: 6px 14px;
  border-radius: var(--radius-chip);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
}

.cat-tab.active {
  background: var(--color-primary);
  color: var(--color-white);
  border-color: var(--color-primary);
}

.product-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.product-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--surface-card);
  padding: 12px 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}

.product-card:hover {
  border-color: var(--color-primary);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.05);
  transform: translateY(-1px);
}

.product-card:active {
  transform: translateY(0);
}

.catalog-card {
  border-style: dashed;
  background: var(--surface-card);
}

.prod-left {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex: 1;
  min-width: 0;
}

.prod-name {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
  word-break: break-word;
}

.prod-cat {
  font-size: 11px;
  font-weight: 600;
  color: var(--color-primary);
}

.prod-stock,
.prod-sku {
  font-size: 11px;
  color: var(--text-muted);
}

.prod-right-wrapper {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}

.prod-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.catalog-pricing {
  align-items: flex-end;
}

.prod-hint-setup {
  font-size: 11px;
  font-weight: 700;
  color: var(--color-primary);
}

.prod-arrow {
  width: 18px;
  height: 18px;
  color: var(--text-muted);
  transition: transform 0.15s ease, color 0.15s ease;
}

.product-card:hover .prod-arrow {
  color: var(--color-primary);
  transform: translateX(2px);
}

.prod-jual {
  font-size: 14px;
  font-weight: 700;
  color: var(--text-main);
}

.prod-modal {
  font-size: 12px;
  color: var(--text-secondary);
}

.prod-laba {
  font-size: 12px;
  font-weight: 700;
  color: var(--color-income);
}

.prod-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.badge-inactive {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--bg-hover, #e2e8f0);
  color: var(--text-muted, #64748b);
  letter-spacing: 0.5px;
}

.badge-catalog {
  font-size: 10px;
  font-weight: 800;
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--color-primary-subtle, #e0f2fe);
  color: var(--color-primary);
  border: 1px solid var(--color-primary);
  letter-spacing: 0.5px;
}

.product-inactive {
  opacity: 0.75;
  background: var(--bg-secondary, #f8fafc);
  border: 1px dashed var(--border-color);
}

.btn-activate-card {
  padding: 6px 12px;
  background: var(--color-success, #10b981);
  color: #fff;
  border: none;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.2s;
}

.btn-activate-card:hover {
  opacity: 0.9;
}

.empty-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.btn-primary {
  display: inline-block;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-btn);
  border: none;
  text-decoration: none;
  cursor: pointer;
}
</style>
