<template>
  <AppScaffold>
    <div class="view-header">
      <button class="btn-back" @click="router.back()">← Kembali</button>
      <h2 class="page-title">Serah Terima Shift</h2>
    </div>

    <!-- Alert / Feedback -->
    <div v-if="successMsg" class="feedback-banner success">
      {{ successMsg }}
    </div>
    <div v-if="errorMsg" class="feedback-banner error">
      {{ errorMsg }}
    </div>

    <div v-if="isLoading" class="loading-state">
      <p>Memuat data shift...</p>
    </div>

    <div v-else-if="!shift" class="empty-box">
      <p>Shift tidak ditemukan atau belum ditutup.</p>
      <button class="btn-primary-sm" @click="router.push('/shifts')">Ke Riwayat Shift</button>
    </div>

    <div v-else class="handover-form-container">
      <!-- Rincian Shift yang diserahterimakan -->
      <div class="summary-card">
        <span class="card-badge">SHIFT: {{ shift.id.substring(0, 8) }}</span>
        <h3 class="card-title">Angka Fisik yang Diserahterimakan</h3>
        <p class="card-subtitle">Penerima menerima fisik kas dan saldo nyata yang telah dihitung bersama.</p>

        <div class="physical-breakdown">
          <div v-for="(val, accId) in shift.hitungFisik || {}" :key="accId" class="breakdown-row">
            <span class="acc-name">{{ getAccountName(accId) }}</span>
            <span class="acc-val">{{ formatRupiah(val) }}</span>
          </div>
        </div>

        <div v-if="hasDiscrepancy" class="discrepancy-warning">
          <strong>⚠️ Terdapat Selisih Fisik vs Sistem</strong>
          <div v-for="(diff, accId) in shift.selisih || {}" :key="accId">
            <span v-if="diff !== 0" class="diff-text">
              {{ getAccountName(accId) }}: {{ diff > 0 ? '+' : '' }}{{ formatRupiah(diff) }}
              ({{ shift.penjelasanSelisih?.[accId] || 'Tanpa penjelasan' }})
            </span>
          </div>
        </div>
      </div>

      <!-- Form Serah Terima -->
      <form class="form-card" @submit.prevent="handleSubmitHandover">
        <div class="form-group">
          <label class="form-label">Petugas Penerima Shift *</label>
          <select v-model="toUserId" class="form-select" required>
            <option value="" disabled>Pilih Petugas yang Menerima</option>
            <option v-for="user in availableRecipients" :key="user.id" :value="user.id">
              {{ user.name }} ({{ user.role.toUpperCase() }})
            </option>
          </select>
        </div>

        <div class="dual-pin-grid">
          <div class="form-group">
            <label class="form-label">PIN Petugas Lama ({{ currentUserName }}) *</label>
            <input
              v-model="fromPin"
              type="password"
              maxlength="6"
              inputmode="numeric"
              placeholder="PIN 4-6 angka"
              class="form-input"
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label">PIN Petugas Penerima *</label>
            <input
              v-model="toPin"
              type="password"
              maxlength="6"
              inputmode="numeric"
              placeholder="PIN 4-6 angka"
              class="form-input"
              required
            />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label">Catatan Serah Terima (Opsional)</label>
          <input
            v-model="note"
            type="text"
            class="form-input"
            placeholder="Contoh: Titip uang kas cadangan Rp 100.000 di laci"
          />
        </div>

        <div class="action-footer">
          <button type="submit" class="btn-submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Memproses Serah Terima...' : 'Konfirmasi Serah Terima (2 PIN)' }}
          </button>
        </div>
      </form>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import AppScaffold from '../components/AppScaffold.vue';
import { db } from '../db/database';
import type { Shift, User, Account } from '../db/types';
import { shiftService } from '../services/shiftService';
import { useAuthStore } from '../stores/authStore';
import { formatRupiah } from '../utils/format';

const route = useRoute();
const router = useRouter();
const authStore = useAuthStore();

const shift = ref<Shift | null>(null);
const users = ref<User[]>([]);
const accounts = ref<Account[]>([]);
const isLoading = ref(true);
const isSubmitting = ref(false);

const toUserId = ref('');
const fromPin = ref('');
const toPin = ref('');
const note = ref('');
const successMsg = ref('');
const errorMsg = ref('');

const currentUserName = computed(() => {
  if (!shift.value) return 'Petugas';
  const u = users.value.find((x) => x.id === shift.value!.userId);
  return u?.name || authStore.currentUser?.name || 'Petugas';
});

