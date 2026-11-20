import { describe, it, expect } from 'vitest';
import { waitFor, waitForText } from './testUtils';

describe('testUtils: waitFor & waitForText Helper Suite', () => {
  it('waitFor langsung selesai saat assertion sudah benar sejak awal', async () => {
    let callCount = 0;
    await waitFor(() => {
      callCount++;
      expect(1 + 1).toBe(2);
    });
    expect(callCount).toBe(1);
  });

  it('waitFor melakukan polling dan berhasil saat kondisi menjadi benar setelah beberapa siklus', async () => {
    let value = 0;
    setTimeout(() => {
      value = 42;
    }, 80);

    await waitFor(() => {
      expect(value).toBe(42);
    }, { timeout: 1000, interval: 20 });

    expect(value).toBe(42);
  });

  it('waitFor melempar error asli Vitest dan TIDAK menelan kegagalan jika timeout terlampaui', async () => {
    await expect(
      waitFor(() => {
        expect('saldo-lama').toBe('saldo-baru');
      }, { timeout: 150, interval: 30 })
    ).rejects.toThrow("expected 'saldo-lama' to be 'saldo-baru'");
  });

  it('waitForText melempar error informatif jika teks tidak pernah muncul dalam komponen', async () => {
    const fakeWrapper = { text: () => 'Total Kas: Rp 0' };
    await expect(
      waitForText(fakeWrapper, 'Rp 19.303.137', 150)
    ).rejects.toThrow('Teks "Rp 19.303.137" belum muncul dalam komponen.');
  });
});
