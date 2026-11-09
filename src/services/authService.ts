import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { User, UserRole } from '../db/types';
import { AppError } from '../core/errors';

export class AuthServiceImpl {
  private currentActiveUser: User | null = null;
  private readonly SESSION_KEY = 'buku_konter_active_user_id';

  /**
   * Mengubah PIN mentah menjadi SHA-256 hash.
   * DILARANG menyimpan PIN mentah di Dexie, file, atau state.
   */
  public async hashPin(pin: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(pin);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  public async hasAnyUser(): Promise<boolean> {
    const count = await db.users.count();
    return count > 0;
  }

  public async hasPin(userId: string): Promise<boolean> {
    const user = await db.users.get(userId);
    return Boolean(user && user.pinHash);
  }

  public async setPin(userId: string, pin: string): Promise<void> {
    if (!pin || pin.length < 4) {
      throw new AppError('PIN minimal 4 angka');
    }
    const user = await db.users.get(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan');
    }
    const pinHash = await this.hashPin(pin);
    await db.users.update(userId, { pinHash });
  }

  public async verifyPin(userId: string, pin: string): Promise<boolean> {
    const user = await db.users.get(userId);
    if (!user || !user.pinHash) {
      return false;
    }
    const inputHash = await this.hashPin(pin);
    return user.pinHash === inputHash;
  }

  public async authenticateBiometric(): Promise<boolean> {
    // Biometric fallback ke PIN
    return false;
  }

  /**
   * Setup Owner pertama kali saat aplikasi baru diinstal.
   * Hanya diizinkan bila tabel users masih kosong.
   */
  public async createOwner(name: string, pin: string): Promise<User> {
    const exists = await this.hasAnyUser();
    if (exists) {
      throw new AppError('Akun Owner sudah terdaftar. Setup awal hanya untuk install baru.');
    }

    const trimmedName = name.trim();
    if (!trimmedName || trimmedName.length < 2) {
      throw new AppError('Nama Owner minimal 2 karakter.');
    }

    const trimmedPin = pin.trim();
    if (!trimmedPin || trimmedPin.length < 4) {
      throw new AppError('PIN Owner minimal 4 angka.');
    }

    const pinHash = await this.hashPin(trimmedPin);
    const now = Date.now();

    const owner: User = {
      id: uuidv4(),
      name: trimmedName,
      role: 'owner',
      pinHash,
      isActive: true,
      createdAt: now,
    };

    await db.transaction('rw', [db.users, db.auditLogs], async () => {
      await db.users.add(owner);
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: owner.id,
        action: 'setup_owner',
        entityType: 'user',
        entityId: owner.id,
        detail: JSON.stringify({ name: owner.name, role: owner.role }),
        createdAt: now,
      });
    });