const availableRecipients = computed(() => {
  if (!shift.value) return [];
  return users.value.filter((u) => u.isActive && u.id !== shift.value!.userId);
});

const hasDiscrepancy = computed(() => {
  if (!shift.value?.selisih) return false;
  return Object.values(shift.value.selisih).some((d) => d !== 0);
});

function getAccountName(accId: string): string {
  const acc = accounts.value.find((a) => a.id === accId);
  return acc?.name || accId;
}

async function loadData() {
  isLoading.value = true;
  try {
    accounts.value = await db.accounts.toArray();
    users.value = await db.users.toArray();

    const shiftIdParam = route.query['shiftId'] as string;
    if (shiftIdParam) {
      shift.value = (await db.shifts.get(shiftIdParam)) || null;
    } else {
      // Ambil shift tertutup terakhir dari user ini
      const currentUserShifts = await shiftService.listShifts({
        userId: authStore.currentUser?.id,
      });
      shift.value = currentUserShifts.find((s) => s.status === 'closed') || null;
    }
  } finally {
    isLoading.value = false;
  }
}

async function handleSubmitHandover() {
  if (!shift.value) return;
  if (!toUserId.value) {
    errorMsg.value = 'Silakan pilih petugas penerima shift.';
    return;
  }
  if (fromPin.value.length < 4 || toPin.value.length < 4) {
    errorMsg.value = 'Kedua PIN minimal 4 angka.';
    return;
  }

  isSubmitting.value = true;
  errorMsg.value = '';
  successMsg.value = '';

  try {
    const result = await shiftService.handoverShift({
      shiftId: shift.value.id,
      toUserId: toUserId.value,
      fromPin: fromPin.value,
      toPin: toPin.value,
      note: note.value,
    });

    if (result.status === 'pending_owner') {
      successMsg.value = 'Serah terima terkirim! Karena terdapat selisih di atas toleransi, menunggu persetujuan Owner.';
    } else {
      successMsg.value = 'Serah terima berhasil diselesaikan! Shift baru untuk penerima telah otomatis dibuka.';
    }

    setTimeout(() => {
      router.push('/shifts');
    }, 2000);
  } catch (err: unknown) {
    errorMsg.value = (err as Error).message;
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(() => {
  loadData();
});
</script>

<style scoped>
.view-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
.btn-back {
  background: transparent;
  border: none;
  font-size: 14px;
  font-weight: 600;
  color: var(--primary);
  cursor: pointer;
  padding: 0;
}
.page-title {
  font-size: 18px;
  font-weight: 700;
  color: var(--text-main);
}

.feedback-banner {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
}
.feedback-banner.success {
  background: #ECFDF5;
  border: 1px solid #A7F3D0;
  color: #065F46;
}
.feedback-banner.error {
  background: #FEF2F2;
  border: 1px solid #FECACA;
  color: #991B1B;
}

.summary-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  margin-bottom: 16px;
}
.card-badge {
  font-size: 10px;
  font-weight: 700;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  padding: 2px 6px;
  border-radius: 4px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin: 6px 0 2px 0;
}
.card-subtitle {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
}

.physical-breakdown {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px;
  background: var(--bg-canvas);
  border-radius: 8px;
}
.breakdown-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.acc-name {
  color: var(--text-muted);
}
.acc-val {
  font-weight: 600;
  color: var(--text-main);
  font-variant-numeric: tabular-nums;
}

.discrepancy-warning {
  margin-top: 10px;
  padding: 10px;
  background: #FFFBEB;
  border: 1px solid #FDE68A;
  border-radius: 8px;
  font-size: 12px;
  color: #92400E;
}
.diff-text {
  display: block;
  margin-top: 4px;
}

.form-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-main);
}
.form-select,
.form-input {
  padding: 10px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 14px;
}
.dual-pin-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.action-footer {
  margin-top: 8px;
}
.btn-submit {
  width: 100%;
  padding: 14px;
  border-radius: var(--radius-btn);
  border: none;
  background: var(--primary);
  color: white;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: opacity 0.2s ease;
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.empty-box {
  padding: 24px;
  text-align: center;
  background: var(--bg-card);
  border-radius: var(--radius-card);
  border: 1px solid var(--border-color);
  color: var(--text-muted);
  font-size: 13px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
}
.btn-primary-sm {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
</style>
