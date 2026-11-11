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
          role="button"
          tabindex="0"
          :title="`Klik untuk edit ${p.name}`"
          :data-testid="`product-card-${p.id}`"
          @click="handleCardClick(p.id)"
          @keydown.enter="handleCardClick(p.id)"
        >
          <div class="prod-left">
            <span class="prod-name">{{ p.name }}</span>
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
            <ChevronRight class="prod-arrow" />
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
import type { Product } from '../db/types';

const router = useRouter();
const products = ref<Product[]>([]);
const selectedCategory = ref<string>('all');

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
  products.value = await db.products.toArray();
});

const filteredProducts = computed(() => {
  if (selectedCategory.value === 'all') return products.value;
  return products.value.filter((p) => p.category === selectedCategory.value);
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
