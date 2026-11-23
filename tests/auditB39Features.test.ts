import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mount, flushPromises } from '@vue/test-utils';
import { createPinia, setActivePinia } from 'pinia';
import fs from 'fs';
import path from 'path';
import router from '../src/router';
import { db } from '../src/db/database';
import { APP_VERSION, APP_BUILD } from '../src/core/constants';
import { authService } from '../src/services/authService';
import { useAuthStore } from '../src/stores/authStore';
import AddTransactionView from '../src/views/AddTransactionView.vue';
import SearchableSelect from '../src/components/SearchableSelect.vue';
import type { User, Account } from '../src/db/types';

describe('Audit b39 Features: Enter/Tab Auto-Pilih Dropdown Search (Semua Role)', () => {
  let pinia: ReturnType<typeof createPinia>;
  let kasirUser: User;
  let kepalaKasirUser: User;
  let accKasKecil: Account;
  let accBankBri: Account;

  beforeEach(async () => {
    pinia = createPinia();
    setActivePinia(pinia);

    await db.delete();
    await db.open();

    const now = Date.now();
    kasirUser = {
      id: 'user-kasir',
      name: 'Fitra Kasir',
      role: 'kasir',
      pinHash: 'dummy-hash',
      isActive: true,
      createdAt: now,
    };
    kepalaKasirUser = {
      id: 'user-kepala-kasir',
      name: 'Rian Kepala Kasir',
      role: 'kepala_kasir',
      pinHash: 'dummy-hash',
      isActive: true,
      createdAt: now,
    };
    await db.users.bulkAdd([kasirUser, kepalaKasirUser]);

    accKasKecil = {
      id: 'acc-kas-kecil',
      name: 'Kas Kecil',
      type: 'kas',
      initialBalance: 1000000,
      isActive: true,
      icon: 'cash',
      color: 'emerald',
      createdAt: now,
      updatedAt: now,
    };
    accBankBri = {
      id: 'acc-bank-bri',
      name: 'Bank BRI',
      type: 'bank',
      initialBalance: 2000000,
      isActive: true,
      icon: 'bank',
      color: 'blue',
      createdAt: now,
      updatedAt: now,
    };
    await db.accounts.bulkAdd([accKasKecil, accBankBri]);

    await db.shifts.bulkAdd([
      {
        id: 'shift-1',
        userId: kasirUser.id,
        openedAt: now,
        saldoAwalSistem: {},
        kasAwalFisik: 1000000,
        status: 'open',
      },
      {
        id: 'shift-kepala-kasir',
        userId: kepalaKasirUser.id,
        openedAt: now,
        saldoAwalSistem: {},
        kasAwalFisik: 1000000,
        status: 'open',
      },
    ]);

    const authStore = useAuthStore(pinia);
    authStore.currentUser = kasirUser;
    localStorage.setItem('buku_konter_active_user_id', kasirUser.id);
    vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(kasirUser);
    vi.spyOn(authService, 'hasAnyUser').mockResolvedValue(true);
  });

  afterEach(async () => {
    await flushPromises();
    await new Promise((resolve) => setTimeout(resolve, 50));
    await flushPromises();
  });

  // ==========================================================================
  // TUGAS 4 — Sinkronisasi Versi & Build Number b39
  // ==========================================================================
  describe('Tugas 4: Verifikasi Versi Aplikasi & Build Number b39', () => {
    it('version.json dan constants.ts sinkron: APP_VERSION === "0.2.0-b39", APP_BUILD === 39', () => {
      const versionJsonPath = path.resolve(process.cwd(), 'version.json');
      const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

      expect(APP_VERSION).toBe('0.2.0-b39');
      expect(APP_BUILD).toBe(39);
      expect(versionJson.version_name).toBe('0.2.0-b39');
      expect(versionJson.version_code).toBe(39);
      expect(versionJson.min_apk_version_code).toBe(18);
      expect(APP_VERSION).toBe(versionJson.version_name);
      expect(APP_BUILD).toBe(versionJson.version_code);
    });
  });

  // ==========================================================================
  // TUGAS 3.1 — Tes Form Nyata DUA Dropdown Berturut-turut (AddTransactionView)
  // ==========================================================================
  describe('Tugas 3.1: Form Nyata DUA Dropdown Berturut-turut (Kasir & Kepala Kasir)', () => {
    it('Role Kasir: ketik "tra" -> Enter -> Transfer terpilih & loncat ke Sumber Dana; ketik "bri" -> Enter -> Bank BRI terpilih & loncat ke No Rekening', async () => {
      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
        attachTo: document.body,
      });

      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // --- DROPDOWN 1: Jenis Layanan ---
      const triggerLayanan = wrapper.find('[data-testid="service-dropdown-trigger"]');
      expect(triggerLayanan.exists()).toBe(true);
      await triggerLayanan.trigger('click');
      await flushPromises();

      const searchLayanan = wrapper.find('[data-testid="input-cari-layanan"]');
      expect(searchLayanan.exists()).toBe(true);
      await searchLayanan.setValue('tra');
      await flushPromises();

      // Enter pada picker layanan
      await searchLayanan.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      // Assert Layanan Transfer terpilih & dropdown tertutup
      expect((wrapper.vm as unknown as { layanan: string }).layanan).toBe('transfer');
      expect(wrapper.find('[data-testid="service-dropdown-menu"]').exists()).toBe(false);

      // Assert fokus loncat ke trigger Sumber Dana
      const sourceAccountTrigger = wrapper.find('[data-testid="select-source-account-trigger"]');
      expect(sourceAccountTrigger.exists()).toBe(true);
      expect(document.activeElement).toBe(sourceAccountTrigger.element);

      // --- DROPDOWN 2: Sumber Dana Konter ---
      await sourceAccountTrigger.trigger('click');
      await flushPromises();

      const searchSource = wrapper.find('[data-testid="select-source-account-search"]');
      expect(searchSource.exists()).toBe(true);
      await searchSource.setValue('bri');
      await flushPromises();

      // Enter pada search input Sumber Dana
      await searchSource.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      // Assert Bank BRI terpilih & dropdown tertutup
      expect((wrapper.vm as unknown as { sourceAccountId: string }).sourceAccountId).toBe('acc-bank-bri');
      expect(wrapper.find('[data-testid="select-source-account-menu"]').exists()).toBe(false);

      // Assert fokus loncat ke field berikutnya: No Rekening Tujuan
      const refInput = wrapper.find('input[placeholder*="BCA 123456789"]');
      expect(refInput.exists()).toBe(true);
      expect(document.activeElement).toBe(refInput.element);

      wrapper.unmount();
    });

    it('Role Kepala Kasir: alur DUA dropdown yang sama berjalan lancar dengan role kepala_kasir', async () => {
      const authStore = useAuthStore(pinia);
      authStore.currentUser = kepalaKasirUser;
      localStorage.setItem('buku_konter_active_user_id', kepalaKasirUser.id);
      vi.spyOn(authService, 'getCurrentUser').mockResolvedValue(kepalaKasirUser);

      await router.push('/transactions/add');
      await router.isReady();

      const wrapper = mount(AddTransactionView, {
        global: {
          plugins: [pinia, router],
          stubs: { AppScaffold: { template: '<div><slot /></div>' } },
        },
        attachTo: document.body,
      });

      await flushPromises();
      await new Promise((r) => setTimeout(r, 100));
      await flushPromises();

      // Dropdown 1: Jenis Layanan
      const triggerLayanan = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await triggerLayanan.trigger('click');
      await flushPromises();

      const searchLayanan = wrapper.find('[data-testid="input-cari-layanan"]');
      await searchLayanan.setValue('tra');
      await flushPromises();

      await searchLayanan.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      expect((wrapper.vm as unknown as { layanan: string }).layanan).toBe('transfer');

      // Dropdown 2: Sumber Dana
      const sourceAccountTrigger = wrapper.find('[data-testid="select-source-account-trigger"]');
      await sourceAccountTrigger.trigger('click');
      await flushPromises();

      const searchSource = wrapper.find('[data-testid="select-source-account-search"]');
      await searchSource.setValue('bri');
      await flushPromises();

      await searchSource.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      expect((wrapper.vm as unknown as { sourceAccountId: string }).sourceAccountId).toBe('acc-bank-bri');
      const refInput = wrapper.find('input[placeholder*="BCA 123456789"]');
      expect(document.activeElement).toBe(refInput.element);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // TUGAS 3.2 — Tes Event `search` & Penelanan Komposisi
  // ==========================================================================
  describe('Tugas 3.2: Penelanan Komposisi & Event Search', () => {
    it('Dispatch event search pada search input -> opsi ter-filter terpilih tepat satu kali dan fokus maju', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer' },
        { value: 'pulsa', label: 'Pulsa' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="search-event-form">
          <div id="mount-point"></div>
          <input id="field-next" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const wrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options,
          placeholder: 'Pilih layanan',
        },
        attachTo: div.querySelector('#mount-point')!,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('tra');
      await flushPromises();

      // Dispatch event search (simulasi tombol Search / Cari di virtual keyboard Android)
      await searchInput.trigger('search');
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['transfer']);
      expect(wrapper.find('.searchable-select-panel').exists()).toBe(false);

      const nextField = div.querySelector('#field-next') as HTMLElement;
      expect(document.activeElement).toBe(nextField);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('Simulasi komposisi Android: keydown 229 diikuti compositionend -> opsi terpilih dan dropdown tertutup', async () => {
      const options = [
        { value: 'bri', label: 'Bank BRI' },
        { value: 'bca', label: 'Bank BCA' },
      ];

      const wrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options,
        },
        attachTo: document.body,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('bri');
      await flushPromises();

      // Keydown 229 (Android IME composing)
      await searchInput.trigger('keydown', { keyCode: 229 });
      // Diikuti compositionend
      await searchInput.trigger('compositionend');
      await flushPromises();

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['bri']);
      expect(wrapper.find('.searchable-select-panel').exists()).toBe(false);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // TUGAS 3.3 — Tes focusout Auto-Pilih (Solusi Gejala 19:47)
  // ==========================================================================
  describe('Tugas 3.3: Focusout Auto-Pilih Saat Fokus Pindah ke Field Berikutnya', () => {
    it('Focusout dengan relatedTarget = input berikutnya di dalam form -> opsi ter-filter terpilih dan dropdown tertutup', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer' },
        { value: 'tarik_tunai', label: 'Tarik Tunai' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="focusout-form">
          <div id="mount-select"></div>
          <input id="next-form-field" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const wrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options,
        },
        attachTo: div.querySelector('#mount-select')!,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('tra');
      await flushPromises();

      const nextField = div.querySelector('#next-form-field') as HTMLElement;
      nextField.focus();

      // Dispatch focusout pada wrapper dengan relatedTarget = nextField (fokus berpindah ke field berikutnya)
      await wrapper.trigger('focusout', { relatedTarget: nextField });
      await flushPromises();

      // Assert Transfer terpilih, panel tertutup, dan fokus tetap di nextField
      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['transfer']);
      expect(wrapper.find('.searchable-select-panel').exists()).toBe(false);
      expect(document.activeElement).toBe(nextField);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('Focusout dengan relatedTarget null (tap baris opsi / tap luar) -> TIDAK auto-pilih lewat blur', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer' },
        { value: 'pulsa', label: 'Pulsa' },
      ];

      const wrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options,
        },
        attachTo: document.body,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('tra');
      await flushPromises();

      // Dispatch focusout dengan relatedTarget null
      await wrapper.trigger('focusout', { relatedTarget: null });
      await flushPromises();

      // Assert TIDAK ada emit update:modelValue dari focusout
      expect(wrapper.emitted('update:modelValue')).toBeUndefined();

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // TUGAS 3.4 — Tes Anti-Ganda (Single Guard 300ms)
  // ==========================================================================
  describe('Tugas 3.4: Anti-Ganda Terpadu (Single Guard 300ms)', () => {
    it('Tembakkan keydown Enter + keyup Enter + beforeinput + search + focusout berurutan -> update:modelValue HANYA ter-emit TEPAT 1 kali', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer' },
        { value: 'pulsa', label: 'Pulsa' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="multi-trigger-form">
          <div id="mount-multi"></div>
          <input id="multi-next" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const wrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options,
        },
        attachTo: div.querySelector('#mount-multi')!,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');
      await searchInput.setValue('tra');
      await flushPromises();

      const nextField = div.querySelector('#multi-next') as HTMLElement;

      // 1. keydown Enter
      await searchInput.trigger('keydown', { key: 'Enter', keyCode: 13 });
      // 2. keyup Enter
      await searchInput.trigger('keyup', { key: 'Enter', keyCode: 13 });
      // 3. beforeinput insertLineBreak
      await searchInput.trigger('beforeinput', { inputType: 'insertLineBreak' } as unknown as Event);
      // 4. search event
      await searchInput.trigger('search');
      // 5. focusout event
      await wrapper.trigger('focusout', { relatedTarget: nextField });
      await flushPromises();

      // Assert: emit update:modelValue HANYA 1 kali
      const emitted = wrapper.emitted('update:modelValue');
      expect(emitted).toBeDefined();
      expect(emitted?.length).toBe(1);
      expect(emitted?.[0]).toEqual(['transfer']);

      wrapper.unmount();
      document.body.removeChild(div);
    });
  });
});
