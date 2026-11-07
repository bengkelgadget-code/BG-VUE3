<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Master Pelanggan</h2>
    </div>
    <EmptyState
      title="Belum Ada Pelanggan"
      description="Daftar pelanggan kosong. Tambahkan pelanggan untuk pencatatan transaksi hutang."
    >
      <template #action>
        <router-link to="/customers/add" class="btn-primary">
          + Tambah Pelanggan
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
