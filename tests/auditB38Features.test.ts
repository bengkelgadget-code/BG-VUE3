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

describe('Audit b38 Features: Virtual Keyboard Enter, Focus Advance, & App Build Number', () => {
  let pinia: ReturnType<typeof createPinia>;
  let kasirUser: User;
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
    await db.users.add(kasirUser);

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

    await db.shifts.add({
      id: 'shift-1',
      userId: kasirUser.id,
      openedAt: now,
      saldoAwalSistem: {},
      kasAwalFisik: 1000000,
      status: 'open',
    });

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
  // TUGAS 4.5 — Sinkronisasi Versi & Build Number
  // ==========================================================================
  describe('Tugas 4.5: Verifikasi Versi Aplikasi & Build Number Terlihat', () => {
    it('version.json dan constants.ts sinkron: APP_VERSION === version_name, APP_BUILD === version_code, dan berakhiran -b{APP_BUILD}', () => {
      const versionJsonPath = path.resolve(process.cwd(), 'version.json');
      const versionJson = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));

      expect(APP_VERSION).toBe(versionJson.version_name);
      expect(APP_BUILD).toBe(versionJson.version_code);
      expect(APP_VERSION).toMatch(new RegExp(`-b${APP_BUILD}$`));
      expect(APP_BUILD).toBe(38);
    });
  });

  // ==========================================================================
  // TUGAS 3.1 — Tes Form Nyata (AddTransactionView Asli)
  // ==========================================================================
  describe('Tugas 3.1: Tes Form Nyata AddTransactionView Picker Layanan', () => {
    it('Ketik "tra" di picker layanan -> Enter -> layanan terisi "transfer" dan fokus loncat ke trigger Sumber Dana', async () => {
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

      // Buka dropdown picker layanan
      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      expect(trigger.exists()).toBe(true);
      await trigger.trigger('click');
      await flushPromises();

      // Cari input search picker layanan
      const searchInput = wrapper.find('[data-testid="input-cari-layanan"]');
      expect(searchInput.exists()).toBe(true);

      // Ketik "tra"
      await searchInput.setValue('tra');
      await flushPromises();

      // Tekan Enter di search input
      await searchInput.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      // Berikan waktu double nextTick / layout render
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      // Assert nilai layanan terisi 'transfer'
      expect((wrapper.vm as unknown as { layanan: string }).layanan).toBe('transfer');

      // Assert document.activeElement adalah trigger Sumber Dana (field pertama setelah picker)
      const sourceAccountTrigger = wrapper.find('[data-testid="select-source-account-trigger"]').element;
      expect(document.activeElement).toBe(sourceAccountTrigger);

      wrapper.unmount();
    });
  });

  // ==========================================================================
  // TUGAS 3.2 — Tes Quirk Android (Unidentified keyCode 13 + keyup)
  // ==========================================================================
  describe('Tugas 3.2: Quirk Android Virtual Keyboard (Unidentified & keyup Fallback)', () => {
    it('Android virtual keyboard mengirim keydown Unidentified keyCode 13 lalu keyup Enter -> pilihan terjadi tepat SATU kali dan fokus maju', async () => {
      const options = [
        { value: 'transfer', label: 'Transfer Bank' },
        { value: 'pulsa', label: 'Pulsa' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="quirk-form">
          <div id="select-host"></div>
          <input id="target-field" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const host = div.querySelector('#select-host')!;
      const targetField = div.querySelector('#target-field') as HTMLInputElement;

      const wrapper = mount(SearchableSelect, {
        props: {
          options,
          modelValue: '',
        },
        attachTo: host,
      });

      // Buka dropdown
      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');

      // Simulasikan event Android Gboard: keydown dengan key: 'Unidentified' dan keyCode: 13
      await searchInput.trigger('keydown', { key: 'Unidentified', keyCode: 13 });
      // Diikuti keyup Enter dalam 15ms
      await searchInput.trigger('keyup', { key: 'Enter', keyCode: 13 });
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      // Memilih opsi pertama ('transfer') tepat 1 kali
      const updates = wrapper.emitted('update:modelValue');
      expect(updates).toBeDefined();
      expect(updates?.length).toBe(1);
      expect(updates?.[0]).toEqual(['transfer']);

      // Fokus maju ke targetField
      expect(document.activeElement).toBe(targetField);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('Keydown Enter biasa tidak memicu pemilihan ganda meskipun diikuti keyup Enter', async () => {
      const options = [
        { value: 'opt-1', label: 'Opsi Pertama' },
        { value: 'opt-2', label: 'Opsi Kedua' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="single-form">
          <div id="single-host"></div>
          <input id="single-target" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const host = div.querySelector('#single-host')!;

      const wrapper = mount(SearchableSelect, {
        props: {
          options,
          modelValue: '',
        },
        attachTo: host,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');

      // Keydown Enter biasa
      await searchInput.trigger('keydown', { key: 'Enter', keyCode: 13 });
      // Keyup Enter segera setelahnya
      await searchInput.trigger('keyup', { key: 'Enter', keyCode: 13 });
      await flushPromises();

      // Dipanggil tepat 1 kali, tidak ganda
      const updates = wrapper.emitted('update:modelValue');
      expect(updates?.length).toBe(1);

      wrapper.unmount();
      document.body.removeChild(div);
    });

    it('Virtual keyboard beforeinput dengan inputType insertLineBreak memicu pemilihan dan fokus maju', async () => {
      const options = [
        { value: 'pulsa', label: 'Pulsa' },
        { value: 'data', label: 'Paket Data' },
      ];

      const div = document.createElement('div');
      div.innerHTML = `
        <form id="beforeinput-form">
          <div id="beforeinput-host"></div>
          <input id="beforeinput-target" type="text" />
        </form>
      `;
      document.body.appendChild(div);

      const host = div.querySelector('#beforeinput-host')!;
      const target = div.querySelector('#beforeinput-target') as HTMLInputElement;

      const wrapper = mount(SearchableSelect, {
        props: {
          options,
          modelValue: '',
        },
        attachTo: host,
      });

      await wrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('.search-box-input');

      // Dispatch beforeinput dengan insertLineBreak (karakteristik keyboard virtual mobile)
      const beforeInputEvent = new InputEvent('beforeinput', {
        inputType: 'insertLineBreak',
        bubbles: true,
        cancelable: true,
      });
      searchInput.element.dispatchEvent(beforeInputEvent);
      await flushPromises();
      await new Promise((r) => setTimeout(r, 80));
      await flushPromises();

      expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['pulsa']);
      expect(document.activeElement).toBe(target);

      wrapper.unmount();
      document.body.removeChild(div);
    });
  });

  // ==========================================================================
  // TUGAS 3.3 — Tes Balapan (Fokus Berakhir Tepat di SATU Field)
  // ==========================================================================
  describe('Tugas 3.3: Uji Balapan (Fokus Berakhir Stabil di SATU Field Target)', () => {
    it('Pilih layanan lewat Enter berakhir stabil di trigger Sumber Dana tanpa terpental kembali ke trigger layanan', async () => {
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

      const trigger = wrapper.find('[data-testid="service-dropdown-trigger"]');
      await trigger.trigger('click');
      await flushPromises();

      const searchInput = wrapper.find('[data-testid="input-cari-layanan"]');
      await searchInput.setValue('transfer');
      await flushPromises();

      await searchInput.trigger('keydown', { key: 'Enter', keyCode: 13 });
      await flushPromises();

      // Berikan jeda untuk memeriksa apakah ada timer/nextTick kedua yang mengganggu fokus
      await new Promise((r) => setTimeout(r, 120));
      await flushPromises();

      const sourceAccountTrigger = wrapper.find('[data-testid="select-source-account-trigger"]').element;
      // Fokus harus tetap stabil di trigger Sumber Dana, BUKAN kembali ke service-dropdown-trigger
      expect(document.activeElement).toBe(sourceAccountTrigger);
      expect(document.activeElement).not.toBe(trigger.element);

      wrapper.unmount();
    });

    it('SearchableSelect di-unmount seketika saat timer advance pending tidak melempar error', async () => {
      const selectWrapper = mount(SearchableSelect, {
        props: {
          modelValue: '',
          options: [{ value: 'a', label: 'Item A' }],
          placeholder: 'Pilih item',
        },
        attachTo: document.body,
      });

      await selectWrapper.find('.searchable-select-trigger').trigger('click');
      await flushPromises();

      const searchInput = selectWrapper.find('.search-box-input');
      await searchInput.trigger('keydown', { key: 'Enter', keyCode: 13 });

      // Unmount seketika sebelum timeout retry advance meletup
      selectWrapper.unmount();

      // Tunggu timer yang tertunda melewati 80ms
      await new Promise((r) => setTimeout(r, 80));
      expect(true).toBe(true);
    });
  });
});
