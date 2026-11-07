<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Daftar Akun Saldo</h2>
    </div>
    <EmptyState
      title="Belum Ada Akun Saldo"
      description="Daftar akun saldo kosong saat pertama kali diinstal. Silakan tambahkan akun Kas, Bank, atau E-Wallet."
    >
      <template #action>
        <router-link to="/accounts/add" class="btn-primary">
          + Tambah Akun
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
