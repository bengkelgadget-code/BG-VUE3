import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Product, NewProduct, AdminFeeRule } from '../db/types';
import { productService } from '../services/productService';
import { feeRuleService } from '../services/feeRuleService';

export const useMasterStore = defineStore('master', () => {
  const products = ref<Product[]>([]);
  const feeRules = ref<AdminFeeRule[]>([]);
  const isLoading = ref(false);

  async function loadProducts(params?: { category?: string; query?: string }) {
    isLoading.value = true;
    try {
      products.value = await productService.listProducts(params);
    } finally {
      isLoading.value = false;
    }
  }

  async function addProduct(product: NewProduct, actorUserId: string) {
    const id = await productService.addProduct(product, { actorUserId });
    await loadProducts();
    return id;
  }

  async function updateProduct(id: string, patch: Partial<NewProduct>, actorUserId: string) {
    await productService.updateProduct(id, patch, { actorUserId });
    await loadProducts();
  }

  async function deactivateProduct(id: string, actorUserId: string) {
    await productService.deactivateProduct(id, { actorUserId });
    await loadProducts();
  }

  async function loadFeeRules(layanan?: string) {
    isLoading.value = true;
    try {
      feeRules.value = await feeRuleService.listRules({ layanan });
    } finally {
      isLoading.value = false;
    }
  }

  async function addFeeRuleMulti(params: {
    layananList: string[];
    minNom: number;
    maxNom: number | null;
    feeType: 'tetap' | 'persentase';
    valMargin: number | null;
    persentaseVal: number | null;
  }) {
    const groupId = await feeRuleService.addMultiServiceRule(params);
    await loadFeeRules();
    return groupId;
  }

  async function deactivateFeeGroup(groupId: string) {
    await feeRuleService.deactivateGroup(groupId);
    await loadFeeRules();
  }

  return {
    products,
    feeRules,
    isLoading,
    loadProducts,
    addProduct,
    updateProduct,
    deactivateProduct,
    loadFeeRules,
    addFeeRuleMulti,
    deactivateFeeGroup,
  };
});
