<template>
  <AppScaffold>
    <div class="feerules-container">
      <div class="view-header">
        <h2 class="page-title">Master Tarif Biaya Admin</h2>
        <router-link to="/fee-rules/add" class="btn-add">
          + Atur Tarif Baru
        </router-link>
      </div>

      <p class="section-intro">
        Form Master Tarif (meniru Pengaturan_Margin BG-APP): Biaya admin terisi otomatis saat transaksi kasir sesuai rentang nominal.
      </p>

      <EmptyState
        v-if="groupedRules.length === 0"
        title="Belum Ada Aturan Tarif"
        description="Tabel tarif kosong saat awal. Anda dapat membuat range tarif admin (mis. 20rb - 100rb -> Rp3.000, >= 5jt -> 0,4%)."
      >
        <template #action>
          <router-link to="/fee-rules/add" class="btn-primary">
            + Buat Aturan Tarif Pertama
          </router-link>
        </template>
      </EmptyState>

      <div v-else class="rule-list">
        <div v-for="grp in groupedRules" :key="grp.groupId" class="rule-card">
          <div class="rule-header">
            <span class="range-badge">
              {{ formatRupiah(grp.minNom) }} s.d. {{ grp.maxNom !== null ? formatRupiah(grp.maxNom) : 'Tanpa Batas' }}
            </span>
            <span class="fee-badge" :class="grp.feeType">
              {{ grp.feeType === 'persentase' ? `${grp.persentaseVal}% (Ceil)` : formatRupiah(grp.valMargin || 0) }}
            </span>
          </div>

          <div class="services-chips">
            <span v-for="srv in grp.services" :key="srv" class="srv-chip">
              {{ srv.replace('_', ' ').toUpperCase() }}
            </span>
          </div>

          <div class="rule-actions">
            <button
              class="btn-deactivate"
              :disabled="!grp.isActive"
              @click="handleDeactivateGroup(grp.groupId)"
            >
              {{ grp.isActive ? 'Nonaktifkan Aturan' : 'Nonaktif' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import AppScaffold from '../components/AppScaffold.vue';
import EmptyState from '../components/EmptyState.vue';
import { db } from '../db/database';
import { feeRuleService } from '../services/feeRuleService';
import { formatRupiah } from '../utils/format';
import type { AdminFeeRule } from '../db/types';

interface GroupedRule {
  groupId: string;
  minNom: number;
  maxNom: number | null;
  feeType: 'tetap' | 'persentase';
  valMargin: number | null;
  persentaseVal: number | null;
  services: string[];
  isActive: boolean;
}

const allRules = ref<AdminFeeRule[]>([]);

onMounted(async () => {
  await loadData();
});

async function loadData() {
  allRules.value = await db.adminFeeRules.toArray();
}

const groupedRules = computed(() => {
  const map: Record<string, GroupedRule> = {};

  for (const r of allRules.value) {
    if (!map[r.groupId]) {
      map[r.groupId] = {
        groupId: r.groupId,
        minNom: r.minNom,
        maxNom: r.maxNom,
        feeType: r.feeType,
        valMargin: r.valMargin,
        persentaseVal: r.persentaseVal,
        services: [],
        isActive: r.isActive,
      };
    }
    map[r.groupId]!.services.push(r.layanan);
  }

  return Object.values(map);
});

async function handleDeactivateGroup(groupId: string) {
  await feeRuleService.deactivateGroup(groupId);
  await loadData();
}
</script>

<style scoped>
.feerules-container {
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
  color: #ffffff;
  border-radius: var(--radius-chip);
  font-size: 12px;
  font-weight: 700;
  text-decoration: none;
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
}

.rule-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rule-card {
  background: var(--surface-card);
  padding: 14px;
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.rule-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.range-badge {
  font-size: 13px;
  font-weight: 700;
  color: var(--text-main);
}

.fee-badge {
  font-size: 13px;
  font-weight: 800;
  padding: 3px 10px;
  border-radius: var(--radius-chip);
}

.fee-badge.tetap {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
}

.fee-badge.persentase {
  background: #E0E7FF;
  color: #4338CA;
}

.services-chips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.srv-chip {
  font-size: 10px;
  font-weight: 600;
  background: var(--surface-card-subtle);
  color: var(--text-secondary);
  padding: 2px 8px;
  border-radius: var(--radius-chip);
}

.rule-actions {
  display: flex;
  justify-content: flex-end;
}

.btn-deactivate {
  background: transparent;
  border: none;
  font-size: 11px;
  font-weight: 600;
  color: var(--color-danger);
  cursor: pointer;
}

.btn-deactivate:disabled {
  color: var(--text-muted);
  cursor: not-allowed;
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
