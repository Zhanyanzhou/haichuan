import api, { customerAuthHeaders } from '../httpClient';

export type CurrentVerification =
  | { currentPassword: string; currentSmsCode?: never }
  | { currentSmsCode: string; currentPassword?: never };

export type ContactChangeType = 'PHONE' | 'EMAIL';

export type ContactChangeChallenge = {
  changeId: string;
  expiresAt: string;
  maskedTarget: string;
  message: string;
};

export const customerProfileApi = {
  updateName: (name: string) =>
    api.put('/customers/me', { name }, { headers: customerAuthHeaders() }),

  requestCurrentPhoneCode: () =>
    api.post('/customers/me/security/sms-code', {}, { headers: customerAuthHeaders() }),

  changePassword: (verification: CurrentVerification, newPassword: string) =>
    api.put(
      '/customers/me/password',
      { ...verification, newPassword },
      { headers: customerAuthHeaders() },
    ),

  startContactChange: (
    type: ContactChangeType,
    newValue: string,
    verification: CurrentVerification,
  ) => api.post(
    '/customers/me/contact-changes',
    { type, newValue, ...verification },
    { headers: customerAuthHeaders() },
  ),

  confirmContactChange: (changeId: string, verificationCode: string) =>
    api.put(
      `/customers/me/contact-changes/${encodeURIComponent(changeId)}`,
      { verificationCode },
      { headers: customerAuthHeaders() },
    ),

  uploadAvatar: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.put('/customers/me/avatar', formData, {
      // 让浏览器/Axios 为 FormData 自动生成带 boundary 的 Content-Type。
      headers: customerAuthHeaders(),
    });
  },

  deleteAvatar: () =>
    api.delete('/customers/me/avatar', { headers: customerAuthHeaders() }),
};
