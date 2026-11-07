import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Customer, NewCustomer } from '../db/types';
import { AppError } from '../core/errors';
import { authService } from './authService';

export class CustomerService {
  private async checkAdminAccess(actorUserId: string): Promise<void> {
    const actor = await db.users.get(actorUserId);
    if (!actor || !authService.canManageMaster(actor.role)) {
      throw new AppError('Hanya Owner dan Admin yang memiliki akses mengelola Master Pelanggan.');
    }
  }

  public async addCustomer(customer: NewCustomer, opts: { actorUserId: string }): Promise<string> {
    await this.checkAdminAccess(opts.actorUserId);

    const name = customer.name?.trim();
    if (!name || name.length < 1) {
      throw new AppError('Nama pelanggan wajib diisi.');
    }

    const id = uuidv4();
    const now = Date.now();

    const record: Customer = {
      id,
      name,
      phone: customer.phone?.trim() || undefined,
      note: customer.note?.trim() || undefined,
      balanceHutang: 0,
      isActive: customer.isActive ?? true,
      createdAt: now,
    };

    await db.customers.add(record);
    return id;
  }

  public async updateCustomer(
    id: string,
    patch: Partial<NewCustomer>,
    opts: { actorUserId: string }
  ): Promise<void> {
    await this.checkAdminAccess(opts.actorUserId);

    const existing = await db.customers.get(id);
    if (!existing) {
      throw new AppError('Pelanggan tidak ditemukan.');
    }

    await db.customers.update(id, {
      ...patch,
      name: patch.name !== undefined ? patch.name.trim() : existing.name,
    });
  }

  /**
   * Nonaktifkan / hapus pelanggan. Tolak bila pelanggan masih memiliki piutang aktif!
   */
  public async deactivateCustomer(id: string, opts: { actorUserId: string }): Promise<void> {
    await this.checkAdminAccess(opts.actorUserId);

    const existing = await db.customers.get(id);
    if (!existing) {
      throw new AppError('Pelanggan tidak ditemukan.');
    }

    if (existing.balanceHutang > 0) {
      throw new AppError(
        `Pelanggan '${existing.name}' masih memiliki sisa piutang sebesar Rp ${existing.balanceHutang.toLocaleString('id-ID')}. Selesaikan piutang terlebih dahulu.`
      );
    }

    await db.customers.delete(id);
  }

  public async listCustomers(params?: { query?: string }): Promise<Customer[]> {
    let list = await db.customers.toArray();
    if (params?.query) {
      const q = params.query.toLowerCase();
      list = list.filter(
        (c) => c.name.toLowerCase().includes(q) || (c.phone && c.phone.includes(q))
      );
    }
    return list;
  }

  public async getCustomer(id: string): Promise<Customer | undefined> {
    return await db.customers.get(id);
  }
}

export const customerService = new CustomerService();
