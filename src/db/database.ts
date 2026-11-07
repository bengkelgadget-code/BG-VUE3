import Dexie, { type Table } from 'dexie';
import type {
  Account,
  AccountLedger,
  Product,
  AdminFeeRule,
  Transaction,
  TransactionItem,
  Shift,
  ShiftHandover,
  StockMovement,
  User,
  Customer,
  ProductCatalogEntry,
  AuditLog,
  AppSettings,
} from './types';

export class BukuKonterDB extends Dexie {
  accounts!: Table<Account, string>;
  accountLedger!: Table<AccountLedger, string>;
  products!: Table<Product, string>;
  adminFeeRules!: Table<AdminFeeRule, string>;
  transactions!: Table<Transaction, string>;
  transactionItems!: Table<TransactionItem, string>;
  shifts!: Table<Shift, string>;
  shiftHandovers!: Table<ShiftHandover, string>;
  stockMovements!: Table<StockMovement, string>;
  users!: Table<User, string>;
  customers!: Table<Customer, string>;
  productCatalogCache!: Table<ProductCatalogEntry, string>;
  auditLogs!: Table<AuditLog, string>;
  appSettings!: Table<AppSettings, number>;

  constructor() {
    super('buku_konter');
    this.version(1).stores({
      accounts: 'id, type, isActive',
      accountLedger: 'id, accountId, transactionId, createdAt',
      products: 'id, category, isActive, externalProductRef',
      adminFeeRules: 'id, layanan, groupId, isActive',
      transactions: 'id, layanan, shiftId, userId, accountId, sourceAccountId, customerId, paymentStatus, status, date',
      transactionItems: 'id, transactionId, productId',
      shifts: 'id, userId, status, [userId+status], openedAt',
      shiftHandovers: 'id, shiftId, fromUserId, toUserId',
      stockMovements: 'id, productId, reason, transactionId, shiftId, createdAt',
      users: 'id, role, isActive',
      customers: 'id, phone',
      productCatalogCache: 'id, category, isActive',
      auditLogs: 'id, actorUserId, action, entityType, entityId, createdAt',
      appSettings: 'id',
    });
  }
}

export const db = new BukuKonterDB();
