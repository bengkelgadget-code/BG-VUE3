<template>
  <div ref="rootRef" class="searchable-select-wrapper" :class="{ disabled, open: isOpen }">
    <!-- Hidden native select for validation & test suite compatibility -->
    <select
      ref="nativeSelectRef"
      tabindex="-1"
      aria-hidden="true"
      class="form-select visually-hidden-select"
      :name="name"
      :id="id"
      :data-testid="dataTestid"
      :required="required"
      :disabled="disabled"
      :value="modelValue ?? ''"
      @change="onNativeSelectChange"
    >
      <option value="" :disabled="required">{{ placeholder || '-- Pilih --' }}</option>
      <option
        v-if="modelValue && !options.some((o) => String(o.value) === String(modelValue))"
        :value="modelValue"
      >
        {{ modelValue }}
      </option>
      <template v-if="optionGroups">
        <template v-for="g in optionGroups" :key="g.label">
          <optgroup v-if="g.label" :label="g.label">
            <option
              v-for="opt in g.options"
              :key="String(opt.value)"
              :value="opt.value"
              :disabled="opt.disabled"
            >
              {{ opt.label }}
            </option>
          </optgroup>
          <template v-else>
            <option
              v-for="opt in g.options"
              :key="String(opt.value)"
              :value="opt.value"
              :disabled="opt.disabled"
            >
              {{ opt.label }}
            </option>
          </template>
        </template>
      </template>
      <template v-else>
        <option
          v-for="opt in options"
          :key="String(opt.value)"
          :value="opt.value"
          :disabled="opt.disabled"
        >
          {{ opt.label }}
        </option>
      </template>
    </select>

    <!-- Trigger Button (styled identically to form-select) -->
    <button
      :id="triggerId || (id ? `${id}-trigger` : undefined)"
      ref="triggerBtnRef"
      type="button"
      class="searchable-select-trigger"
      :class="{ open: isOpen, 'has-value': Boolean(selectedOption) }"
      :disabled="disabled"
      :data-testid="triggerTestId || (dataTestid ? `${dataTestid}-trigger` : (id ? `trigger-${id}` : 'searchable-select-trigger'))"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      @click="toggleDropdown"
      @keydown.down.prevent="openDropdown"
      @keydown.enter.prevent="toggleDropdown"
      @keydown.esc.prevent="closeDropdown"
    >
      <div class="trigger-content">
        <component :is="selectedOption?.icon" v-if="selectedOption?.icon" class="trigger-icon" />
        <span v-if="selectedOption" class="selected-label">{{ selectedOption.label }}</span>
        <span v-else class="placeholder-label">{{ placeholder || '-- Pilih --' }}</span>
        <span v-if="selectedOption?.hint" class="trigger-hint">{{ selectedOption.hint }}</span>
      </div>
      <ChevronDown class="trigger-chevron" :class="{ rotated: isOpen }" />
    </button>

    <!-- Overlay Panel -->
    <div
      v-if="isOpen"
      class="searchable-select-panel"
      role="listbox"
      :data-testid="menuTestId || (dataTestid ? `${dataTestid}-menu` : 'searchable-select-menu')"
    >
      <div class="search-box-wrapper">
        <Search class="search-icon" />
        <input
          ref="searchInputRef"
          v-model="searchQuery"
          type="text"
          class="search-box-input"
          :placeholder="searchPlaceholder || 'Cari...'"
          :data-testid="searchTestId || (dataTestid ? `${dataTestid}-search` : 'searchable-select-input')"
          @keydown="onSearchInputKeyDown"
          @keyup="onSearchInputKeyUp"
          @beforeinput="onSearchInputBeforeInput"
        />
        <button
          v-if="searchQuery"
          type="button"
          class="btn-clear-search"
          aria-label="Hapus pencarian"
          @click="searchQuery = ''"
        >
          <X class="clear-icon" />
        </button>
      </div>

      <ul class="options-list">
        <li
          v-for="(opt, idx) in filteredOptions"
          :key="String(opt.value)"
          role="option"
          :aria-selected="opt.value === modelValue"
          class="option-item searchable-option-item"
          :class="[
            itemClass,
            {
              active: opt.value === modelValue,
              highlighted: idx === highlightedIndex,
              disabled: opt.disabled,
            }
          ]"
          :data-testid="optionTestIdPrefix ? `${optionTestIdPrefix}${opt.value}` : (dataTestid ? `${dataTestid}-option-${opt.value}` : `option-${opt.value}`)"
          @click="selectOption(opt)"
          @mouseenter="highlightedIndex = idx"
        >
          <component :is="opt.icon" v-if="opt.icon" class="option-icon" />
          <div class="option-text-wrapper">
            <span class="option-label">{{ opt.label }}</span>
            <span v-if="opt.hint" class="option-hint">{{ opt.hint }}</span>
          </div>
          <Check v-if="opt.value === modelValue" class="check-icon" />
          <button
            v-if="opt.deletable"
            type="button"
            class="btn-delete-option"
            title="Hapus"
            :data-testid="(opt.raw && (opt.raw as any).id) ? `delete-brand-${(opt.raw as any).id}` : `delete-option-${opt.value}`"
            @click.stop="$emit('delete', opt)"
          >
            <Trash2 class="trash-icon" />
          </button>
        </li>

        <li v-if="filteredOptions.length === 0" class="no-options-item brand-empty-hint">
          {{ emptyText || 'Tidak ada yang cocok' }}
        </li>
      </ul>

      <div v-if="addLabel" class="panel-footer">
        <button
          type="button"
          class="btn-add-item"
          :data-testid="addTestId || (dataTestid ? `${dataTestid}-add-btn` : 'searchable-select-add-btn')"
          @click="handleAdd"
        >
          <Plus class="plus-icon" />
          <span>{{ addLabel }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch, type Component } from 'vue';
