<template>
  <AppScaffold>
    <div class="masters-container">
      <div class="view-header">
        <h2 class="page-title">Master Produk</h2>
        <router-link to="/masters/product/add" class="btn-add">
          + Tambah Produk
        </router-link>
      </div>

      <p class="section-intro">
        Modal dan harga jual diatur di sini oleh Owner/Admin. Kasir tidak melihat nilai modal.
      </p>

      <!-- Category Filter Tabs -->
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

      <!-- Filter Tampilkan Nonaktif -->
      <div class="filter-controls">
        <label class="filter-inactive-label" data-testid="filter-inactive-label">
          <input
            v-model="showInactive"
            type="checkbox"
            data-testid="toggle-show-inactive"
            class="checkbox-inactive"
          />
          <span>Tampilkan Produk Nonaktif</span>
        </label>
      </div>

      <EmptyState
        v-if="filteredProducts.length === 0"
        title="Belum Ada Produk Master"
        description="Master produk lokal kosong saat awal. Tambahkan voucher, perdana, aksesoris, atau pulsa."
      >
        <template #action>
          <router-link to="/masters/product/add" class="btn-primary">
            + Tambah Produk Pertama
          </router-link>
        </template>
      </EmptyState>

      <div v-else class="product-list">
        <div
          v-for="p in filteredProducts"
          :key="p.id"
          class="product-card"
          :class="{ 'product-inactive': p.isActive === false }"
          role="button"
          tabindex="0"
          :title="`Klik untuk edit ${p.name}`"
          :data-testid="`product-card-${p.id}`"
          @click="handleCardClick(p.id)"
          @keydown.enter="handleCardClick(p.id)"
        >
          <div class="prod-left">
            <div class="prod-name-row">
              <span class="prod-name">{{ p.name }}</span>
              <span v-if="p.isActive === false" class="badge-inactive" data-testid="badge-inactive">NONAKTIF</span>
            </div>
            <span class="prod-cat">{{ p.category.toUpperCase() }} {{ p.operator ? `• ${p.operator}` : '' }}</span>
            <span v-if="p.stock !== null" class="prod-stock">
              Stok: <strong>{{ p.stock }}</strong> pcs (Min: {{ p.stockMin }})
            </span>
          </div>

          <div class="prod-right-wrapper">
            <div class="prod-right">
              <span class="prod-jual money-display">Jual: {{ formatRupiah(p.hargaJual) }}</span>
              <span class="prod-modal money-display">Modal: {{ formatRupiah(p.modal) }}</span>
              <span class="prod-laba money-display">Laba: {{ formatRupiah(p.hargaJual - p.modal) }}</span>
            </div>
            <button
              v-if="p.isActive === false"
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
import { ChevronRight } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { db } from '../db/database';
import { formatRupiah } from '../utils/format';
import { productService } from '../services/productService';
import { useAuthStore } from '../stores/authStore';
import type { Product } from '../db/types';

const router = useRouter();
const authStore = useAuthStore();
const products = ref<Product[]>([]);
const selectedCategory = ref<string>('all');
const showInactive = ref<boolean>(false);

async function loadData() {
  products.value = await db.products.toArray();
}

async function handleActivateProduct(id: string) {
  try {
    await productService.activateProduct(id, {
      actorUserId: authStore.currentUser?.id || 'system',
    });
    await loadData();
  } catch (err) {
    console.error('Gagal mengaktifkan produk:', err);
  }
}

function handleCardClick(productId: string) {
  router.push(`/masters/product/${productId}/edit`);
}

const categories = [
  { key: 'all', label: 'Semua' },
  { key: 'voucher', label: 'Voucher' },
  { key: 'perdana', label: 'Perdana' },
  { key: 'aksesoris', label: 'Aksesoris' },
  { key: 'pulsa', label: 'Pulsa' },
  { key: 'data', label: 'Paket Data' },
  { key: 'token_pln', label: 'Token PLN' },
];

onMounted(async () => {
  await loadData();
});

const filteredProducts = computed(() => {
  return products.value.filter((p) => {
    const matchesCategory = selectedCategory.value === 'all' || p.category === selectedCategory.value;
    const matchesActive = showInactive.value ? true : p.isActive !== false;
    return matchesCategory && matchesActive;
  });
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
}

.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.btn-add {
  padding: 8px 14px;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.section-intro {
  font-size: 13px;
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

.filter-controls {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: -4px;
}

.filter-inactive-label {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
  user-select: none;
}

.checkbox-inactive {
  cursor: pointer;
  accent-color: var(--color-primary);
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

.prod-stock {
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

.btn-primary {
  display: inline-block;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  background: var(--color-primary);
  color: var(--color-white);
  border-radius: var(--radius-btn);
  text-decoration: none;
}
</style>
