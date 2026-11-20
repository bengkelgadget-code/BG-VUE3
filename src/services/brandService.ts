import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { Brand } from '../db/types';
import { AppError } from '../core/errors';

export const PROVIDER_CATEGORIES: readonly string[] = [
  'pulsa',
  'data',
  'token_pln',
  'voucher',
  'perdana',
];

export class BrandService {
  /**
   * Mengambil daftar semua brand, terurut berdasarkan nama secara alfabetis.
   * Awalnya kosong sesuai aturan no-seed data.
   */
  public async listBrands(): Promise<Brand[]> {
    return await db.brands.orderBy('name').toArray();
  }

  /**
   * Mengambil daftar brand yang relevan untuk kategori tertentu.
   * - Kategori provider (pulsa, data, token_pln, voucher, perdana) berbagi daftar provider yang sama.
   * - Kategori mandiri (aksesoris, game, lainnya) hanya menampilkan brand yang diasosiasikan dengannya.
   */
  public async listBrandsForCategory(category: string): Promise<Brand[]> {
    const isProvider = PROVIDER_CATEGORIES.includes(category);
    const brands = await db.brands.toArray();

    return brands
      .filter((b) => {
        const cats =
          Array.isArray(b.categories) && b.categories.length > 0
            ? b.categories
            : [...PROVIDER_CATEGORIES];

        if (isProvider) {
          return cats.some((c) => PROVIDER_CATEGORIES.includes(c));
        }
        return cats.includes(category);
      })
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }));
  }

  /**
   * Menambahkan brand baru.
   * Nama wajib di-trim, minimal 2 karakter.
   * - Jika brand belum ada di DB: dibuat dengan kategori yang diminta.
   * - Jika brand sudah ada dan sudah punya kategori itu (atau sesama provider): tolak duplikat.
   * - Jika brand sudah ada tapi belum punya kategori itu: tambahkan kategori ke brand yang ada (asosiasikan).
   */
  public async addBrand(name: string, category: string = 'pulsa'): Promise<Brand> {
    const trimmed = name ? name.trim() : '';
    if (!trimmed || trimmed.length < 2) {
      throw new AppError('Nama brand/operator minimal 2 karakter.');
    }

    const existing = await db.brands.toArray();
    const found = existing.find(
      (b) => b.name.trim().toLowerCase() === trimmed.toLowerCase()
    );

    const isTargetProvider = PROVIDER_CATEGORIES.includes(category);

    if (found) {
      const existingCats =
        Array.isArray(found.categories) && found.categories.length > 0
          ? found.categories
          : [...PROVIDER_CATEGORIES];

      const hasTargetCategory = isTargetProvider
        ? existingCats.some((c) => PROVIDER_CATEGORIES.includes(c))
        : existingCats.includes(category);

      if (hasTargetCategory) {
        throw new AppError(`Brand "${found.name}" sudah ada di daftar.`);
      }

      // Brand sudah ada tapi belum diasosiasikan dengan kategori ini
      const updatedCats = Array.from(new Set([...existingCats, category]));
      const now = Date.now();
      await db.brands.update(found.id, {
        categories: updatedCats,
        updatedAt: now,
      });

      return {
        ...found,
        categories: updatedCats,
        updatedAt: now,
      };
    }

    // Brand baru sama sekali
    const brand: Brand = {
      id: uuidv4(),
      name: trimmed,
      categories: [category],
      createdAt: Date.now(),
    };

    await db.brands.add(brand);
    return brand;
  }

  /**
   * Memastikan brand ada di DB dan terasosiasi dengan kategori yang diberikan.
   * Tidak melempar error bila brand sudah ada; cukup asosiasikan jika belum.
   */
  public async ensureBrand(name: string, category: string = 'pulsa'): Promise<Brand | null> {
    const trimmed = name ? name.trim() : '';
    if (!trimmed || trimmed.length < 2) {
      return null;
    }

    const existing = await db.brands.toArray();
    const found = existing.find(
      (b) => b.name.trim().toLowerCase() === trimmed.toLowerCase()
    );

    const isTargetProvider = PROVIDER_CATEGORIES.includes(category);

    if (found) {
      const existingCats =
        Array.isArray(found.categories) && found.categories.length > 0
          ? found.categories
          : [...PROVIDER_CATEGORIES];

      const hasTargetCategory = isTargetProvider
        ? existingCats.some((c) => PROVIDER_CATEGORIES.includes(c))
        : existingCats.includes(category);

      if (hasTargetCategory) {
        return found;
      }

      const updatedCats = Array.from(new Set([...existingCats, category]));
      const now = Date.now();
      await db.brands.update(found.id, {
        categories: updatedCats,
        updatedAt: now,
      });

      return {
        ...found,
        categories: updatedCats,
        updatedAt: now,
      };
    }

    const brand: Brand = {
      id: uuidv4(),
      name: trimmed,
      categories: [category],
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
