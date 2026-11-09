<template>
  <AppScaffold>
    <div class="users-container">
      <div class="view-header">
        <div class="header-left">
          <router-link to="/settings" class="btn-back">
            <ArrowLeft class="icon-sm" />
            <span>Kembali</span>
          </router-link>
          <h2 class="page-title">Kelola Petugas</h2>
        </div>
        <button class="btn-add" @click="openAddModal">
          <Plus class="icon-sm" />
          <span>Tambah Petugas</span>
        </button>
      </div>

      <p class="section-intro">
        Kelola akun Admin dan Kasir. Petugas nonaktif tidak dapat login dan tidak muncul di daftar pilihan login.
      </p>

      <!-- Feedback Banner -->
      <div v-if="successMessage" class="feedback-banner success">
        {{ successMessage }}
      </div>
      <div v-if="errorMessage" class="feedback-banner error">
        {{ errorMessage }}
      </div>

      <!-- Users List -->
      <div class="user-list">
        <div v-for="user in users" :key="user.id" class="user-card" :class="{ 'is-inactive': !user.isActive }">
          <div class="user-main">
            <div class="user-name-row">
              <span class="user-name">{{ user.name }}</span>
              <span class="role-badge" :class="'role-' + user.role">{{ roleLabel(user.role) }}</span>
              <span class="status-badge" :class="user.isActive ? 'status-active' : 'status-inactive'">
                {{ user.isActive ? 'Aktif' : 'Nonaktif' }}
              </span>
            </div>
            <div class="user-meta">
              <span>Dibuat: {{ formatDate(user.createdAt) }}</span>
            </div>
          </div>

          <div class="user-actions">
            <!-- Owner tidak bisa diubah, dinonaktifkan, atau di-reset dari sini -->
            <template v-if="user.role === 'owner'">
              <span class="owner-pill">Akun Utama</span>
            </template>
            <template v-else>
              <button class="btn-action edit-btn" @click="openEditModal(user)">
                Ubah
              </button>
              <button
                class="btn-action status-btn"
                :class="user.isActive ? 'btn-deactivate' : 'btn-activate'"
                @click="toggleStatus(user)"
              >
                {{ user.isActive ? 'Nonaktifkan' : 'Aktifkan' }}
              </button>
              <button class="btn-action reset-btn" @click="openResetPinModal(user)">
                Reset PIN
              </button>
            </template>
          </div>
        </div>
      </div>

      <!-- Modal Tambah Petugas -->
      <div v-if="showAddModal" class="modal-overlay" @click.self="showAddModal = false">
        <div class="modal-box">
          <h3 class="modal-title">Tambah Petugas Baru</h3>
          <form class="modal-form" @submit.prevent="submitAddUser">
            <div class="form-group">
              <label class="form-label">Nama Petugas</label>
              <input
                v-model="addForm.name"
                type="text"
                class="form-input"
                placeholder="Nama lengkap atau panggilan (min 2 karakter)"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Peran / Role</label>
              <select v-model="addForm.role" class="form-select" required>
                <option value="kasir">Kasir</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label">PIN (4-6 Angka)</label>
              <input
                v-model="addForm.pin"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="4-6 angka"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Konfirmasi PIN</label>
              <input
                v-model="addForm.confirmPin"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="Ulangi PIN"
                required
              />
            </div>

            <div class="modal-buttons">
              <button type="button" class="btn-cancel" @click="showAddModal = false">
                Batal
              </button>
              <button type="submit" class="btn-submit" :disabled="isSubmitting">
                {{ isSubmitting ? 'Menyimpan...' : 'Tambah Petugas' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal Edit Petugas -->
      <div v-if="showEditModal" class="modal-overlay" @click.self="showEditModal = false">
        <div class="modal-box">
          <h3 class="modal-title">Ubah Data Petugas</h3>
          <form class="modal-form" @submit.prevent="submitEditUser">
            <div class="form-group">
              <label class="form-label">Nama Petugas</label>
              <input
                v-model="editForm.name"
                type="text"
                class="form-input"
                placeholder="Nama petugas"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Peran / Role</label>
              <select v-model="editForm.role" class="form-select" required>
                <option value="kasir">Kasir</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div class="modal-buttons">
              <button type="button" class="btn-cancel" @click="showEditModal = false">
                Batal
              </button>
              <button type="submit" class="btn-submit" :disabled="isSubmitting">
                {{ isSubmitting ? 'Menyimpan...' : 'Simpan Perubahan' }}
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Modal Reset PIN Petugas -->
      <div v-if="showResetModal" class="modal-overlay" @click.self="showResetModal = false">
        <div class="modal-box">
          <h3 class="modal-title">Reset PIN Petugas</h3>
          <p class="modal-desc">
            Atur PIN baru untuk <strong>{{ targetUser?.name }}</strong> tanpa memerlukan PIN lama.
          </p>
          <form class="modal-form" @submit.prevent="submitResetPin">
            <div class="form-group">
              <label class="form-label">PIN Baru (4-6 Angka)</label>
              <input
                v-model="resetForm.pin"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="4-6 angka baru"
                required
              />
            </div>

            <div class="form-group">
              <label class="form-label">Konfirmasi PIN Baru</label>
              <input
                v-model="resetForm.confirmPin"
                type="password"
                maxlength="6"
                inputmode="numeric"
                class="form-input"
                placeholder="Ulangi PIN baru"
                required
              />
            </div>

            <div class="modal-buttons">
              <button type="button" class="btn-cancel" @click="showResetModal = false">
                Batal
              </button>
              <button type="submit" class="btn-submit" :disabled="isSubmitting">
                {{ isSubmitting ? 'Menyimpan...' : 'Simpan PIN Baru' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ArrowLeft, Plus } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import { useAuthStore } from '../stores/authStore';
import { authService } from '../services/authService';
import type { User, UserRole } from '../db/types';

const router = useRouter();
const authStore = useAuthStore();

const users = ref<User[]>([]);
const isSubmitting = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

// Modals
const showAddModal = ref(false);
const showEditModal = ref(false);
const showResetModal = ref(false);
const targetUser = ref<User | null>(null);

const addForm = ref({
  name: '',
  role: 'kasir' as 'admin' | 'kasir',
  pin: '',
  confirmPin: '',
});

const editForm = ref({
  name: '',
  role: 'kasir' as 'admin' | 'kasir',
});

const resetForm = ref({
  pin: '',
  confirmPin: '',
});

function showSuccess(msg: string) {
  successMessage.value = msg;
  errorMessage.value = '';
  setTimeout(() => {
    successMessage.value = '';
  }, 4000);
}

function showError(msg: string) {
  errorMessage.value = msg;
  successMessage.value = '';
}

function roleLabel(role: UserRole): string {
  if (role === 'owner') return 'Owner';
  if (role === 'admin') return 'Admin';
  if (role === 'kasir') return 'Kasir';
  return role;
}

function formatDate(ts: number): string {
  if (!ts) return '-';
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

async function loadUsers() {
  users.value = await authService.getAllUsers();
}

function openAddModal() {
  addForm.value = {
    name: '',
    role: 'kasir',
    pin: '',
    confirmPin: '',
  };
  showAddModal.value = true;
}

async function submitAddUser() {
  if (addForm.value.name.trim().length < 2) {
    showError('Nama petugas minimal 2 karakter.');
    return;
  }
  if (addForm.value.pin.length < 4 || addForm.value.pin.length > 6 || !/^\d+$/.test(addForm.value.pin)) {
    showError('PIN harus berupa 4-6 angka.');
    return;
  }
  if (addForm.value.pin !== addForm.value.confirmPin) {
    showError('PIN dan Konfirmasi PIN tidak cocok.');
    return;
  }

  isSubmitting.value = true;
  try {
    await authService.createUser(
      addForm.value.name,
      addForm.value.role,
      addForm.value.pin
    );
    showSuccess(`Petugas ${addForm.value.name} berhasil ditambahkan.`);
    showAddModal.value = false;
    await loadUsers();
  } catch (err: unknown) {
    showError((err as Error).message);
  } finally {
    isSubmitting.value = false;
  }
}

function openEditModal(user: User) {
  targetUser.value = user;
  editForm.value = {
    name: user.name,
    role: (user.role === 'admin' ? 'admin' : 'kasir'),
  };
  showEditModal.value = true;
}

async function submitEditUser() {
  if (!targetUser.value) return;
  if (editForm.value.name.trim().length < 2) {
    showError('Nama petugas minimal 2 karakter.');
    return;
  }

  isSubmitting.value = true;
  try {
    await authService.updateUser(targetUser.value.id, {
      name: editForm.value.name,
      role: editForm.value.role,
    });
    showSuccess(`Data petugas ${editForm.value.name} berhasil diperbarui.`);
    showEditModal.value = false;
    await loadUsers();
  } catch (err: unknown) {
    showError((err as Error).message);
  } finally {
    isSubmitting.value = false;
  }
}

async function toggleStatus(user: User) {
  const nextStatus = !user.isActive;
  const actionText = nextStatus ? 'mengaktifkan' : 'menonaktifkan';
  if (!confirm(`Apakah Anda yakin ingin ${actionText} akun ${user.name}?`)) {
    return;
  }

  try {
    await authService.setUserActive(user.id, nextStatus);
    showSuccess(`Akun ${user.name} berhasil ${nextStatus ? 'diaktifkan' : 'dinonaktifkan'}.`);
    await loadUsers();
  } catch (err: unknown) {
    showError((err as Error).message);
  }
}

function openResetPinModal(user: User) {
  targetUser.value = user;
  resetForm.value = {
    pin: '',
    confirmPin: '',
  };
  showResetModal.value = true;
}

async function submitResetPin() {
  if (!targetUser.value) return;
  if (resetForm.value.pin.length < 4 || resetForm.value.pin.length > 6 || !/^\d+$/.test(resetForm.value.pin)) {
    showError('PIN baru harus berupa 4-6 angka.');
    return;
  }
  if (resetForm.value.pin !== resetForm.value.confirmPin) {
    showError('PIN baru dan konfirmasi tidak cocok.');
    return;
  }

  isSubmitting.value = true;
  try {
    await authService.resetPinByOwner(targetUser.value.id, resetForm.value.pin);
    showSuccess(`PIN untuk ${targetUser.value.name} berhasil direset.`);
    showResetModal.value = false;
  } catch (err: unknown) {
    showError((err as Error).message);
  } finally {
    isSubmitting.value = false;
  }
}

onMounted(async () => {
  if (!authStore.isOwner) {
    router.replace('/');
    return;
  }
  await loadUsers();
});
</script>

<style scoped>
.users-container {
  padding: 16px;
  max-width: 600px;
  margin: 0 auto;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
  gap: 12px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.btn-back {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 6px 10px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  text-decoration: none;
  font-size: 13px;
  font-weight: 500;
}

.page-title {
  font-size: 20px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0;
}

.btn-add {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-radius: 10px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.icon-sm {
  width: 16px;
  height: 16px;
}

.section-intro {
  font-size: 13px;
  color: var(--text-secondary);
  line-height: 1.4;
  margin-bottom: 16px;
}

.feedback-banner {
  padding: 10px 14px;
  border-radius: 8px;
  font-size: 13px;
  font-weight: 500;
  margin-bottom: 12px;
}
.feedback-banner.success {
  background: var(--color-income-subtle);
  color: var(--color-income);
  border: 1px solid var(--color-income);
}
.feedback-banner.error {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  border: 1px solid var(--color-danger);
}

.user-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.user-card {
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.user-card.is-inactive {
  opacity: 0.65;
  background: var(--surface-card-subtle);
}

.user-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.user-name-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.user-name {
  font-size: 15px;
  font-weight: 700;
  color: var(--text-main);
}

.role-badge {
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 6px;
  text-transform: uppercase;
}
.role-owner {
  background: rgba(37, 99, 235, 0.12);
  color: #2563eb;
}
.role-admin {
  background: rgba(16, 185, 129, 0.12);
  color: #059669;
}
.role-kasir {
  background: rgba(245, 158, 11, 0.12);
  color: #d97706;
}

.status-badge {
  font-size: 11px;
  font-weight: 600;
  padding: 2px 8px;
  border-radius: 6px;
}
.status-active {
  background: var(--color-income-subtle);
  color: var(--color-income);
}
.status-inactive {
  background: var(--color-danger-subtle);
  color: var(--color-danger);
}

.user-meta {
  font-size: 12px;
  color: var(--text-muted);
}

.user-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
  flex-wrap: wrap;
}

.owner-pill {
  font-size: 12px;
  color: var(--text-muted);
  font-style: italic;
}

.btn-action {
  padding: 6px 12px;
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
}

.edit-btn:hover {
  background: var(--surface-card-subtle);
}

.btn-deactivate {
  color: var(--color-danger);
  border-color: rgba(225, 29, 72, 0.3);
}

.btn-activate {
  color: var(--color-income);
  border-color: rgba(22, 163, 74, 0.3);
}

.reset-btn {
  color: #2563eb;
  border-color: rgba(37, 99, 235, 0.3);
}

/* Modals */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 16px;
  z-index: 1000;
}

.modal-box {
  background: var(--surface-card);
  border-radius: 16px;
  padding: 20px;
  width: 100%;
  max-width: 420px;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.modal-title {
  font-size: 17px;
  font-weight: 700;
  color: var(--text-main);
  margin: 0 0 8px 0;
}

.modal-desc {
  font-size: 13px;
  color: var(--text-secondary);
  margin-bottom: 16px;
  line-height: 1.4;
}

.modal-form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.form-label {
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
}

.form-input,
.form-select {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-app);
  color: var(--text-main);
  font-size: 14px;
  outline: none;
}
.form-input:focus,
.form-select:focus {
  border-color: var(--color-primary);
}

.modal-buttons {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  margin-top: 12px;
}

.btn-cancel {
  padding: 8px 14px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.btn-submit {
  padding: 8px 16px;
  border-radius: 8px;
  border: none;
  background: var(--color-primary);
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}
.btn-submit:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>
