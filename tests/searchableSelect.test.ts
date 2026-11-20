import { describe, it, expect } from 'vitest';
import { mount } from '@vue/test-utils';
import SearchableSelect from '../src/components/SearchableSelect.vue';

describe('SearchableSelect Component (b33)', () => {
  const sampleOptions = [
    { value: 'opt-1', label: 'Option Alpha', hint: 'Keterangan A' },
    { value: 'opt-2', label: 'Option Beta', hint: 'Keterangan B' },
    { value: 'opt-3', label: 'Option Gamma', hint: 'Keterangan C' },
  ];

  it('render trigger dengan placeholder dan membuka panel saat diklik', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: '',
        options: sampleOptions,
        placeholder: 'Pilih salah satu',
        dataTestid: 'custom-select',
      },
    });

    // Trigger button dirender
    const trigger = wrapper.find('[data-testid="custom-select-trigger"]');
    expect(trigger.exists()).toBe(true);
    expect(trigger.text()).toContain('Pilih salah satu');

    // Panel awal tertutup
    expect(wrapper.find('[data-testid="custom-select-menu"]').exists()).toBe(false);

    // Klik trigger membuka panel
    await trigger.trigger('click');
    expect(wrapper.find('[data-testid="custom-select-menu"]').exists()).toBe(true);

    // Input cari otomatis ada
    const searchInput = wrapper.find('[data-testid="custom-select-search"]');
    expect(searchInput.exists()).toBe(true);
  });

  it('menyaring opsi saat diketik substring case-insensitive', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: '',
        options: sampleOptions,
        dataTestid: 'custom-select',
      },
    });

    await wrapper.find('[data-testid="custom-select-trigger"]').trigger('click');
    const searchInput = wrapper.find('[data-testid="custom-select-search"]');

    // Ketik "beta"
    await searchInput.setValue('beta');
    const items = wrapper.findAll('.option-item');
    expect(items).toHaveLength(1);
    expect(items[0]?.text()).toContain('Option Beta');

    // Bersihkan search
    await searchInput.setValue('');
    expect(wrapper.findAll('.option-item')).toHaveLength(3);
  });

  it('keyboard navigation (Down + Enter) memilih opsi dan Esc menutup', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: '',
        options: sampleOptions,
        dataTestid: 'custom-select',
      },
    });

    await wrapper.find('[data-testid="custom-select-trigger"]').trigger('click');
    const searchInput = wrapper.find('[data-testid="custom-select-search"]');

    // Navigasi ke opsi kedua
    await searchInput.trigger('keydown', { key: 'ArrowDown' });
    await searchInput.trigger('keydown', { key: 'Enter' });

    expect(wrapper.emitted('update:modelValue')?.[0]).toEqual(['opt-2']);
    // Panel menutup setelah memilih
    expect(wrapper.find('[data-testid="custom-select-menu"]').exists()).toBe(false);

    // Buka lagi dan tekan Escape
    await wrapper.find('[data-testid="custom-select-trigger"]').trigger('click');
    expect(wrapper.find('[data-testid="custom-select-menu"]').exists()).toBe(true);
    await searchInput.trigger('keydown', { key: 'Escape' });
    expect(wrapper.find('[data-testid="custom-select-menu"]').exists()).toBe(false);
  });

  it('native select tersembunyi sinkron dengan modelValue dan mendukung required', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: 'opt-1',
        options: sampleOptions,
        required: true,
      },
    });

    const nativeSelect = wrapper.find('select.visually-hidden-select');
    expect(nativeSelect.exists()).toBe(true);
    expect(nativeSelect.attributes('required')).toBeDefined();
    expect((nativeSelect.element as HTMLSelectElement).value).toBe('opt-1');

    // Saat native select diubah oleh script atau test runner, emits update:modelValue
    await nativeSelect.setValue('opt-3');
    expect(wrapper.emitted('update:modelValue')?.some((args) => args[0] === 'opt-3')).toBe(true);
  });

  it('mendukung addLabel dan emit add(query)', async () => {
    const wrapper = mount(SearchableSelect, {
      props: {
        modelValue: '',
        options: sampleOptions,
        addLabel: '+ Tambah Baru',
        dataTestid: 'custom-select',
      },
    });

    await wrapper.find('[data-testid="custom-select-trigger"]').trigger('click');
    const searchInput = wrapper.find('[data-testid="custom-select-search"]');
    await searchInput.setValue('New Option');

    const addBtn = wrapper.find('[data-testid="custom-select-add-btn"]');
    expect(addBtn.exists()).toBe(true);
    await addBtn.trigger('click');

    expect(wrapper.emitted('add')?.[0]).toEqual(['New Option']);
  });
});
