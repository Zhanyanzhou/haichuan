import { useState, useEffect } from 'react';
import { Spin, message } from 'antd';
import { customerApi } from '@/services/api';
import { unwrapResponse } from '@/utils/unwrap';
import AccountExperience from './AccountExperience';
import MyAccountDashboard from './MyAccountDashboard';

type CustomerOrder = {
  id: number;
  orderNo: string;
  finalAmount: number | string;
  status: string;
  createdAt: string;
  items?: Array<{ productId: number; product?: { name: string } }>;
  payments?: Array<{ id: number; status: string; proofUrl?: string | null }>;
};

export default function CustomerCenter() {
  const [orders, setOrders] = useState<CustomerOrder[]>([]);
  const [selectionInquiries, setSelectionInquiries] = useState<any[]>([]);
  const [inquiries, setInquiries] = useState<any[]>([]);
  const [addresses, setAddresses] = useState<any[]>([]);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [accessing, setAccessing] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  const load = async () => {
    if (!localStorage.getItem('customerToken')) {
      setLoading(false);
      return;
    }
    try {
      const [ordersRes, addressesRes, profileRes, selectionsRes, inquiriesRes] = await Promise.all([
        customerApi.getOrders(),
        customerApi.getAddresses(),
        customerApi.getProfile(),
        customerApi.getSelectionInquiries(),
        customerApi.getInquiries(),
      ]);
      setOrders(unwrapResponse<CustomerOrder[]>(ordersRes) || []);
      setAddresses(unwrapResponse<any[]>(addressesRes) || []);
      setProfile(unwrapResponse<any>(profileRes));
      setSelectionInquiries(unwrapResponse<any[]>(selectionsRes) || []);
      setInquiries(unwrapResponse<any[]>(inquiriesRes) || []);
    } catch {
      localStorage.removeItem('customerToken');
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const accessByOrder = async (values: { phone: string; orderNo: string }) => {
    setAccessing(true);
    try {
      const result = unwrapResponse<{ accessToken: string; customer: unknown }>(await customerApi.accessByOrder(values));
      if (!result?.accessToken) throw new Error('订单访问验证失败');
      localStorage.setItem('customerToken', result.accessToken);
      localStorage.setItem('customer', JSON.stringify(result.customer));
      setLoading(true);
      await load();
    } catch (error: any) {
      message.error(error?.message || '订单访问验证失败');
    } finally {
      setAccessing(false);
    }
  };

  const signOut = () => {
    localStorage.removeItem('customerToken');
    localStorage.removeItem('customer');
    setOrders([]);
    setSelectionInquiries([]);
    setInquiries([]);
    setAddresses([]);
    setProfile(null);
  };

  const completeAuth = async (request: Promise<unknown>) => {
    setAuthLoading(true);
    try {
      const result = unwrapResponse<{ accessToken: string; customer: unknown }>(await request);
      if (!result?.accessToken) throw new Error('账户认证失败');
      localStorage.setItem('customerToken', result.accessToken);
      localStorage.setItem('customer', JSON.stringify(result.customer));
      setLoading(true);
      await load();
      message.success('已登录您的会员账户');
    } catch (error: any) {
      message.error(error?.message || '账户认证失败，请稍后重试');
    } finally {
      setAuthLoading(false);
    }
  };

  if (loading) return <div className="min-h-screen bg-brand-bg flex items-center justify-center"><Spin size="large" /></div>;

  const isSignedIn = Boolean(localStorage.getItem('customerToken'));

  if (isSignedIn) {
    return (
      <MyAccountDashboard
      profile={profile}
      orders={orders}
      addresses={addresses}
      selectionInquiries={selectionInquiries}
      inquiries={inquiries}
      onSignOut={signOut}
      />
    );
  }

  return (
    <AccountExperience
      isSignedIn={false}
      profile={profile}
      orders={orders}
      addresses={addresses}
      selectionInquiries={selectionInquiries}
      inquiries={inquiries}
      accessing={accessing}
      authLoading={authLoading}
      onOrderAccess={accessByOrder}
      onLogin={(values) => completeAuth(customerApi.login(values))}
      onRegister={(values) => completeAuth(customerApi.register(values))}
      onSignOut={signOut}
    />
  );
}
