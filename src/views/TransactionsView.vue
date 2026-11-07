<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Riwayat Transaksi</h2>
    </div>
    <EmptyState
      title="Belum Ada Transaksi"
      description="Semua transaksi yang Anda catat akan muncul di sini lengkap dengan status dan filternya."
    >
      <template #action>
        <router-link to="/transactions/add" class="btn-primary">
          + Catat Transaksi Baru
        </router-link>
      </template>
    </EmptyState>
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
.btn-primary {
  display: inline-block;
  padding: 10px 18px;
  font-size: 13px;
  font-weight: 700;
  background: var(--color-primary);
  color: #ffffff;
  border-radius: var(--radius-btn);
  text-decoration: none;
}
</style>
