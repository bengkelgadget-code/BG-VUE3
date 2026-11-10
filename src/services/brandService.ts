import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Brand } from '../db/types';
import { AppError } from '../core/errors';

export class BrandService {
  /**
   * Mengambil daftar semua brand, terurut berdasarkan nama secara alfabetis.
   * Awalnya kosong sesuai aturan no-seed data.
   */
  public async listBrands(): Promise<Brand[]> {
    return await db.brands.orderBy('name').toArray();
  }

  /**
   * Menambahkan brand baru.
   * Nama wajib di-trim, minimal 2 karakter, tolak jika duplikat (case-insensitive).
   */
  public async addBrand(name: string): Promise<Brand> {
    const trimmed = name ? name.trim() : '';
    if (!trimmed || trimmed.length < 2) {
      throw new AppError('Nama brand/operator minimal 2 karakter.');
    }

    const existing = await db.brands.toArray();
    const isDuplicate = existing.some(
      (b) => b.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new AppError(`Brand "${trimmed}" sudah ada di daftar.`);
    }

    const brand: Brand = {
      id: uuidv4(),
      name: trimmed,
      createdAt: Date.now(),
    };

    await db.brands.add(brand);
    return brand;
  }

  /**
   * Menghapus brand dari daftar referensi.
   * Menghapus brand TIDAK mengubah produk lama yang sudah memakai brand itu.
   */
  public async removeBrand(id: string): Promise<void> {
    const brand = await db.brands.get(id);
    if (!brand) {
      throw new AppError('Brand tidak ditemukan.');
    }
    await db.brands.delete(id);
  }
}

export const brandService = new BrandService();