import { ChevronDown, Search, Check, X, Plus, Trash2 } from 'lucide-vue-next';
import { focusNextFormField, isEnterKey } from '../utils/formNavigation';

export interface SelectOption {
  value: string | number;
  label: string;
  hint?: string;
  group?: string;
  icon?: Component;
  disabled?: boolean;
  deletable?: boolean;
  raw?: unknown;
  keywords?: string[];
}

interface Props {
  modelValue?: string | number | null;
  options: SelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  name?: string;
  id?: string;
  triggerId?: string;
  required?: boolean;
  disabled?: boolean;
  preserveSelected?: boolean;
  dataTestid?: string;
  triggerTestId?: string;
  menuTestId?: string;
  searchTestId?: string;
  optionTestIdPrefix?: string;
  itemClass?: string;
  addLabel?: string;
  addTestId?: string;
}

const props = withDefaults(defineProps<Props>(), {
  modelValue: '',
  options: () => [],
  placeholder: '-- Pilih --',
  searchPlaceholder: 'Cari...',
  emptyText: 'Tidak ada yang cocok',
  required: false,
  disabled: false,
  preserveSelected: false,
});

const emit = defineEmits<{
  (e: 'update:modelValue', value: string | number): void;
  (e: 'change', value: string | number): void;
  (e: 'add', query: string): void;
  (e: 'delete', option: SelectOption): void;
}>();

const rootRef = ref<HTMLElement | null>(null);
const triggerBtnRef = ref<HTMLButtonElement | null>(null);
const nativeSelectRef = ref<HTMLSelectElement | null>(null);
const searchInputRef = ref<HTMLInputElement | null>(null);

const isOpen = ref(false);
const searchQuery = ref('');
const highlightedIndex = ref(0);

const optionGroups = computed(() => {
  const hasGroups = props.options.some((o) => Boolean(o.group));
  if (!hasGroups) {
    return null;
  }
  const groups: { label: string; options: SelectOption[] }[] = [];
  const map = new Map<string, SelectOption[]>();
  for (const opt of props.options) {
    const grp = opt.group || '';
    if (!map.has(grp)) {
      map.set(grp, []);
    }
    map.get(grp)!.push(opt);
  }
  for (const [label, opts] of map.entries()) {
    groups.push({ label, options: opts });
  }
  return groups;
});

const selectedOption = computed(() => {
  if (props.modelValue === undefined || props.modelValue === null || props.modelValue === '') {
    return null;
  }
  const match = props.options.find((o) => String(o.value) === String(props.modelValue));
  if (match) return match;
  return { value: props.modelValue, label: String(props.modelValue) };
});

const filteredOptions = computed(() => {
  const q = searchQuery.value.trim().toLowerCase();
  const all = props.options;
  if (!q) return all;
  return all.filter((o) => {
    // Opsi yang sedang aktif diikutsertakan bila preserveSelected aktif
    if (props.preserveSelected && String(o.value) === String(props.modelValue)) return true;
    const matchLabel = o.label.toLowerCase().includes(q);
    const matchHint = (o.hint || '').toLowerCase().includes(q);
    const matchKeywords = o.keywords?.some((k) => k.toLowerCase().includes(q)) ?? false;
    return matchLabel || matchHint || matchKeywords;
  });
});

let lastEnterHandledTimestamp = 0;

watch(isOpen, (open) => {
  if (open) {
    lastEnterHandledTimestamp = 0;
    searchQuery.value = '';
    const curIdx = filteredOptions.value.findIndex((o) => String(o.value) === String(props.modelValue));
    highlightedIndex.value = curIdx >= 0 ? curIdx : 0;
    nextTick(() => {
      searchInputRef.value?.focus();
    });
  }
});

