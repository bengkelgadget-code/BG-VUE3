<template>
  <div class="empty-state">
    <div class="icon-box">
      <slot name="icon">
        <component :is="icon" v-if="icon" class="empty-icon" />
      </slot>
    </div>
    <h3 class="empty-title">{{ title }}</h3>
    <p v-if="description" class="empty-desc">{{ description }}</p>
    <div v-if="$slots.action" class="empty-action">
      <slot name="action" />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { Component } from 'vue';

defineProps<{
  title: string;
  description?: string;
  icon?: Component;
}>();
</script>

<style scoped>
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 32px 20px;
  text-align: center;
  background: var(--surface-card);
  border-radius: var(--radius-card);
  border: 1px dashed var(--border-color);
  margin: 16px 0;
}

.icon-box {
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--surface-card-subtle);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 12px;
  color: var(--text-secondary);
}

.empty-icon {
  width: 28px;
  height: 28px;
}

.empty-title {
  font-size: 16px;
  font-weight: 700;
  color: var(--text-main);
  margin-bottom: 6px;
}

.empty-desc {
  font-size: 13px;
  color: var(--text-secondary);
  max-width: 280px;
  margin-bottom: 16px;
  line-height: 1.4;
}

.empty-action {
  margin-top: 4px;
}
</style>
