import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { shiftService } from '../src/services/shiftService';
import { accountService } from '../src/services/accountService';
import { AppError } from '../src/core/errors';

describe('ShiftService (Buka, Tutup & Serah Terima Shift)', () => {
  let kasId: string;
  const ownerUserId = 'owner-shift-1';
  const kasir1UserId = 'kasir-shift-1';
  const kasir2UserId = 'kasir-shift-2';

  beforeEach(async () => {
    await db.shifts.clear();
    await db.shiftHandovers.clear();
    await db.accounts.clear();
    await db.accountLedger.clear();
    await db.users.clear();
    await db.auditLogs.clear();
    await db.appSettings.clear();

    await db.appSettings.add({
      id: 1,
      theme: 'system',
      shiftTolerance: 5000,
      biometricEnabled: false,
    });

    // Seed test users with known SHA-256 pin hashes
    // Pin 111111 hash for owner
    // Pin 222222 hash for kasir 1
    // Pin 333333 hash for kasir 2
    const cryptoSubtle = globalThis.crypto.subtle;
    const encoder = new TextEncoder();

    async function hash(pin: string) {
      const data = encoder.encode(pin);
      const hashBuffer = await cryptoSubtle.digest('SHA-256', data);
      return Array.from(new Uint8Array(hashBuffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    }

    await db.users.add({
      id: ownerUserId,
      name: 'Owner Toko',
      role: 'owner',
      pinHash: await hash('111111'),
      isActive: true,
      createdAt: Date.now(),
    });

    await db.users.add({
      id: kasir1UserId,
      name: 'Kasir Pagi',
      role: 'kasir',
      pinHash: await hash('222222'),
      isActive: true,
      createdAt: Date.now(),
    });

    await db.users.add({
      id: kasir2UserId,
      name: 'Kasir Sore',
      role: 'kasir',
      pinHash: await hash('333333'),
      isActive: true,
      createdAt: Date.now(),
    });

    kasId = await accountService.addAccount({
      name: 'Kas Tunai',
      type: 'kas',
      initialBalance: 200000,
    });
  });

  it('1. Buka shift menyimpan kas awal fisik dan snapshot saldo sistem', async () => {
    const shiftId = await shiftService.openShift({
      userId: kasir1UserId,
      kasAwalFisik: 200000,
    });

    expect(shiftId).toBeDefined();

    const shift = await db.shifts.get(shiftId);
    expect(shift?.status).toBe('open');
    expect(shift?.kasAwalFisik).toBe(200000);
    expect(shift?.saldoAwalSistem[kasId]).toBe(200000);

    // Membuka shift kedua saat masih ada shift aktif ditolak
    await expect(
      shiftService.openShift({
        userId: kasir1UserId,
        kasAwalFisik: 200000,
      })
    ).rejects.toThrow(AppError);
  });

  it('2. Tutup shift: wajib penjelasan bila selisih != 0', async () => {
    const shiftId = await shiftService.openShift({
      userId: kasir1UserId,
      kasAwalFisik: 200000,
    });

    // Tutup shift dengan selisih fisik Rp 190.000 vs sistem Rp 200.000 (-10.000) tanpa penjelasan -> DITOLAK
    await expect(
      shiftService.closeShift({
        shiftId,
        hitungFisik: { [kasId]: 190000 },
        penjelasanSelisih: {},
        actorUserId: kasir1UserId,
      })
    ).rejects.toThrow('Terdapat selisih pada Kas Tunai');

    // Tutup shift dengan penjelasan -> BERHASIL
    const summary = await shiftService.closeShift({
      shiftId,
      hitungFisik: { [kasId]: 190000 },
      penjelasanSelisih: { [kasId]: 'Beli kantong plastik Rp 10.000' },
      actorUserId: kasir1UserId,
    });

    expect(summary.selisih[kasId]).toBe(-10000);

    const shift = await db.shifts.get(shiftId);
    expect(shift?.status).toBe('closed');
  });

  it('3. Serah terima shift membutuhkan 2 PIN valid; toleransi <= 5000 status "done" & buka shift baru', async () => {
    const shiftId = await shiftService.openShift({
      userId: kasir1UserId,
      kasAwalFisik: 200000,
    });

    await shiftService.closeShift({
      shiftId,
      hitungFisik: { [kasId]: 200000 },
      penjelasanSelisih: {},
      actorUserId: kasir1UserId,
    });

    // Coba serah terima dengan PIN pengirim salah
    await expect(
      shiftService.handoverShift({
        shiftId,
        toUserId: kasir2UserId,
        fromPin: '999999',
        toPin: '333333',
      })
    ).rejects.toThrow('PIN petugas lama salah');

    // Coba serah terima dengan PIN penerima salah
    await expect(
      shiftService.handoverShift({
        shiftId,
        toUserId: kasir2UserId,
        fromPin: '222222',
        toPin: '999999',
      })
    ).rejects.toThrow('PIN petugas penerima salah');

    // Serah terima dengan 2 PIN benar dan selisih 0 (<= toleransi)
    const res = await shiftService.handoverShift({
      shiftId,
      toUserId: kasir2UserId,
      fromPin: '222222',
      toPin: '333333',
    });

    expect(res.status).toBe('done');

    // Shift penerima otomatis terbuka dengan kas fisik diterima
    const newShift = await shiftService.getActiveShift(kasir2UserId);
    expect(newShift).toBeDefined();
    expect(newShift?.status).toBe('open');
    expect(newShift?.kasAwalFisik).toBe(200000);
  });

  it('4. Serah terima shift dengan selisih > toleransi Rp 5.000 -> status "pending_owner"', async () => {
    const shiftId = await shiftService.openShift({
      userId: kasir1UserId,
      kasAwalFisik: 200000,
    });

    // Selisih Rp 50.000 (> 5.000)
    await shiftService.closeShift({
      shiftId,
      hitungFisik: { [kasId]: 150000 },
      penjelasanSelisih: { [kasId]: 'Uang kurang di laci' },
      actorUserId: kasir1UserId,
    });

    const res = await shiftService.handoverShift({
      shiftId,
      toUserId: kasir2UserId,
      fromPin: '222222',
      toPin: '333333',
    });

    expect(res.status).toBe('pending_owner');

    // Shift penerima belum terbuka sebelum owner approve
    let newShift = await shiftService.getActiveShift(kasir2UserId);
    expect(newShift).toBeUndefined();

    // Owner approve
    await shiftService.approveHandover(res.handoverId, { actorUserId: ownerUserId });

    // Sekarang shift penerima terbuka
    newShift = await shiftService.getActiveShift(kasir2UserId);
    expect(newShift).toBeDefined();
    expect(newShift?.status).toBe('open');
    expect(newShift?.kasAwalFisik).toBe(150000);
  });
});
