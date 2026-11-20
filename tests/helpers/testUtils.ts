import { flushPromises } from '@vue/test-utils';

/**
 * Polling helper untuk menggantikan jeda tetap (setTimeout 50-60ms) pada tes UI Vue.
 * Mengulang assertion fungsi secara periodik sampai sukses atau melempar error setelah timeout.
 */
export async function waitFor(
  assertion: () => void | Promise<void>,
  options: { timeout?: number; interval?: number } = {}
): Promise<void> {
  const timeout = options.timeout ?? 5000;
  const interval = options.interval ?? 50;
  const startTime = Date.now();

  while (Date.now() - startTime < timeout) {
    await flushPromises();
    try {
      await assertion();
      return;
    } catch {
      // Tunggu siklus berikutnya jika assertion masih gagal
    }
    await new Promise((r) => setTimeout(r, interval));
  }

  // Final check: panggil kembali assertion agar melempar error asli Vitest
  await flushPromises();
  await assertion();
}

/**
 * Polling helper untuk menunggu teks tertentu muncul pada wrapper Vue Test Utils.
 */
export async function waitForText(
  wrapper: { text: () => string },
  text: string,
  timeout = 5000
): Promise<void> {
  await waitFor(() => {
    if (!wrapper.text().includes(text)) {
      throw new Error(`Teks "${text}" belum muncul dalam komponen.`);
    }
  }, { timeout });
}
