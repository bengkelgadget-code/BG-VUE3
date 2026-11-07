<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Laporan Keuangan</h2>
    </div>
    <EmptyState
      title="Belum Ada Laporan Transaksi"
      description="Laporan laba per kategori, mutasi per akun, dan tren harian akan ditampilkan di sini."
    />
  </AppScaffold>
</template>

<script setup lang="ts">
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
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
</style>
