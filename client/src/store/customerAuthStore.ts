import { create } from 'zustand';
import {
  customerSelectionOwner,
  useSelectionStore,
} from './selectionStore';
import { advanceSessionEpoch } from '@/services/sessionEpoch';
import { clearConsultationDrafts } from '@/utils/consultationJourneyState';

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

export const useCustomerAuthStore = create<CustomerAuthState>()((set, get) => ({
  customer: null,
  status: 'unknown',
  isLoggedIn: false,
  setAuth: (customer) => {
    const current = get();
    if (
      current.status !== 'authenticated'
      || current.customer?.id !== customer.id
    ) {
      clearConsultationDrafts();
    }
    advanceSessionEpoch('customer');
    useSelectionStore.getState().activateOwner(customerSelectionOwner(customer.id));
    set({ customer, status: 'authenticated', isLoggedIn: true });
  },
  markAnonymous: () => {
    const current = get();
    if (current.status === 'authenticated' || current.customer !== null) {
      clearConsultationDrafts();
    }
    advanceSessionEpoch('customer');
    useSelectionStore.getState().activateOwner('guest');
    set({ customer: null, status: 'anonymous', isLoggedIn: false });
  },
  updateCustomer: (customer) =>
    set((state) => ({
      customer: state.customer ? { ...state.customer, ...customer } : null,
    })),
}));
