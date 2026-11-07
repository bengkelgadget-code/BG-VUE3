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
  }): Promise<{ handoverId: string; status: 'done' | 'pending_owner' }> {
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

    const appSettings = await db.appSettings.get(1);
    const tolerance = appSettings?.shiftTolerance ?? 5000;

    let exceedsTolerance = false;
    if (shift.selisih) {
      for (const diff of Object.values(shift.selisih)) {
        if (Math.abs(diff) > tolerance) {
          exceedsTolerance = true;
          break;
        }
      }
    }

    const handoverStatus: 'done' | 'pending_owner' = exceedsTolerance ? 'pending_owner' : 'done';
    const handoverId = uuidv4();
    const now = Date.now();

    await db.transaction('rw', [db.shifts, db.shiftHandovers, db.auditLogs, db.accounts, db.accountLedger], async () => {
      await db.shiftHandovers.add({
        id: handoverId,
        shiftId: params.shiftId,
        fromUserId: shift.userId,
        toUserId: params.toUserId,
        hitungFisikDiterima: shift.hitungFisik || {},
        status: handoverStatus,
        note: params.note,
        createdAt: now,
      });

      await db.shifts.update(params.shiftId, {
        status: handoverStatus === 'pending_owner' ? 'pending_owner' : 'handed_over',
      });

      // Jika serah terima selesai (dalam batas toleransi), otomatis buka shift baru untuk petugas penerima
      if (handoverStatus === 'done') {
        const existingActive = await db.shifts.where({ userId: params.toUserId, status: 'open' }).first();
        if (!existingActive) {
          const accounts = await db.accounts.toArray();
          const kasAccount = accounts.find((a) => a.type === 'kas');
          const kasFisik = kasAccount && shift.hitungFisik ? (shift.hitungFisik[kasAccount.id] ?? shift.kasAwalFisik) : shift.kasAwalFisik;
          const saldoAwalSistem = await accountService.getAllBalances();

          await db.shifts.add({
            id: uuidv4(),
            userId: params.toUserId,
            openedAt: now,
            saldoAwalSistem,
            kasAwalFisik: kasFisik,
            status: 'open',
            note: `Dibuka otomatis dari serah terima shift ${shift.id.substring(0, 8)}`,
          });
        }
      }

      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: shift.userId,
        action: 'handover',
        entityType: 'shift',
        entityId: params.shiftId,
        detail: JSON.stringify({ toUserId: params.toUserId, status: handoverStatus }),
        createdAt: now,
      });
    });

    return { handoverId, status: handoverStatus };
  }

  /**
   * Persetujuan Owner untuk serah terima shift dengan selisih di atas toleransi
   */
  public async approveHandover(handoverId: string, opts: { actorUserId: string }): Promise<void> {
    const actor = await db.users.get(opts.actorUserId);
    if (!actor || actor.role !== 'owner') {
      throw new AppError('Hanya Owner yang berhak menyetujui serah terima berselisih.');
    }
    const handover = await db.shiftHandovers.get(handoverId);
    if (!handover) throw new AppError('Data serah terima tidak ditemukan.');

    const now = Date.now();
    await db.transaction('rw', [db.shifts, db.shiftHandovers, db.auditLogs, db.accounts, db.accountLedger], async () => {
      await db.shiftHandovers.update(handoverId, { status: 'done' });
      await db.shifts.update(handover.shiftId, { status: 'handed_over' });

      // Buka shift penerima
      const existingActive = await db.shifts.where({ userId: handover.toUserId, status: 'open' }).first();
      if (!existingActive) {
        const shift = await db.shifts.get(handover.shiftId);
        const accounts = await db.accounts.toArray();
        const kasAccount = accounts.find((a) => a.type === 'kas');
        const kasFisik = kasAccount && shift?.hitungFisik ? (shift.hitungFisik[kasAccount.id] ?? shift.kasAwalFisik) : (shift?.kasAwalFisik ?? 0);
        const saldoAwalSistem = await accountService.getAllBalances();

        await db.shifts.add({
          id: uuidv4(),
          userId: handover.toUserId,
          openedAt: now,
          saldoAwalSistem,
          kasAwalFisik: kasFisik,
          status: 'open',
          note: `Disetujui Owner dari serah terima shift ${handover.shiftId.substring(0, 8)}`,
        });
      }

      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: opts.actorUserId,
        action: 'approve_handover',
        entityType: 'shift_handover',
        entityId: handoverId,
        detail: JSON.stringify({ approved: true }),
        createdAt: now,
      });
    });
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