function toggleDropdown() {
  if (props.disabled) return;
  if (isOpen.value) {
    closeDropdown();
  } else {
    openDropdown();
  }
}

function openDropdown() {
  if (props.disabled) return;
  isOpen.value = true;
}

function closeDropdown() {
  isOpen.value = false;
  searchQuery.value = '';
}

function advanceFocusToNextField(triggerEl: HTMLElement) {
  // Dobel nextTick untuk memastikan cascading render Vue telah termount di DOM
  nextTick(() => {
    nextTick(() => {
      const advanced = focusNextFormField(triggerEl);
      if (!advanced) {
        // Percobaan ulang sekali lagi (mis. jeda layout/render di HP lambat)
        setTimeout(() => {
          const retried = focusNextFormField(triggerEl);
          if (!retried) {
            console.warn('[SearchableSelect] Field target berikutnya belum tersedia di DOM, fokus tetap di trigger.');
            triggerEl.focus?.();
          }
        }, 50);
      }
    });
  });
}

function selectOption(opt: SelectOption, advanceFocus = false) {
  if (opt.disabled) return;
  emit('update:modelValue', opt.value);
  emit('change', opt.value);
  closeDropdown();
  nextTick(() => {
    if (nativeSelectRef.value) {
      nativeSelectRef.value.value = String(opt.value);
    }
    if (advanceFocus && triggerBtnRef.value) {
      advanceFocusToNextField(triggerBtnRef.value);
    }
  });
}

function selectHighlighted(advanceFocus = true) {
  let opt = filteredOptions.value[highlightedIndex.value];
  if (!opt && filteredOptions.value.length > 0) {
    opt = filteredOptions.value[0];
  }
  if (opt) {
    selectOption(opt, advanceFocus);
  } else if (props.addLabel && searchQuery.value.trim()) {
    handleAdd();
  }
}

function onSearchInputKeyDown(e: KeyboardEvent) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    moveHighlight(1);
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    moveHighlight(-1);
  } else if (isEnterKey(e)) {
    e.preventDefault();
    lastEnterHandledTimestamp = Date.now();
    selectHighlighted(true);
  } else if (e.key === 'Tab') {
    onSearchInputTab(e);
  } else if (e.key === 'Escape' || e.keyCode === 27) {
    e.preventDefault();
    onSearchInputEsc();
  }
}

function onSearchInputKeyUp(e: KeyboardEvent) {
  if (isEnterKey(e)) {
    // Abaikan jika keydown sudah menangani Enter dalam 300ms terakhir
    if (Date.now() - lastEnterHandledTimestamp < 300) return;
    e.preventDefault();
    lastEnterHandledTimestamp = Date.now();
    selectHighlighted(true);
  }
}

function onSearchInputBeforeInput(e: Event) {
  const inputEvent = e as InputEvent;
  if (inputEvent.inputType === 'insertLineBreak') {
    inputEvent.preventDefault();
    if (Date.now() - lastEnterHandledTimestamp < 300) return;
    lastEnterHandledTimestamp = Date.now();
    selectHighlighted(true);
  }
}

function onSearchInputTab(e: KeyboardEvent) {
  if (filteredOptions.value.length > 0) {
    e.preventDefault();
    let opt = filteredOptions.value[highlightedIndex.value];
    if (!opt) {
      opt = filteredOptions.value[0];
    }
    selectOption(opt, true);
  } else {
    closeDropdown();
  }
}

function onSearchInputEsc() {
  closeDropdown();
  nextTick(() => {
    triggerBtnRef.value?.focus();
  });
}

function moveHighlight(step: number) {
  const total = filteredOptions.value.length;
  if (total === 0) return;
  highlightedIndex.value = (highlightedIndex.value + step + total) % total;
}

function handleAdd() {
  const val = searchQuery.value.trim();
  emit('update:modelValue', val);
  emit('change', val);
  emit('add', val);
  closeDropdown();
}

function onNativeSelectChange(e: Event) {
  const target = e.target as HTMLSelectElement;
  emit('update:modelValue', target.value);
  emit('change', target.value);
}

function handleClickOutside(e: MouseEvent) {
  if (rootRef.value && !rootRef.value.contains(e.target as Node)) {
    closeDropdown();
  }
}

onMounted(() => {
  document.addEventListener('pointerdown', handleClickOutside);
});

onUnmounted(() => {
  document.removeEventListener('pointerdown', handleClickOutside);
});

defineExpose({
  focus: () => triggerBtnRef.value?.focus(),
  open: openDropdown,
  close: closeDropdown,
  $el: rootRef,
});
</script>

