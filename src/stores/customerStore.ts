import { defineStore } from 'pinia';
import { ref } from 'vue';
import type { Customer, NewCustomer } from '../db/types';
import { customerService } from '../services/customerService';

export const useCustomerStore = defineStore('customer', () => {
  const customers = ref<Customer[]>([]);
  const isLoading = ref(false);

  async function loadCustomers(query?: string) {
    isLoading.value = true;
    try {
      customers.value = await customerService.listCustomers({ query });
    } finally {
      isLoading.value = false;
    }
  }

  async function addCustomer(customer: NewCustomer, actorUserId: string) {
    const id = await customerService.addCustomer(customer, { actorUserId });
    await loadCustomers();
    return id;
  }

  async function updateCustomer(id: string, patch: Partial<NewCustomer>, actorUserId: string) {
    await customerService.updateCustomer(id, patch, { actorUserId });
    await loadCustomers();
  }

  async function deactivateCustomer(id: string, actorUserId: string) {
    await customerService.deactivateCustomer(id, { actorUserId });
    await loadCustomers();
  }

  return {
    customers,
    isLoading,
    loadCustomers,
    addCustomer,
    updateCustomer,
    deactivateCustomer,
  };
});
