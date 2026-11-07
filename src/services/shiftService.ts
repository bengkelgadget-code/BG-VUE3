import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Shift } from '../db/types';
import { AppError } from '../core/errors';
import { accountService } from './accountService';
import { authService } from './authService';

export interface ShiftSummary {
  shiftId: string;
  saldoAwalSistem: Record<string, number>;
  saldoAkhirSistem: Record<string, number>;
  hitungFisik: Record<string, number>;
  selisih: Record<string, number>;
  totalTransaksi: number;
  totalLaba: number;
}

export class ShiftService {
  /**
   * Buka shift baru.
   * Satu user hanya boleh memiliki 1 shift aktif.
   * Saldo awal sistem diambil otomatis dari agregasi accountService.getAllBalances().
   */
  public async openShift(params: {
    userId: string;
    kasAwalFisik: number;
    note?: string;
  }): Promise<string> {
    const existing = await this.getActiveShift(params.userId);
    if (existing) {
      throw new AppError('Petugas ini sudah memiliki shift yang masih berjalan. Tutup shift terlebih dahulu.');
    }

    if (params.kasAwalFisik < 0 || !Number.isInteger(params.kasAwalFisik)) {
      throw new AppError('Hitungan fisik kas awal harus berupa bilangan bulat >= Rp0.');
    }

    const saldoAwalSistem = await accountService.getAllBalances();
    const id = uuidv4();
    const now = Date.now();

    const record: Shift = {
      id,
      userId: params.userId,
      openedAt: now,
      saldoAwalSistem,
      kasAwalFisik: params.kasAwalFisik,
      status: 'open',
      note: params.note?.trim(),
    };

    await db.shifts.add(record);

    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: params.userId,
      action: 'shift_open',
      entityType: 'shift',
      entityId: id,
      detail: JSON.stringify({ kasAwalFisik: params.kasAwalFisik }),
      createdAt: now,
    });

    return id;
  }

  /**
   * Tutup shift:
   * Menghitung saldo akhir sistem per akun, membandingkannya dengan hitung fisik yang diinput.
   * Selisih != 0 WAJIB ada penjelasan per akun.
   * Menutup shift tanpa hitung fisik DILARANG.
   */
  public async closeShift(params: {
    shiftId: string;
    hitungFisik: Record<string, number>;
    penjelasanSelisih: Record<string, string>;
    actorUserId: string;
  }): Promise<ShiftSummary> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) {
      throw new AppError('Shift tidak ditemukan.');
    }

    if (shift.status !== 'open') {
      throw new AppError('Shift ini sudah ditutup sebelumnya.');
    }

    if (!params.hitungFisik || Object.keys(params.hitungFisik).length === 0) {
      throw new AppError('Hitungan fisik kas dan saldo akun wajib diisi untuk menutup shift.');
    }

    const saldoAkhirSistem = await accountService.getAllBalances();
    const selisih: Record<string, number> = {};

    for (const [accId, fisik] of Object.entries(params.hitungFisik)) {
      const sistem = saldoAkhirSistem[accId] ?? 0;
      const diff = fisik - sistem;
      selisih[accId] = diff;

      // Selisih != 0 WAJIB ada penjelasan
      if (diff !== 0) {
        const alasan = params.penjelasanSelisih[accId]?.trim();
        if (!alasan || alasan.length < 2) {
          const acc = await db.accounts.get(accId);
          const name = acc?.name || 'Akun';
          throw new AppError(
            `Terdapat selisih pada ${name} (Rp ${diff.toLocaleString('id-ID')}). Penjelasan wajib diisi.`
          );
        }
      }
    }

    const now = Date.now();

    await db.transaction('rw', [db.shifts, db.auditLogs], async () => {
      await db.shifts.update(params.shiftId, {
        closedAt: now,
        saldoAkhirSistem,
        hitungFisik: params.hitungFisik,
        selisih,
        penjelasanSelisih: params.penjelasanSelisih,
        status: 'closed',
      });

      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: params.actorUserId,
        action: 'shift_close',
        entityType: 'shift',
        entityId: params.shiftId,
        detail: JSON.stringify({ selisih }),
        createdAt: now,
      });
    });

    return await this.getSummary(params.shiftId);
  }

  /**
   * Serah terima shift ke petugas berikutnya (PIN ganda).
   */
  public async handoverShift(params: {
    shiftId: string;
    toUserId: string;
    fromPin: string;
    toPin: string;
    note?: string;
  }): Promise<string> {
    const shift = await db.shifts.get(params.shiftId);
    if (!shift) {
      throw new AppError('Shift tidak ditemukan.');
    }

    // Verifikasi PIN pengirim (pemilik shift)
    const validFrom = await authService.verifyPin(shift.userId, params.fromPin);
    if (!validFrom) {
      throw new AppError('PIN petugas lama salah.');
    }

    // Verifikasi PIN penerima
    const validTo = await authService.verifyPin(params.toUserId, params.toPin);
    if (!validTo) {
      throw new AppError('PIN petugas penerima salah.');
    }

    const handoverId = uuidv4();
    const now = Date.now();

    await db.transaction('rw', [db.shifts, db.shiftHandovers, db.auditLogs], async () => {
      await db.shiftHandovers.add({
        id: handoverId,
        shiftId: params.shiftId,
        fromUserId: shift.userId,
        toUserId: params.toUserId,
        hitungFisikDiterima: shift.hitungFisik || {},
        status: 'done',
        note: params.note,
        createdAt: now,
      });

      await db.shifts.update(params.shiftId, {
        status: 'handed_over',
      });

      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: shift.userId,
        action: 'handover',
        entityType: 'shift',
        entityId: params.shiftId,
        detail: JSON.stringify({ toUserId: params.toUserId }),
        createdAt: now,
      });
    });

    return handoverId;
  }

  public async getActiveShift(userId: string): Promise<Shift | undefined> {
    return await db.shifts.where({ userId, status: 'open' }).first();
  }

  public async listShifts(params?: { from?: number; to?: number; userId?: string }): Promise<Shift[]> {
    let list = await db.shifts.toArray();
    if (params?.userId) {
      list = list.filter((s) => s.userId === params.userId);
    }
    if (params?.from) {
      list = list.filter((s) => s.openedAt >= params.from!);
    }
    if (params?.to) {
      list = list.filter((s) => s.openedAt <= params.to!);
    }
    list.sort((a, b) => b.openedAt - a.openedAt);
    return list;
  }

  public async getSummary(shiftId: string): Promise<ShiftSummary> {
    const shift = await db.shifts.get(shiftId);
    if (!shift) {
      throw new AppError('Shift tidak ditemukan.');
    }

    const txs = await db.transactions
      .where('shiftId')
      .equals(shiftId)
      .filter((t) => t.status !== 'void')
      .toArray();

    let totalLaba = 0;
    for (const t of txs) {
      // laba transaksi jasa = fee
      totalLaba += t.fee;
      // laba transaksi barang / digital = sum(hargaJualSnapshot - modalSnapshot)
      const items = await db.transactionItems.where('transactionId').equals(t.id).toArray();
      for (const item of items) {
        totalLaba += (item.hargaJualSnapshot - item.modalSnapshot) * item.qty;
      }
    }

    return {
      shiftId,
      saldoAwalSistem: shift.saldoAwalSistem || {},
      saldoAkhirSistem: shift.saldoAkhirSistem || {},
      hitungFisik: shift.hitungFisik || {},
      selisih: shift.selisih || {},
      totalTransaksi: txs.length,
      totalLaba,
    };
  }
}

export const shiftService = new ShiftService();
