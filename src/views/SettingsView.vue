<template>
  <AppScaffold>
    <div class="view-header">
      <h2 class="page-title">Pengaturan</h2>
    </div>

    <!-- Alert / Toast -->
    <div v-if="successMessage" class="feedback-banner success">
      {{ successMessage }}
    </div>
    <div v-if="errorMessage" class="feedback-banner error">
      {{ errorMessage }}
    </div>

    <div class="settings-list">
      <!-- Section Petugas & Keamanan -->
      <div class="settings-card">
        <h3 class="card-title">Petugas & Akses</h3>
        <div class="user-row">
          <div class="user-info">
            <span class="user-name">{{ authStore.currentUser?.name }}</span>
            <span class="user-role-badge">{{ authStore.currentUser?.role.toUpperCase() }}</span>
          </div>
          <button class="btn-logout" @click="handleLogout">Keluar</button>
        </div>

        <div class="pin-change-box">
          <button class="btn-secondary-sm" @click="showPinModal = !showPinModal">
            {{ showPinModal ? 'Tutup Ubah PIN' : 'Ubah PIN Petugas' }}
          </button>

          <div v-if="showPinModal" class="pin-form">
            <input
              v-model="oldPin"
              type="password"
              maxlength="6"
              inputmode="numeric"
              placeholder="PIN Lama (6 angka)"
              class="pin-input"
            />
            <input
              v-model="newPin"
              type="password"
              maxlength="6"
              inputmode="numeric"
              placeholder="PIN Baru (6 angka)"
              class="pin-input"
            />
            <button class="btn-primary-sm" :disabled="isSubmittingPin" @click="handleSavePin">
              Simpan PIN Baru
            </button>
          </div>
        </div>
      </div>

      <!-- Section Kelola Petugas (Owner Saja) -->
      <div v-if="authStore.isOwner" class="settings-card">
        <h3 class="card-title">Kelola Petugas</h3>
        <div class="menu-grid">
          <router-link to="/users" class="menu-item">
            <span class="item-title">Kelola Petugas</span>
            <span class="item-desc">Tambah, ubah &amp; nonaktifkan akun Admin/Kasir</span>
          </router-link>
        </div>
      </div>

      <!-- Section Master Data (Owner/Admin Saja) -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <h3 class="card-title">Master Data Konter</h3>
        <div class="menu-grid">
          <router-link to="/accounts" class="menu-item">
            <span class="item-title">Akun Saldo (5 Kelompok)</span>
            <span class="item-desc">Kas, Bank, E-Wallet, Server, Provider</span>
          </router-link>
          <router-link to="/masters" class="menu-item">
            <span class="item-title">Master Produk</span>
            <span class="item-desc">Modal & Jual: Pulsa, Voucher, Perdana, ACC</span>
          </router-link>
          <router-link to="/fee-rules" class="menu-item">
            <span class="item-title">Master Tarif Biaya Admin</span>
            <span class="item-desc">Aturan range nominal margin jasa</span>
          </router-link>
          <router-link to="/customers" class="menu-item">
            <span class="item-title">Master Pelanggan</span>
            <span class="item-desc">Data pelanggan & piutang</span>
          </router-link>
          <router-link to="/audit-logs" class="menu-item">
            <span class="item-title">Jejak Audit Aktivitas</span>
            <span class="item-desc">Log koreksi saldo, void, serah terima, opname</span>
          </router-link>
        </div>
      </div>

      <!-- Section Backup & Ekspor Data (Owner/Admin Saja) -->
      <div v-if="authStore.isAdmin" class="settings-card">
        <h3 class="card-title">Ekspor & Cadangan Data</h3>
        <p class="section-desc">Unduh berkas transaksi untuk pembukuan Excel atau amankan database lokal.</p>

        <div class="action-buttons-list">
          <button class="btn-action-outline" @click="exportTransactionsCsv">
            📥 Ekspor CSV Transaksi (Excel)
          </button>
          <button class="btn-action-outline" @click="exportProductsCsv">
            📥 Ekspor CSV Master Produk
          </button>
          <button class="btn-action-outline" @click="downloadJsonBackup">
            💾 Unduh Cadangan Penuh (JSON)
          </button>

          <div class="restore-wrapper">
            <label class="btn-action-danger" for="restore-file-input">
              🔄 Pulihkan Cadangan (Restore)
            </label>
            <input
              id="restore-file-input"
              type="file"
              accept=".json"
              class="hidden-file-input"
              @change="handleFileRestore"
            />
          </div>
        </div>
      </div>

      <!-- Section Tampilan Tema -->
      <div class="settings-card">
        <h3 class="card-title">Tema Tampilan</h3>
        <div class="theme-selector">
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'light' }"
            @click="settingsStore.updateTheme('light')"
          >
            Terang
          </button>
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'dark' }"
            @click="settingsStore.updateTheme('dark')"
          >
            Gelap
          </button>
          <button
            class="theme-btn"
            :class="{ active: settingsStore.theme === 'system' }"
            @click="settingsStore.updateTheme('system')"
          >
            Otomatis
          </button>
        </div>
      </div>

      <!-- Section Pembaruan Aplikasi (OTA) -->
      <div class="settings-card info-card">
        <h3 class="card-title">Pembaruan Aplikasi (OTA)</h3>
        <p class="app-statement">
          Aplikasi mendukung pembaruan Over-The-Air (OTA) APK langsung dari GitHub Releases tanpa perlu instalasi ulang.
        </p>
        <div class="version-row">
          <div class="app-version-badge">Versi {{ APP_VERSION }} (Fase 2 & 3)</div>
          <button
            type="button"
            class="btn-check-update"
            :disabled="isCheckingUpdate"
            @click="handleCheckUpdate"
          >
            <RefreshCw class="btn-icon" :class="{ spinning: isCheckingUpdate }" />
            <span>{{ isCheckingUpdate ? 'Memeriksa...' : 'Cek Pembaruan' }}</span>
          </button>
        </div>
      </div>

      <!-- Section Tentang Aplikasi -->
      <div class="settings-card info-card">
        <h3 class="card-title">Tentang BUKU KONTER</h3>
        <p class="app-statement">
          Aplikasi ini adalah <strong>murni pencatatan</strong> (buku kas & ledger catatan). Aplikasi ini tidak menjalankan transaksi pulsa/transfer langsung dan tidak mengubah saldo live di server pulsa, bank, atau e-wallet.
        </p>
        <div class="app-version-badge">Buku Konter © 2026 Bengkel Gadget</div>
      </div>
    </div>

    <!-- Dialog Pembaruan OTA -->
    <UpdateDialog
      v-if="availableUpdate"
      :update="availableUpdate"
      @dismiss="availableUpdate = null"
    />
  </AppScaffold>
