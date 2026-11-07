import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/database';
import type { AdminFeeRule, NewAdminFeeRule } from '../db/types';
import { AppError } from '../core/errors';

export type FeeType = 'tetap' | 'persentase';

export interface FeeResolution {
  rule: AdminFeeRule;
  fee: number; // int Rupiah, dibulatkan ke atas jika persentase
  isPercentage: boolean;
}

export interface FeeGap {
  fromNom: number; // inklusif
  toNom: number | null; // eksklusif, null = tak terhingga
}

export class FeeRuleService {
  /**
   * Cari tarif untuk (layanan, nominal).
   * - Hanya aturan aktif (isActive === true) untuk layanan itu
   * - Cocok jika nominal >= minNom && (maxNom === null || nominal < maxNom)
   * - Urutkan minNom DESC, first-match menang. Tidak cocok -> null (BUKAN fallback hardcoded)
   * - Tetap: fee = valMargin (int Rupiah)
   * - Persentase: fee = Math.ceil(nominal * persentaseVal / 100) — BULATKAN KE ATAS
   */
  public async resolveFee(params: { layanan: string; nominal: number }): Promise<FeeResolution | null> {
    const { layanan, nominal } = params;
    if (nominal <= 0) return null;

    const rules = await db.adminFeeRules
      .where('layanan')
      .equals(layanan)
      .filter((r) => r.isActive)
      .toArray();

    // Urutkan minNom DESC
    rules.sort((a, b) => b.minNom - a.minNom);

    for (const rule of rules) {
      const matchMin = nominal >= rule.minNom;
      const matchMax = rule.maxNom === null || nominal < rule.maxNom;

      if (matchMin && matchMax) {
        if (rule.feeType === 'persentase') {
          const pct = rule.persentaseVal ?? 0;
          // Math.ceil: selalu bulatkan ke atas ke Rupiah terdekat (DIKUNCI)
          const fee = Math.ceil((nominal * pct) / 100);
          return {
            rule,
            fee,
            isPercentage: true,
          };
        } else {
          return {
            rule,
            fee: rule.valMargin ?? 0,
            isPercentage: false,
          };
        }
      }
    }

    return null;
  }

  /**
   * Cek apakah dua interval [A_min, A_max) dan [B_min, B_max) bersinggungan / tumpang tindih.
   */
  public isOverlap(
    aMin: number,
    aMax: number | null,
    bMin: number,
    bMax: number | null
  ): boolean {
    const aEnd = aMax === null ? Infinity : aMax;
    const bEnd = bMax === null ? Infinity : bMax;
    return Math.max(aMin, bMin) < Math.min(aEnd, bEnd);
  }

  /**
   * Validasi murni: kembalikan aturan aktif yang overlap dengan kandidat.
   */
  public async validateNoOverlap(
    candidate: NewAdminFeeRule,
    opts?: { excludeId?: string }
  ): Promise<AdminFeeRule[]> {
    const existingRules = await db.adminFeeRules
      .where('layanan')
      .equals(candidate.layanan)
      .filter((r) => r.isActive && r.id !== opts?.excludeId)
      .toArray();

    const conflicts: AdminFeeRule[] = [];
    for (const rule of existingRules) {
      if (this.isOverlap(candidate.minNom, candidate.maxNom, rule.minNom, rule.maxNom)) {
        conflicts.push(rule);
      }
    }
    return conflicts;
  }

  /**
   * Tambah aturan baru. Wajib tolak bila overlap dengan aturan aktif lain untuk layanan yang sama.
   */
  public async addRule(rule: NewAdminFeeRule): Promise<string> {
    if (rule.minNom < 0) {
      throw new AppError('Nominal awal harus >= 0.');
    }
    if (rule.maxNom !== null && rule.maxNom <= rule.minNom) {
      throw new AppError('Nominal akhir harus lebih besar dari nominal awal.');
    }
    if (rule.feeType === 'tetap' && (!rule.valMargin || rule.valMargin <= 0)) {
      throw new AppError('Biaya tetap harus lebih besar dari Rp0.');
    }
    if (
      rule.feeType === 'persentase' &&
      (rule.persentaseVal === null || rule.persentaseVal <= 0 || rule.persentaseVal > 100)
    ) {
      throw new AppError('Persentase biaya harus lebih dari 0% dan maksimal 100%.');
    }

    const conflicts = await this.validateNoOverlap(rule);
    if (conflicts.length > 0) {
      const c = conflicts[0]!;
      const maxStr = c.maxNom !== null ? `Rp ${c.maxNom.toLocaleString('id-ID')}` : 'tanpa batas';
      throw new AppError(
        `Rentang bentrok dengan aturan layanan ${rule.layanan}: Rp ${c.minNom.toLocaleString('id-ID')} s.d. ${maxStr}.`
      );
    }

    const id = uuidv4();
    const now = Date.now();
    const record: AdminFeeRule = {
      ...rule,
      id,
      createdAt: now,
      updatedAt: now,
    };

    await db.adminFeeRules.add(record);
    return id;
  }