<style scoped>
.searchable-select-wrapper {
  position: relative;
  width: 100%;
}

/* Hidden native select keeps DOM accessible & triggers HTML5 form validation */
.visually-hidden-select {
  position: absolute !important;
  width: 1px !important;
  height: 1px !important;
  padding: 0 !important;
  margin: -1px !important;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0) !important;
  white-space: nowrap !important;
  border: 0 !important;
  opacity: 0 !important;
  pointer-events: none !important;
}

.searchable-select-trigger {
  width: 100%;
  height: 46px;
  padding: 0 12px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card);
  color: var(--text-main);
  font-size: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  cursor: pointer;
  outline: none;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast);
  color-scheme: light dark;
  text-align: left;
}

[data-theme='dark'] .searchable-select-trigger {
  color-scheme: dark;
}

.searchable-select-trigger:focus,
.searchable-select-trigger.open {
  border-color: var(--border-focus);
  box-shadow: 0 0 0 2px var(--color-primary-light);
}

.searchable-select-wrapper.disabled .searchable-select-trigger {
  opacity: 0.6;
  cursor: not-allowed;
  background: var(--surface-card-subtle);
}

.trigger-content {
  display: flex;
  align-items: center;
  gap: 8px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

.trigger-icon {
  width: 18px;
  height: 18px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.selected-label {
  color: var(--text-main);
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.placeholder-label {
  color: var(--text-muted);
}

.trigger-hint {
  font-size: 11px;
  color: var(--text-secondary);
  margin-left: 4px;
}

.trigger-chevron {
  width: 18px;
  height: 18px;
  color: var(--text-secondary);
  transition: transform var(--transition-fast);
  flex-shrink: 0;
  margin-left: 8px;
}

.trigger-chevron.rotated {
  transform: rotate(180deg);
}

/* Dropdown Panel */
.searchable-select-panel {
  position: absolute;
  top: calc(100% + 4px);
  left: 0;
  right: 0;
  background: var(--surface-card);
  border: 1px solid var(--border-color);
  border-radius: var(--radius-card);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
  padding: 8px;
  z-index: 100;
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 320px;
}

[data-theme='dark'] .searchable-select-panel {
  background: #1e2430;
  border-color: #334155;
  box-shadow: 0 12px 30px rgba(0, 0, 0, 0.45);
}

.search-box-wrapper {
  position: relative;
  display: flex;
  align-items: center;
}

.search-icon {
  position: absolute;
  left: 10px;
  width: 15px;
  height: 15px;
  color: var(--text-muted);
  pointer-events: none;
}

.search-box-input {
  width: 100%;
  height: 36px;
  padding: 0 30px 0 32px;
  border-radius: var(--radius-btn);
  border: 1px solid var(--border-color);
  background: var(--surface-card-subtle);
  color: var(--text-main);
  font-size: 13px;
  outline: none;
}

.search-box-input:focus {
  border-color: var(--border-focus);
  background: var(--surface-card);
}

.btn-clear-search {
  position: absolute;
  right: 8px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  display: flex;
  align-items: center;
  padding: 2px;
}

.clear-icon {
  width: 14px;
  height: 14px;
}

.options-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  max-height: 220px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.option-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 12px;
  border-radius: 8px;
  cursor: pointer;
  color: var(--text-main);
  font-size: 13px;
  transition: background-color var(--transition-fast);
  user-select: none;
}

.option-item.highlighted,
.option-item:hover {
  background: var(--surface-card-subtle);
}

.option-item.active {
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-weight: 600;
}

.option-item.disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.option-icon {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  color: var(--color-primary);
}

.option-text-wrapper {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.option-hint {
  font-size: 11px;
  color: var(--text-secondary);
}

.check-icon {
  width: 16px;
  height: 16px;
  color: var(--color-primary);
  flex-shrink: 0;
}

.btn-delete-option {
  background: none;
  border: none;
  color: var(--text-muted);
  padding: 4px;
  border-radius: 4px;
  cursor: pointer;
  display: flex;
  align-items: center;
  margin-left: auto;
}

.btn-delete-option:hover {
  color: var(--color-danger);
  background: rgba(239, 68, 68, 0.1);
}

.trash-icon {
  width: 14px;
  height: 14px;
}

.no-options-item {
  padding: 14px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12px;
}

.panel-footer {
  border-top: 1px solid var(--border-color);
  padding-top: 6px;
  margin-top: 4px;
}

.btn-add-item {
  width: 100%;
  height: 36px;
  border: 1px dashed var(--color-primary);
  border-radius: var(--radius-btn);
  background: var(--color-primary-light);
  color: var(--color-primary-dark);
  font-size: 12px;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
}

.plus-icon {
  width: 14px;
  height: 14px;
}
</style>
