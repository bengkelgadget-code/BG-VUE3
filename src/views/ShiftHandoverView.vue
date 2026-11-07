<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Serah Terima Shift</h2>
    </div>
    <div class="card-form-placeholder">
      <p>Serah Terima 7 Langkah & Konfirmasi PIN Ganda (Fase 2)</p>
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
.card-form-placeholder {
  background: var(--surface-card);
  padding: 24px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  text-align: center;
  color: var(--text-secondary);
}
</style>