    this.currentActiveUser = owner;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.SESSION_KEY, owner.id);
    }

    return owner;
  }

  public async login(userId: string, pin: string): Promise<void> {
    const user = await db.users.get(userId);
    if (!user || !user.isActive) {
      throw new AppError('Pengguna tidak ditemukan atau tidak aktif.');
    }

    const valid = await this.verifyPin(userId, pin);
    if (!valid) {
      throw new AppError('PIN salah. Silakan coba lagi.');
    }

    this.currentActiveUser = user;
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(this.SESSION_KEY, user.id);
    }

    // Catat log login
    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: user.id,
      action: 'login',
      entityType: 'user',
      entityId: user.id,
      detail: JSON.stringify({ timestamp: Date.now() }),
      createdAt: Date.now(),
    });
  }

  public async changePin(userId: string, oldPin: string, newPin: string): Promise<void> {
    const user = await db.users.get(userId);
    if (!user) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    const isValid = await this.verifyPin(userId, oldPin);
    if (!isValid) {
      throw new AppError('PIN lama tidak cocok.');
    }

    const trimmedNew = newPin.trim();
    if (!trimmedNew || trimmedNew.length < 4) {
      throw new AppError('PIN baru minimal 4 angka.');
    }

    const newHash = await this.hashPin(trimmedNew);
    await db.users.update(userId, { pinHash: newHash });

    await db.auditLogs.add({
      id: uuidv4(),
      actorUserId: userId,
      action: 'ubah_pin',
      entityType: 'user',
      entityId: userId,
      detail: JSON.stringify({ action: 'ubah_pin' }),
      createdAt: Date.now(),
    });
  }

  public async logout(): Promise<void> {
    this.currentActiveUser = null;
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(this.SESSION_KEY);
    }
  }

  public async getCurrentUser(): Promise<User | undefined> {
    if (this.currentActiveUser) {
      return this.currentActiveUser;
    }
    if (typeof localStorage !== 'undefined') {
      const savedId = localStorage.getItem(this.SESSION_KEY);
      if (savedId) {
        const user = await db.users.get(savedId);
        if (user && user.isActive) {
          this.currentActiveUser = user;
          return user;
        }
      }
    }
    return undefined;
  }

  public canManageMaster(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
  }

  public canAdjustBalance(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
  }

  public canViewModal(role: UserRole): boolean {
    return role === 'owner' || role === 'admin';
  }

  /**
   * Menambahkan petugas baru (Admin / Kasir).
   * Hanya boleh dilakukan oleh Owner.
   */
  public async createUser(name: string, role: UserRole, pin: string): Promise<User> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'owner') {
      throw new AppError('Hanya Owner yang berhak menambah petugas.');
    }

    if (role !== 'admin' && role !== 'kasir') {
      throw new AppError('Role petugas hanya boleh Admin atau Kasir.');
    }

    const trimmedName = name ? name.trim() : '';
    if (!trimmedName || trimmedName.length < 2) {
      throw new AppError('Nama petugas minimal 2 karakter.');
    }

    const trimmedPin = pin ? pin.trim() : '';
    if (!trimmedPin || trimmedPin.length < 4 || trimmedPin.length > 6 || !/^\d+$/.test(trimmedPin)) {
      throw new AppError('PIN harus berupa 4-6 angka.');
    }

    const pinHash = await this.hashPin(trimmedPin);
    const now = Date.now();

    const newUser: User = {
      id: uuidv4(),
      name: trimmedName,
      role,
      pinHash,
      isActive: true,
      createdAt: now,
    };

    await db.transaction('rw', [db.users, db.auditLogs], async () => {
      await db.users.add(newUser);
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: currentUser.id,
        action: 'tambah_petugas',
        entityType: 'user',
        entityId: newUser.id,
        detail: JSON.stringify({ name: newUser.name, role: newUser.role }),
        createdAt: now,
      });
    });

    return newUser;
  }

  /**
   * Mengubah nama atau role petugas.
   * Hanya boleh dilakukan oleh Owner.
   * Akun Owner tidak dapat diubah dari menu kelola petugas.
   */
  public async updateUser(
    userId: string,
    data: { name?: string; role?: UserRole }
  ): Promise<User> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'owner') {
      throw new AppError('Hanya Owner yang berhak mengubah data petugas.');
    }

    const target = await db.users.get(userId);
    if (!target) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    if (target.role === 'owner') {
      throw new AppError('Akun Owner tidak dapat diubah dari menu kelola petugas.');
    }

    if (data.role && data.role !== 'admin' && data.role !== 'kasir') {
      throw new AppError('Role petugas hanya boleh Admin atau Kasir.');
    }

    const updates: Partial<User> = {};
    if (data.name !== undefined) {
      const trimmedName = data.name.trim();
      if (!trimmedName || trimmedName.length < 2) {
        throw new AppError('Nama petugas minimal 2 karakter.');
      }
      updates.name = trimmedName;
    }

    if (data.role !== undefined) {
      updates.role = data.role;
    }

    const now = Date.now();
    await db.transaction('rw', [db.users, db.auditLogs], async () => {
      await db.users.update(userId, updates);
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: currentUser.id,
        action: 'update_petugas',
        entityType: 'user',
        entityId: userId,
        detail: JSON.stringify(updates),
        createdAt: now,
      });
    });

    const updated = await db.users.get(userId);
    return updated!;
  }

  /**
   * Mengaktifkan atau menonaktifkan akun petugas.
   * Hanya boleh dilakukan oleh Owner.
   * Akun Owner TIDAK BISA dinonaktifkan.
   */
  public async setUserActive(userId: string, isActive: boolean): Promise<User> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'owner') {
      throw new AppError('Hanya Owner yang berhak mengubah status petugas.');
    }

    const target = await db.users.get(userId);
    if (!target) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    if (target.role === 'owner' || target.id === currentUser.id) {
      throw new AppError('Akun Owner tidak dapat dinonaktifkan.');
    }

    const now = Date.now();
    await db.transaction('rw', [db.users, db.auditLogs], async () => {
      await db.users.update(userId, { isActive });
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: currentUser.id,
        action: isActive ? 'aktifkan_petugas' : 'nonaktifkan_petugas',
        entityType: 'user',
        entityId: userId,
        detail: JSON.stringify({ isActive }),
        createdAt: now,
      });
    });

    const updated = await db.users.get(userId);
    return updated!;
  }

  /**
   * Reset PIN petugas oleh Owner (tanpa memerlukan PIN lama).
   * Hanya boleh dilakukan oleh Owner.
   */
  public async resetPinByOwner(userId: string, newPin: string): Promise<void> {
    const currentUser = await this.getCurrentUser();
    if (!currentUser || currentUser.role !== 'owner') {
      throw new AppError('Hanya Owner yang berhak mereset PIN petugas.');
    }

    const target = await db.users.get(userId);
    if (!target) {
      throw new AppError('Pengguna tidak ditemukan.');
    }

    const trimmedNew = newPin ? newPin.trim() : '';
    if (!trimmedNew || trimmedNew.length < 4 || trimmedNew.length > 6 || !/^\d+$/.test(trimmedNew)) {
      throw new AppError('PIN baru harus 4-6 angka.');
    }

    const newHash = await this.hashPin(trimmedNew);
    const now = Date.now();

    await db.transaction('rw', [db.users, db.auditLogs], async () => {
      await db.users.update(userId, { pinHash: newHash });
      await db.auditLogs.add({
        id: uuidv4(),
        actorUserId: currentUser.id,
        action: 'reset_pin_petugas',
        entityType: 'user',
        entityId: userId,
        detail: JSON.stringify({ targetUserId: userId }),
        createdAt: now,
      });
    });
  }

  /**
   * Mengambil seluruh data user (untuk halaman Kelola Petugas).
   */
  public async getAllUsers(): Promise<User[]> {
    return await db.users.toArray();
  }
}

export const authService = new AuthServiceImpl();