  /**
   * Tambah banyak aturan untuk multi-layanan dalam satu groupId.
   */
  public async addMultiServiceRule(params: {
    layananList: string[];
    minNom: number;
    maxNom: number | null;
    feeType: 'tetap' | 'persentase';
    valMargin: number | null;
    persentaseVal: number | null;
    isActive?: boolean;
  }): Promise<string> {
    const groupId = uuidv4();
    const isActive = params.isActive ?? true;

    // Validasi semua layanan dulu sebelum simpan
    for (const layanan of params.layananList) {
      const candidate: NewAdminFeeRule = {
        layanan,
        groupId,
        minNom: params.minNom,
        maxNom: params.maxNom,
        feeType: params.feeType,
        valMargin: params.valMargin,
        persentaseVal: params.persentaseVal,
        isActive,
      };
      const conflicts = await this.validateNoOverlap(candidate);
      if (conflicts.length > 0) {
        const c = conflicts[0]!;
        const maxStr = c.maxNom !== null ? `Rp ${c.maxNom.toLocaleString('id-ID')}` : 'tanpa batas';
        throw new AppError(
          `Rentang bentrok untuk layanan ${layanan}: Rp ${c.minNom.toLocaleString('id-ID')} s.d. ${maxStr}.`
        );
      }
    }

    const now = Date.now();
    const records: AdminFeeRule[] = params.layananList.map((layanan) => ({
      id: uuidv4(),
      layanan,
      groupId,
      minNom: params.minNom,
      maxNom: params.maxNom,
      feeType: params.feeType,
      valMargin: params.valMargin,
      persentaseVal: params.persentaseVal,
      isActive,
      createdAt: now,
      updatedAt: now,
    }));

    await db.adminFeeRules.bulkAdd(records);
    return groupId;
  }

  public async updateRule(id: string, patch: Partial<NewAdminFeeRule>): Promise<void> {
    const existing = await db.adminFeeRules.get(id);
    if (!existing) {
      throw new AppError('Aturan tarif tidak ditemukan.');
    }

    const candidate: NewAdminFeeRule = {
      ...existing,
      ...patch,
    };

    if (candidate.maxNom !== null && candidate.maxNom <= candidate.minNom) {
      throw new AppError('Nominal akhir harus lebih besar dari nominal awal.');
    }

    const conflicts = await this.validateNoOverlap(candidate, { excludeId: id });
    if (conflicts.length > 0) {
      throw new AppError(`Rentang bentrok dengan aturan lain untuk layanan ${candidate.layanan}.`);
    }

    await db.adminFeeRules.update(id, {
      ...patch,
      updatedAt: Date.now(),
    });
  }

  /**
   * Nonaktifkan aturan tarif (BUKAN hard-delete)
   */
  public async deactivateRule(id: string): Promise<void> {
    await db.adminFeeRules.update(id, {
      isActive: false,
      updatedAt: Date.now(),
    });
  }

  /**
   * Nonaktifkan seluruh grup layanan
   */
  public async deactivateGroup(groupId: string): Promise<void> {
    const rules = await db.adminFeeRules.where('groupId').equals(groupId).toArray();
    const now = Date.now();
    await db.transaction('rw', db.adminFeeRules, async () => {
      for (const r of rules) {
        await db.adminFeeRules.update(r.id, { isActive: false, updatedAt: now });
      }
    });
  }

  public async listRules(params?: { layanan?: string; activeOnly?: boolean }): Promise<AdminFeeRule[]> {
    let collection = db.adminFeeRules.toCollection();

    if (params?.layanan) {
      collection = db.adminFeeRules.where('layanan').equals(params.layanan);
    }

    let rules = await collection.toArray();
    if (params?.activeOnly) {
      rules = rules.filter((r) => r.isActive);
    }

    rules.sort((a, b) => a.minNom - b.minNom);
    return rules;
  }

  /**
   * Cari celah nominal yang belum tercakup aturan aktif untuk satu layanan dalam [0, maxNominalToCheck]
   */
  public async findGaps(params: { layanan: string; maxNominalToCheck?: number }): Promise<FeeGap[]> {
    const maxCheck = params.maxNominalToCheck ?? 10_000_000;
    const rules = await this.listRules({ layanan: params.layanan, activeOnly: true });

    if (rules.length === 0) {
      return [{ fromNom: 0, toNom: null }];
    }

    const gaps: FeeGap[] = [];
    let currentPoint = 0;

    for (const rule of rules) {
      if (rule.minNom > currentPoint) {
        gaps.push({ fromNom: currentPoint, toNom: rule.minNom });
      }
      currentPoint = rule.maxNom === null ? Infinity : Math.max(currentPoint, rule.maxNom);
      if (currentPoint === Infinity) break;
    }

    if (currentPoint < maxCheck && currentPoint !== Infinity) {
      gaps.push({ fromNom: currentPoint, toNom: null });
    }

    return gaps;
  }
}

export const feeRuleService = new FeeRuleService();
