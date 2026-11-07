<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Daftar Piutang Pelanggan</h2>
    </div>
    <EmptyState
      title="Tidak Ada Piutang Tertunda"
      description="Semua transaksi pelanggan saat ini lunas. Transaksi berstatus Hutang akan tampil di sini."
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
