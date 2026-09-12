import { create } from 'zustand';

export type CustomerAccount = {
  id: number;
  phone: string;
  name: string | null;
  email: string | null;
  avatarUrl?: string | null;
};

interface CustomerAuthState {
  customer: CustomerAccount | null;
  status: 'unknown' | 'authenticated' | 'anonymous';
  isLoggedIn: boolean;
  setAuth: (customer: CustomerAccount) => void;
  markAnonymous: () => void;
  updateCustomer: (customer: Partial<CustomerAccount>) => void;
}

export const useCustomerAuthStore = create<CustomerAuthState>()((set) => ({
  customer: null,
  status: 'unknown',
  isLoggedIn: false,
  setAuth: (customer) => set({ customer, status: 'authenticated', isLoggedIn: true }),
  markAnonymous: () => set({ customer: null, status: 'anonymous', isLoggedIn: false }),
  updateCustomer: (customer) =>
    set((state) => ({
      customer: state.customer ? { ...state.customer, ...customer } : null,
    })),
}));
