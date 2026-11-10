export interface Account {
  id: string; // uuid, PK
  name: string; // mis. 'Kas Tunai', 'Bank BCA', 'DANA', 'Server Pulsa (catatan)'
  type: 'kas' | 'bank' | 'ewallet' | 'server_pulsa' | 'provider_app';
  accountNo?: string; // no. rekening / ID ewallet, kosong untuk kas
  ownerName?: string;
  initialBalance: number; // int Rupiah, default 0 (dicatat sebagai saldo awal, bukan transaksi)
  icon: string; // kode Lucide
  color: string; // hex
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export interface AccountLedger {
  id: string;
  accountId: string;
  transactionId?: string; // kosong untuk koreksi manual
  kind: 'pokok' | 'fee' | 'laba' | 'koreksi_manual' | 'pindah_dana' | 'deposit';
  delta: number; // int Rupiah, boleh negatif
  note?: string;
  createdAt: number; // epoch ms
}

export interface Product {
  id: string;
  externalProductRef?: string; // id/SKU katalog Supabase, read-only ref
  name: string;
  category: 'pulsa' | 'data' | 'token_pln' | 'voucher' | 'perdana' | 'aksesoris' | 'lainnya';
  operator?: string; // Telkomsel, Indosat, PLN, dll.
  denomination?: string; // '5.000', '10.000', '20.000', dst
  modal: number; // int Rupiah — dari Master Produk lokal (Owner/Admin)
  hargaJual: number; // int Rupiah — dari Master Produk lokal
  stock: number | null; // null untuk digital; number untuk voucher/perdana/aksesoris
  stockMin: number; // default 0
  barcode?: string;
  location?: string;
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export type NewProduct = Omit<Product, 'id' | 'createdAt' | 'updatedAt'>;

export interface ProductCatalogEntry {
  id: string; // id/SKU katalog Supabase (PK)
  name: string;
  category: 'pulsa' | 'data' | 'token_pln' | 'lainnya';
  operator?: string;
  denomination?: string;
  isActive: boolean;
  updatedAt: number; // epoch ms
}

export interface AdminFeeRule {
  id: string;
  layanan: string; // kode layanan
  groupId: string; // pengelompok aturan multi-layanan di UI
  minNom: number; // inklusif, >=, int Rupiah
  maxNom: number | null; // eksklusif, <; null = Infinity
  feeType: 'tetap' | 'persentase';
  valMargin: number | null; // int Rupiah, bila feeType == 'tetap'
  persentaseVal: number | null; // mis. 0.4 = 0,4%, bila feeType == 'persentase'
  isActive: boolean;
  createdAt: number; // epoch ms
  updatedAt: number; // epoch ms
}

export type NewAdminFeeRule = Omit<AdminFeeRule, 'id' | 'createdAt' | 'updatedAt'>;

export interface Transaction {
  id: string;
  layanan: string;
  shiftId: string;
  userId: string;
  accountId?: string;
  sourceAccountId?: string;
  destAccountId?: string;
  nominal: number; // > 0, int Rupiah
  fee: number; // int Rupiah, default 0
  feePaidBy: 'cash' | 'debit_rekening';
  feeRuleId?: string;
  feeManualOverride: boolean;
  paymentMethod: 'tunai' | 'transfer' | 'qris' | 'ewallet';
  paymentStatus: 'lunas' | 'hutang';
  date: number; // epoch ms (WITA)
  dateChangeReason?: string; // Alasan koreksi tanggal oleh Owner/Admin
  note?: string;
  referenceNo?: string;
  photoPath?: string;
  customerId?: string; // WAJIB bila paymentStatus == 'hutang'
  status: 'ok' | 'void';
  voidReason?: string;
  voidBy?: string;
  voidAt?: number;
  createdAt: number;
  updatedAt: number;
}

export interface TransactionItem {
  id: string;
  transactionId: string;
  productId: string;
  productNameSnapshot: string;
  qty: number;
  modalSnapshot: number; // int Rupiah
  hargaJualSnapshot: number; // int Rupiah
  subtotal: number; // qty * hargaJualSnapshot
}

export interface Shift {
  id: string;
  userId: string;
  openedAt: number;
  closedAt?: number;
  saldoAwalSistem: Record<string, number>;
  kasAwalFisik: number; // int Rupiah
  saldoAkhirSistem?: Record<string, number>;
  hitungFisik?: Record<string, number>;
  selisih?: Record<string, number>;
  penjelasanSelisih?: Record<string, string>;
  status: 'open' | 'closed' | 'handed_over' | 'pending_owner';
  note?: string;
}

export interface ShiftHandover {
  id: string;
  shiftId: string;
  fromUserId: string;
  toUserId: string;
  hitungFisikDiterima: Record<string, number>;
  status: 'done' | 'pending_owner';
  note?: string;
  createdAt: number;
}

export interface StockMovement {
  id: string;
  productId: string;
  qtyChange: number;
  reason: 'jual' | 'void' | 'pembelian_stok' | 'opname' | 'koreksi';
  transactionId?: string;
  shiftId?: string;
  actorUserId: string;
  createdAt: number;
}

export type UserRole = 'owner' | 'admin' | 'kasir';

export interface User {
  id: string;
  name: string;
  role: UserRole;
  pinHash: string; // SHA-256 hash saja, bukan PIN mentah
  isActive: boolean;
  createdAt: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  balanceHutang: number; // int Rupiah, >= 0
  isActive?: boolean;
  createdAt: number;
}

export type NewCustomer = Omit<Customer, 'id' | 'balanceHutang' | 'createdAt'>;

export interface AuditLog {
  id: string;
  actorUserId: string;
  action:
    | 'koreksi_saldo'
    | 'ubah_modal'
    | 'ubah_harga_jual'
    | 'void_transaksi'
    | 'handover'
    | 'opname'
    | 'ubah_tarif'
    | 'login'
    | 'setup_owner'
    | string;
  entityType: 'account' | 'product' | 'transaction' | 'shift' | 'fee_rule' | 'user' | string;
  entityId: string;
  detail: string; // JSON ringkas
  createdAt: number;
}

export interface Brand {
  id: string; // uuid, PK
  name: string; // nama brand/operator
  createdAt: number; // epoch ms
}

export interface AppSettings {
  id: number; // selalu 1
  theme: 'light' | 'dark' | 'system';
  shiftTolerance: number;
  biometricEnabled: boolean;
  defaultCashAccountId?: string;
  hidePlayProtectNotice?: boolean;
}
