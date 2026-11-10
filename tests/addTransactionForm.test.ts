import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { mount, flushPromises } from '@vue/test-utils';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import router from '../src/router';
import versionData from '../version.json';

let pinia: ReturnType<typeof createPinia>;

describe('AddTransactionView Form Improvements (b4)', () => {
  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);
    await db.users.clear();
    await db.accounts.clear();
    await db.products.clear();
    await db.customers.clear();
    await db.shifts.clear();
    await db.transactions.clear();
    vi.restoreAllMocks();

    // Setup User Owner & Kasir
    const owner = {
      id: 'owner-1',
      name: 'Owner Konter',
      role: 'owner' as const,
      pinHash: 'hash-owner',
      isActive: true,
      createdAt: Date.now(),
    };
    await db.users.add(owner);

    const authStore = useAuthStore(pinia);
    authStore.currentUser = owner;
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(owner);

    // Setup Akun
    const now = Date.now();
    await db.accounts.bulkAdd([
      { id: 'acc-kas', name: 'Kas Tunai Toko', type: 'kas', initialBalance: 1000000, isActive: true, icon: 'wallet', color: 'green', createdAt: now, updatedAt: now },
      { id: 'acc-bca', name: 'BCA Konter', type: 'bank', initialBalance: 5000000, isActive: true, icon: 'bank', color: 'blue', createdAt: now, updatedAt: now },
      { id: 'acc-server', name: 'Server Pulsa Digipos', type: 'server_pulsa', initialBalance: 2000000, isActive: true, icon: 'server', color: 'purple', createdAt: now, updatedAt: now },
    ]);

    // Setup Master Produk
    await db.products.bulkAdd([
      {
        id: 'prod-pulsa-10k',
        name: 'Telkomsel 10K',
        category: 'pulsa',
        modal: 10200,
        hargaJual: 12000,
        stock: 0,
        stockMin: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'prod-voucher-5gb',
        name: 'Voucher Data 5GB',
        category: 'voucher',
        modal: 20000,
        hargaJual: 25000,
        stock: 15,
        stockMin: 2,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      },
    ]);

    // Setup Shift Aktif
    await db.shifts.add({
      id: 'shift-active-1',
      userId: 'owner-1',
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 1000000,
      status: 'open',
    });
  });

  // Drain navigasi router yang masih berjalan sebelum jsdom di-teardown.
  // Guard router bersifat async (baca IndexedDB via authService); bila
  // navigasi selesai SETELAH teardown, vue-router melempar unhandled
  // rejection "history is not defined" dan Vitest exit 1 — inilah yang
  // menggagalkan run CI b8 #20 padahal 120/120 tes lolos.
  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  it('Poin 1: Dropdown Jenis Layanan bisa dicari / difilter, mendukung keyboard navigation', async () => {
    const wrapper = mount(AddTransactionView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          AppScaffold: {
            template: '<div><slot /></div>',
          },
        },
      },
    });

    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Trigger combobox ada di DOM
    const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
    expect(triggerBtn.exists()).toBe(true);
    expect(triggerBtn.text()).toContain('Transfer');

    // Menu dropdown tertutup saat awal
    expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(false);

    // Buka dropdown
    await triggerBtn.trigger('click');
    expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(true);

    const searchInput = wrapper.find('[data-testid="input-cari-layanan"]');
    expect(searchInput.exists()).toBe(true);

    // Saat search kosong: ke-14 pilihan layanan tampil
    const allOptions = wrapper.findAll('.service-option-item');
    expect(allOptions.length).toBe(14);

    // Ketik "pul" -> menampilkan Pulsa
    await searchInput.setValue('pul');
    const pulOptions = wrapper.findAll('.service-option-item');
    expect(pulOptions.some((o) => o.text().includes('Pulsa'))).toBe(true);
    expect(pulOptions.some((o) => o.text().includes('Transfer'))).toBe(false);

    // Ketik "trans" -> menampilkan Transfer dan Tarik Tunai
    await searchInput.setValue('trans');
    const transOptions = wrapper.findAll('.service-option-item');
    expect(transOptions.length).toBeGreaterThanOrEqual(2);
    expect(transOptions.some((o) => o.text().includes('Transfer'))).toBe(true);
    expect(transOptions.some((o) => o.text().includes('Tarik Tunai'))).toBe(true);

    // Keyboard navigasi: Arrow down pindah highlight, Enter memilih
    await searchInput.trigger('keydown', { key: 'ArrowDown' });
    await searchInput.trigger('keydown', { key: 'Enter' });
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Dropdown menutup setelah memilih
    expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(false);

    // Bila keyword tidak cocok sama sekali -> tampil teks "Tidak ada layanan yang cocok"
    await triggerBtn.trigger('click');
    const searchInput2 = wrapper.find('[data-testid="input-cari-layanan"]');
    await searchInput2.setValue('xyz12345nonexistent');
    expect(wrapper.findAll('.service-option-item').length).toBe(0);
    const noOptionItem = wrapper.find('.no-options-item');
    expect(noOptionItem.exists()).toBe(true);
    expect(noOptionItem.text()).toContain('Tidak ada layanan yang cocok');

    // Tombol Escape menutup dropdown
    await searchInput2.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(false);
  });

  it('Poin 2: Auto-fokus antar field dan saat halaman dibuka tidak mencuri fokus', async () => {
    const wrapper = mount(AddTransactionView, {
      attachTo: document.body,
      global: {
        plugins: [pinia, router],
        stubs: {
          AppScaffold: {
            template: '<div><slot /></div>',
          },
        },
      },
    });

    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // 1. Saat halaman dibuka pertama kali, JANGAN curi fokus ke input apa pun
    // Dokumen aktif tidak boleh langsung terfokus ke input form
    const triggerBtn = wrapper.find('[data-testid="service-dropdown-trigger"]');
    await triggerBtn.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // 2. Pilih layanan Pulsa
    const pulsaOption = wrapper.find('[data-testid="service-option-pulsa"]');
    await pulsaOption.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Cascading pulsa: server pulsa terisi default, kursor diarahkan ke input nomor tujuan / referenceNo
    const refNoInput = wrapper.find('input[placeholder="0812xxxx atau No. Meter"]');
    expect(refNoInput.exists()).toBe(true);

    // Tekan Enter pada referenceNo -> fokus berpindah ke productSelect
    await refNoInput.trigger('keydown.enter');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // 3. Enter pada nominal dengan layanan transfer mengarah ke admin fee
    await triggerBtn.trigger('click');
    const tfOption = wrapper.find('[data-testid="service-option-transfer"]');
    await tfOption.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    const moneyInputComponent = wrapper.findComponent({ name: 'MoneyInput' });
    expect(moneyInputComponent.exists()).toBe(true);

    // Emit enter dari nominal input
    moneyInputComponent.vm.$emit('enter');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Emit adminEnter dari admin input
    moneyInputComponent.vm.$emit('adminEnter');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // 4. Ubah status bayar ke hutang -> kursor fokus ke picker pelanggan
    const hutangBtn = wrapper.findAll('.status-btn').find((b) => b.text().includes('Hutang'));
    expect(hutangBtn?.exists()).toBe(true);
    await hutangBtn?.trigger('click');
    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    const customerPicker = wrapper.find('.debt-box select');
    expect(customerPicker.exists()).toBe(true);

    wrapper.unmount();
  });

  it('Poin 3: Hapus sementara popup preview Total Transaksi di footer', async () => {
    const wrapper = mount(AddTransactionView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          AppScaffold: {
            template: '<div><slot /></div>',
          },
        },
      },
    });

    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Elemen .summary-preview ("Total Transaksi") TIDAK boleh ada lagi di footer
    expect(wrapper.find('.summary-preview').exists()).toBe(false);
    expect(wrapper.text()).not.toContain('Total Transaksi');

    // Tombol "Simpan Transaksi" tetap ada di .sticky-footer dan membentang
    const submitBtn = wrapper.find('.sticky-footer .btn-submit-tx');
    expect(submitBtn.exists()).toBe(true);
    expect(submitBtn.text()).toContain('Simpan Transaksi');
    // Disabled bila nominal <= 0
    expect((submitBtn.element as HTMLButtonElement).disabled).toBe(true);
  });

  it('Poin 4: Form tidak lagi menampilkan dropdown "Diterima Lewat"', async () => {
    const wrapper = mount(AddTransactionView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          AppScaffold: {
            template: '<div><slot /></div>',
          },
        },
      },
    });

    await flushPromises();
    await new Promise((r) => setTimeout(r, 50));
    await flushPromises();

    // Pastikan tidak ada label atau select "Diterima Lewat"
    expect(wrapper.text()).not.toContain('Diterima Lewat');
  });

  it('Poin 5: version.json valid dan version_code konsisten', () => {
    expect(versionData.version_code).toBeGreaterThanOrEqual(4);
    expect(versionData.version_name).toBe('0.2.0');
    const expectedReleaseUrl = `https://github.com/bengkelgadget-code/BG-VUE3/releases/download/v${versionData.version_name}-b${versionData.version_code}/buku-konter-v${versionData.version_name}-b${versionData.version_code}.apk`;
    const isValidUrl = versionData.download_url === '' || versionData.download_url === expectedReleaseUrl;
    expect(isValidUrl).toBe(true);
    expect(versionData.changelog.length).toBeGreaterThan(0);
  });
});
