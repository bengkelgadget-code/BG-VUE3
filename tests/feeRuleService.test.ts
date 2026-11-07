import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { feeRuleService } from '../src/services/feeRuleService';
import { AppError } from '../src/core/errors';

describe('FeeRuleService (Resolver Tarif Biaya Admin)', () => {
  beforeEach(async () => {
    await db.adminFeeRules.clear();
  });

  it('Kasus 1: tarik_tunai nominal 20.000 -> Rp3.000 (aturan contoh: 20.000 <= nom < 100.000, tetap)', async () => {
    await feeRuleService.addRule({
      layanan: 'tarik_tunai',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    const res = await feeRuleService.resolveFee({ layanan: 'tarik_tunai', nominal: 20000 });
    expect(res).not.toBeNull();
    expect(res?.fee).toBe(3000);
    expect(res?.isPercentage).toBe(false);
  });

  it('Kasus 2: batas atas eksklusif (nominal 99.999 -> Rp3.000, nominal 100.000 -> bukan Rp3.000)', async () => {
    await feeRuleService.addRule({
      layanan: 'tarik_tunai',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    const res99k = await feeRuleService.resolveFee({ layanan: 'tarik_tunai', nominal: 99999 });
    expect(res99k?.fee).toBe(3000);

    const res100k = await feeRuleService.resolveFee({ layanan: 'tarik_tunai', nominal: 100000 });
    expect(res100k).toBeNull(); // Tidak masuk karena batas atas eksklusif (< 100.000)
  });

  it('Kasus 3: persentase transfer 5.000.000 -> Rp20.000 (0,4%), nominal 10.000.000 -> Rp40.000', async () => {
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g2',
      minNom: 5000000,
      maxNom: null, // tanpa batas atas
      feeType: 'persentase',
      valMargin: null,
      persentaseVal: 0.4,
      isActive: true,
    });

    const res5jt = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 5000000 });
    expect(res5jt?.fee).toBe(20000);
    expect(res5jt?.isPercentage).toBe(true);

    const res10jt = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 10000000 });
    expect(res10jt?.fee).toBe(40000);
  });

  it('Kasus 4: pembulatan persentase WAJIB Math.ceil (bulatkan ke atas ke Rupiah terdekat)', async () => {
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g2',
      minNom: 5000000,
      maxNom: null,
      feeType: 'persentase',
      valMargin: null,
      persentaseVal: 0.4,
      isActive: true,
    });

    // 4a. 5.123.456 x 0,4% = 20.493,824 -> harus 20.494
    const resA = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 5123456 });
    expect(resA?.fee).toBe(20494);

    // 4b. 5.000.100 x 0,4% = 20.000,4 -> harus 20.001 (Math.round akan menghasilkan 20.000, ceil memberi 20.001)
    const resB = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 5000100 });
    expect(resB?.fee).toBe(20001);

    // 4c. Angka yang sudah bulat tidak berubah: 5.000.000 x 0,4% = 20.000 persis
    const resC = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 5000000 });
    expect(resC?.fee).toBe(20000);
  });

  it('Kasus 5: layanan tidak tercakup aturan -> null (BUKAN fallback hardcoded 5000/3000)', async () => {
    // Tidak ada aturan untuk pulsa
    const res = await feeRuleService.resolveFee({ layanan: 'pulsa', nominal: 50000 });
    expect(res).toBeNull();
  });

  it('Kasus 6: tolak simpan jika range tumpang-tindih (overlap) untuk layanan yang sama', async () => {
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    // Coba tambahkan 50.000 - 150.000 (bentrok di 50.000 - 100.000)
    await expect(
      feeRuleService.addRule({
        layanan: 'transfer',
        groupId: 'g2',
        minNom: 50000,
        maxNom: 150000,
        feeType: 'tetap',
        valMargin: 4000,
        persentaseVal: null,
        isActive: true,
      })
    ).rejects.toThrow(AppError);
  });

  it('Kasus 7: aturan beda layanan BOLEH overlap', async () => {
    // transfer 20.000 - 100.000
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    // tarik_tunai 20.000 - 100.000 (tidak bentrok karena beda layanan)
    const id = await feeRuleService.addRule({
      layanan: 'tarik_tunai',
      groupId: 'g2',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    expect(id).toBeDefined();
  });

  it('Kasus 8: maxNom == null menandakan tanpa batas atas (>= nominalMin)', async () => {
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g3',
      minNom: 5000000,
      maxNom: null,
      feeType: 'persentase',
      valMargin: null,
      persentaseVal: 0.4,
      isActive: true,
    });

    const resSangatBesar = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 100000000 });
    expect(resSangatBesar?.fee).toBe(400000); // 100jt x 0,4% = 400.000
  });

  it('Kasus 9: alur form end-to-end (buat aturan -> cocok -> nonaktifkan -> null)', async () => {
    // 1. Tambah aturan lewat service
    const ruleId = await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    // 2. Transaksi nominal 50.000 -> fee terisi Rp3.000
    const res1 = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 50000 });
    expect(res1?.fee).toBe(3000);

    // 3. Nonaktifkan aturan
    await feeRuleService.deactivateRule(ruleId);

    // 4. Transaksi berikutnya -> fee null (bukan fallback 5000/3000)
    const res2 = await feeRuleService.resolveFee({ layanan: 'transfer', nominal: 50000 });
    expect(res2).toBeNull();
  });

  it('Kasus ekstra: findGaps mendeteksi celah nominal yang belum tercakup', async () => {
    // Ada 20rb - 100rb dan 200rb ke atas, celah: 0-20rb dan 100rb-200rb
    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g1',
      minNom: 20000,
      maxNom: 100000,
      feeType: 'tetap',
      valMargin: 3000,
      persentaseVal: null,
      isActive: true,
    });

    await feeRuleService.addRule({
      layanan: 'transfer',
      groupId: 'g2',
      minNom: 200000,
      maxNom: null,
      feeType: 'persentase',
      valMargin: null,
      persentaseVal: 0.4,
      isActive: true,
    });

    const gaps = await feeRuleService.findGaps({ layanan: 'transfer' });
    expect(gaps.length).toBe(2);
    expect(gaps[0]).toEqual({ fromNom: 0, toNom: 20000 });
    expect(gaps[1]).toEqual({ fromNom: 100000, toNom: 200000 });
  });
});
