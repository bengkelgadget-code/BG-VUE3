/**
 * Form Navigation Utility (b37, b38)
 * Memastikan Enter / Tab berpindah ke field berikutnya di semua form dan semua role.
 * Field disabled / hidden dilewati; field terakhir Enter fokus ke tombol submit (bukan auto-submit).
 * Mendukung keyboard fisik & keyboard virtual Android (Unidentified, keyCode 13, keyup fallback).
 */

export function isEnterKey(e: KeyboardEvent): boolean {
  return (
    e.key === 'Enter' ||
    e.code === 'Enter' ||
    e.code === 'NumpadEnter' ||
    e.keyCode === 13 ||
    e.which === 13
  );
}

export function getFocusableFormElements(container: HTMLElement): HTMLElement[] {
  const selector = [
    'input:not([type="hidden"]):not([disabled]):not([tabindex="-1"])',
    'select:not([disabled]):not([tabindex="-1"])',
    'textarea:not([disabled]):not([tabindex="-1"])',
    'button:not([disabled]):not([tabindex="-1"])',
    '.searchable-select-trigger:not([disabled])',
  ].join(', ');

  const rawElements = Array.from(container.querySelectorAll<HTMLElement>(selector));

  return rawElements.filter((el) => {
    // Abaikan elemen select native tersembunyi
    if (el.classList.contains('visually-hidden-select')) return false;

    // Abaikan tombol-tombol internal helper
    if (el.classList.contains('btn-clear-search')) return false;
    if (el.classList.contains('clear-icon')) return false;
    if (el.classList.contains('btn-delete-option')) return false;
    if (el.classList.contains('btn-back')) return false;
    if (el.classList.contains('btn-add-item')) return false;
    if (el.closest('.searchable-select-panel')) return false;

    // Abaikan elemen yang tidak tampil (display: none, visibility: hidden, atau atribut hidden)
    if (el.hasAttribute('hidden') || el.getAttribute('aria-hidden') === 'true') return false;
    if (typeof window !== 'undefined' && window.getComputedStyle) {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
    }

    return true;
  });
}

export function focusElement(target: HTMLElement | null | undefined): boolean {
  if (!target) return false;
  if (typeof target.focus === 'function') {
    target.focus();
    return true;
  }
  return false;
}

export function focusNextFormField(currentEl: HTMLElement, container?: HTMLElement | null): boolean {
  if (typeof document === 'undefined') return false;
  if (!currentEl) return false;
  if ('isConnected' in currentEl && !currentEl.isConnected) return false;

  // Dapatkan container form
  const docBody = typeof document !== 'undefined' ? document.body : null;
  const form = container || currentEl.closest('form') || currentEl.closest('.form-container') || currentEl.closest('.app-main') || docBody;
  if (!form) return false;

  const focusables = getFocusableFormElements(form as HTMLElement);
  if (focusables.length === 0) return false;

  // Normalisasi elemen pembanding: jika berada di dalam SearchableSelect, rujuk trigger-nya
  let referenceEl: HTMLElement = currentEl;
  const selectWrapper = currentEl.closest('.searchable-select-wrapper');
  if (selectWrapper) {
    const trigger = selectWrapper.querySelector<HTMLElement>('.searchable-select-trigger');
    if (trigger) referenceEl = trigger;
  }

  const currentIndex = focusables.indexOf(referenceEl);
  if (currentIndex === -1) {
    // Jika tidak ditemukan di list, cari elemen berikutnya berdasarkan urutan dokumen
    const followingBit = typeof Node !== 'undefined' ? Node.DOCUMENT_POSITION_FOLLOWING : 4;
    for (let i = 0; i < focusables.length; i++) {
      const pos = referenceEl.compareDocumentPosition(focusables[i]);
      if (pos & followingBit) {
        return focusElement(focusables[i]);
      }
    }
    return false;
  }

  // Cari elemen berikutnya yang valid
  for (let i = currentIndex + 1; i < focusables.length; i++) {
    const next = focusables[i];
    // Lewati tombol non-submit (seperti toggle status yang tidak terpilih) jika diinginkan, atau fokus langsung
    const focused = focusElement(next);
    if (focused) return true;
  }

  return false;
}

let lastFormEnterTimestamp = 0;

export function handleFormKeyDown(e: KeyboardEvent, formEl?: HTMLElement | null): void {
  if (!isEnterKey(e)) return;
  const target = (e.target || e.currentTarget) as HTMLElement | null;
  if (!target) return;

  // Biarkan Enter di textarea berjalan normal
  if (target.tagName === 'TEXTAREA') return;

  // Biarkan SearchableSelect input & trigger menangani Enter secara internal
  if (target.classList.contains('search-box-input')) return;
  if (target.classList.contains('searchable-select-trigger')) return;
  if (target.closest('.searchable-select-panel')) return;

  // Jika tombol submit sudah difokuskan, biarkan form submit berjalan normal
  if (
    target.tagName === 'BUTTON' &&
    (target.getAttribute('type') === 'submit' ||
      target.classList.contains('btn-submit-tx') ||
      target.classList.contains('btn-submit'))
  ) {
    return;
  }

  // Cegah submit form default pada input
  e.preventDefault();
  lastFormEnterTimestamp = Date.now();

  // Majukan fokus ke field berikutnya
  const container = formEl || target.closest('form') || (target.closest('.app-main') as HTMLElement);
  focusNextFormField(target, container);
}

export function handleFormKeyUp(e: KeyboardEvent, formEl?: HTMLElement | null): void {
  if (!isEnterKey(e)) return;
  // Jika sudah ditangani oleh keydown dalam 300ms terakhir, abaikan keyup duplikat
  if (Date.now() - lastFormEnterTimestamp < 300) return;

  const target = (e.target || e.currentTarget) as HTMLElement | null;
  if (!target) return;

  if (target.tagName === 'TEXTAREA') return;
  if (target.classList.contains('search-box-input')) return;
  if (target.classList.contains('searchable-select-trigger')) return;
  if (target.closest('.searchable-select-panel')) return;
  if (
    target.tagName === 'BUTTON' &&
    (target.getAttribute('type') === 'submit' ||
      target.classList.contains('btn-submit-tx') ||
      target.classList.contains('btn-submit'))
  ) {
    return;
  }

  e.preventDefault();
  lastFormEnterTimestamp = Date.now();

  const container = formEl || target.closest('form') || (target.closest('.app-main') as HTMLElement);
  focusNextFormField(target, container);
}