</template>

<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { RefreshCw } from 'lucide-vue-next';
import AppScaffold from '../components/AppScaffold.vue';
import UpdateDialog from '../components/UpdateDialog.vue';
import { useAuthStore } from '../stores/authStore';
import { useSettingsStore } from '../stores/settingsStore';
import { backupService } from '../services/backupService';
import { authService } from '../services/authService';
import { updateService, type VersionInfo } from '../services/updateService';
import { APP_VERSION } from '../core/constants';

const router = useRouter();
const authStore = useAuthStore();
const settingsStore = useSettingsStore();

const isCheckingUpdate = ref(false);
const availableUpdate = ref<VersionInfo | null>(null);

async function handleCheckUpdate() {
  isCheckingUpdate.value = true;
  errorMessage.value = '';
  try {
    const update = await updateService.checkForUpdate();
    if (update) {
      availableUpdate.value = update;
    } else {
      showSuccess(`Aplikasi sudah versi terbaru (v${APP_VERSION}).`);
    }
  } catch {
    errorMessage.value = 'Gagal memeriksa pembaruan. Pastikan perangkat terhubung ke internet.';
  } finally {
    isCheckingUpdate.value = false;
  }
}

const showPinModal = ref(false);
const oldPin = ref('');
const newPin = ref('');
const isSubmittingPin = ref(false);
const successMessage = ref('');
const errorMessage = ref('');

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

async function handleLogout() {
  await authStore.logout();
  router.replace('/login');
}

async function handleSavePin() {
  if (!authStore.currentUser) return;
  if (oldPin.value.length < 4 || newPin.value.length < 4) {
    showError('PIN minimal harus 4-6 angka.');
    return;
  }
  isSubmittingPin.value = true;
  try {
    await authService.changePin(authStore.currentUser.id, oldPin.value, newPin.value);
    showSuccess('PIN berhasil diperbarui.');
    oldPin.value = '';
    newPin.value = '';
    showPinModal.value = false;
  } catch (err: unknown) {
    showError((err as Error).message);
  } finally {
    isSubmittingPin.value = false;
  }
}

