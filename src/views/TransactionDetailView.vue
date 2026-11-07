<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Detail Transaksi</h2>
    </div>
    <div class="card-detail-placeholder">
      <p>Detail Transaksi & Bukti (Fase 1)</p>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import AppScaffold from '../components/AppScaffold.vue';
</script>

<style scoped>
.view-header {
  margin-bottom: 16px;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}
.card-detail-placeholder {
  background: var(--surface-card);
  padding: 24px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  text-align: center;
  color: var(--text-secondary);
}
</style>
