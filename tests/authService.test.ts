import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db/database';
import { authService } from '../src/services/authService';
import { AppError } from '../src/core/errors';

describe('AuthService & Setup Owner Pertama (Fase 0)', () => {
  beforeEach(async () => {
    // Bersihkan tabel sebelum tiap pengujian
    await db.users.clear();
    await db.accounts.clear();
    await db.products.clear();
    await db.customers.clear();
    await db.adminFeeRules.clear();
    await db.auditLogs.clear();
    await authService.logout();
  });

  it('semua tabel master lokal WAJIB KOSONG saat install pertama (tanpa data seed)', async () => {
    const userCount = await db.users.count();
    const accountCount = await db.accounts.count();
    const productCount = await db.products.count();
    const customerCount = await db.customers.count();
    const feeRuleCount = await db.adminFeeRules.count();

    expect(userCount).toBe(0);
    expect(accountCount).toBe(0);
    expect(productCount).toBe(0);
    expect(customerCount).toBe(0);
    expect(feeRuleCount).toBe(0);

    const hasUser = await authService.hasAnyUser();
    expect(hasUser).toBe(false);
  });

  it('harus membuat akun Owner pertama dengan PIN tersimpan sebagai hash SHA-256 (bukan mentah)', async () => {
    const rawPin = '1234';
    const owner = await authService.createOwner('Bengkel Owner', rawPin);

    expect(owner.id).toBeDefined();
    expect(owner.name).toBe('Bengkel Owner');
    expect(owner.role).toBe('owner');
    expect(owner.isActive).toBe(true);

    // Verifikasi hash SHA-256 (panjang 64 karakter heksadesimal)
    expect(owner.pinHash).toHaveLength(64);
    expect(owner.pinHash).not.toBe(rawPin);

    // Periksa bahwa PIN mentah TIDAK PERNAH disimpan di database
    const savedInDb = await db.users.get(owner.id);
    expect(savedInDb).toBeDefined();
    expect(savedInDb?.pinHash).toBe(owner.pinHash);
    expect((savedInDb as unknown as Record<string, unknown>)['pin']).toBeUndefined();

    // Pastikan jejak audit log tercatat
    const logs = await db.auditLogs.where({ entityId: owner.id }).toArray();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs[0]?.action).toBe('setup_owner');
  });

  it('harus menolak pembuatan Owner kedua kali (hanya boleh satu kali saat setup awal)', async () => {
    await authService.createOwner('Owner Pertama', '1234');

    await expect(authService.createOwner('Owner Kedua', '5678')).rejects.toThrow(AppError);
    await expect(authService.createOwner('Owner Kedua', '5678')).rejects.toThrow(
      'Akun Owner sudah terdaftar'
    );
  });

  it('harus memvalidasi PIN saat login dan menolak PIN yang salah', async () => {
    const owner = await authService.createOwner('Owner Toko', '8888');

    // PIN salah
    await expect(authService.login(owner.id, '0000')).rejects.toThrow(AppError);
    await expect(authService.login(owner.id, '0000')).rejects.toThrow('PIN salah');

    // PIN benar
    await authService.login(owner.id, '8888');
    const currentUser = await authService.getCurrentUser();
    expect(currentUser).toBeDefined();
    expect(currentUser?.id).toBe(owner.id);
  });

  it('harus memvalidasi hak akses peran (Owner/Admin boleh, Kasir dilarang melihat modal & koreksi saldo)', () => {
    // Owner
    expect(authService.canManageMaster('owner')).toBe(true);
    expect(authService.canAdjustBalance('owner')).toBe(true);
    expect(authService.canViewModal('owner')).toBe(true);

    // Admin
    expect(authService.canManageMaster('admin')).toBe(true);
    expect(authService.canAdjustBalance('admin')).toBe(true);
    expect(authService.canViewModal('admin')).toBe(true);

    // Kasir (DILARANG KERAS melihat modal atau koreksi saldo)
    expect(authService.canManageMaster('kasir')).toBe(false);
    expect(authService.canAdjustBalance('kasir')).toBe(false);
    expect(authService.canViewModal('kasir')).toBe(false);
  });
});