function triggerDownload(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function exportTransactionsCsv() {
  try {
    const csv = await backupService.exportCsv();
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(csv, `transaksi_buku_konter_${dateStr}.csv`, 'text/csv;charset=utf-8;');
    showSuccess('CSV Transaksi berhasil diekspor.');
  } catch (err: unknown) {
    showError('Gagal ekspor CSV: ' + (err as Error).message);
  }
}

async function exportProductsCsv() {
  try {
    const csv = await backupService.exportMastersCsv();
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(csv, `master_produk_${dateStr}.csv`, 'text/csv;charset=utf-8;');
    showSuccess('CSV Master Produk berhasil diekspor.');
  } catch (err: unknown) {
    showError('Gagal ekspor produk: ' + (err as Error).message);
  }
}

async function downloadJsonBackup() {
  try {
    const json = await backupService.createBackup();
    const dateStr = new Date().toISOString().slice(0, 10);
    triggerDownload(json, `backup_buku_konter_${dateStr}.json`, 'application/json');
    showSuccess('Cadangan database berhasil diunduh.');
  } catch (err: unknown) {
    showError('Gagal buat cadangan: ' + (err as Error).message);
  }
}

async function handleFileRestore(e: Event) {
  const target = e.target as HTMLInputElement;
  const file = target.files?.[0];
  if (!file) return;

  const confirm1 = confirm('PERINGATAN: Memulihkan cadangan akan menimpa seluruh data transaksi, akun, dan produk saat ini. Lanjutkan?');
  if (!confirm1) {
    target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target?.result as string;
      await backupService.restoreBackup(content);
      showSuccess('Data berhasil dipulihkan!');
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: unknown) {
      showError('Gagal memulihkan cadangan: ' + (err as Error).message);
    } finally {
      target.value = '';
    }
  };
  reader.readAsText(file);
}
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

.feedback-banner {
  padding: 12px;
  border-radius: 8px;
  margin-bottom: 12px;
  font-size: 13px;
  font-weight: 500;
}
.feedback-banner.success {
  background: var(--color-income-subtle);
  border: 1px solid var(--color-income);
  color: var(--color-income);
}
.feedback-banner.error {
  background: var(--color-danger-subtle);
  border: 1px solid var(--color-danger);
  color: var(--color-danger);
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.settings-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  padding: 16px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
  margin-bottom: 8px;
}
.section-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-bottom: 12px;
  line-height: 1.4;
}

.user-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}
.user-info {
  display: flex;
  align-items: center;
  gap: 8px;
}
.user-name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-main);
}
.user-role-badge {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  border-radius: 6px;
}
.btn-logout {
  padding: 6px 12px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: transparent;
  color: var(--color-danger);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
}

.pin-change-box {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--border-color);
}
.btn-secondary-sm {
  padding: 6px 12px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 12px;
  cursor: pointer;
}
.pin-form {
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.pin-input {
  padding: 8px 12px;
  border: 1px solid var(--border-color);
  border-radius: 8px;
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 14px;
}
.btn-primary-sm {
  padding: 8px;
  border-radius: 8px;
  border: none;
  background: var(--primary);
  color: white;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
}

.menu-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
}
.menu-item {
  display: flex;
  flex-direction: column;
  padding: 12px;
  background: var(--bg-canvas);
  border-radius: 12px;
  text-decoration: none;
  transition: background 0.15s ease;
}
.menu-item:active {
  background: rgba(37, 99, 235, 0.08);
}
.item-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--text-main);
}
.item-desc {
  font-size: 12px;
  color: var(--text-muted);
  margin-top: 2px;
}

.action-buttons-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.btn-action-outline {
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--border-color);
  background: var(--bg-canvas);
  color: var(--text-main);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  transition: background 0.15s ease;
}
.btn-action-outline:hover {
  background: rgba(0, 0, 0, 0.03);
}
.restore-wrapper {
  margin-top: 4px;
}
.btn-action-danger {
  display: block;
  width: 100%;
  padding: 10px 14px;
  border: 1px solid var(--color-danger);
  background: var(--color-danger-subtle);
  color: var(--color-danger);
  border-radius: 10px;
  font-size: 13px;
  font-weight: 500;
  text-align: left;
  cursor: pointer;
  box-sizing: border-box;
}
.hidden-file-input {
  display: none;
}

.theme-selector {
  display: flex;
  gap: 8px;
}
.theme-btn {
  flex: 1;
  padding: 8px;
  border-radius: 8px;
  border: 1px solid var(--border-color);
  background: var(--bg-canvas);
  color: var(--text-main);
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
}
.theme-btn.active {
  border-color: var(--primary);
  background: rgba(37, 99, 235, 0.1);
  color: var(--primary);
  font-weight: 600;
}

.info-card {
  background: var(--bg-canvas);
  border: 1px dashed var(--border-color);
}
.app-statement {
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.5;
  margin-bottom: 12px;
}
.app-version-badge {
  display: inline-block;
  font-size: 11px;
  font-weight: 600;
  color: var(--text-muted);
  background: var(--bg-card);
  padding: 4px 8px;
  border-radius: 6px;
  border: 1px solid var(--border-color);
}

.version-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.btn-check-update {
  display: flex;
  align-items: center;
  gap: 6px;
  height: 36px;
  padding: 0 14px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--color-primary);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.2s;
}

.btn-check-update:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-icon {
  width: 14px;
  height: 14px;
}

.btn-icon.spinning {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}
</style>
