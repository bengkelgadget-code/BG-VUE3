<template>
  <div v-if="noRuleBanner" class="fee-banner-warning">
    <AlertTriangle class="icon-warning" />
    <span>Belum ada tarif untuk nominal ini — admin Rp0. Minta owner/admin atur tarifnya.</span>
  </div>
  <div v-else-if="ruleName" class="fee-badge-info">
    <CheckCircle class="icon-info" />
    <span>Tarif: {{ ruleName }}</span>
  </div>
</template>

<script setup lang="ts">
import { AlertTriangle, CheckCircle } from 'lucide-vue-next';

defineProps<{
  noRuleBanner?: boolean;
  ruleName?: string;
}>();
</script>

<style scoped>
.fee-banner-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--color-warning-subtle);
  color: var(--color-warning);
  padding: 8px 12px;
  border-radius: var(--radius-btn);
  font-size: 12px;
  font-weight: 600;
  margin-top: 6px;
}

.fee-badge-info {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  padding: 4px 10px;
  border-radius: var(--radius-chip);
  font-size: 11px;
  font-weight: 600;
  margin-top: 4px;
}

.icon-warning,
.icon-info {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}
</style>
