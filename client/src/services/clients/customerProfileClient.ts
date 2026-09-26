import api, { customerAuthHeaders } from '../httpClient';

export type CurrentVerification =
  | { currentPassword: string; currentSmsCode?: never }
  | { currentSmsCode: string; currentPassword?: never };

export type AccountClosureVerification =
  | { password: string; currentSmsCode?: never }
  | { currentSmsCode: string; password?: never };

export type ContactChangeType = 'PHONE' | 'EMAIL';

export type ContactChangeChallenge = {
  changeId: string;
  expiresAt: string;
  maskedTarget: string;
  message: string;
};

export type AvatarUploadStatus = 'CURRENT' | 'NOT_CURRENT';

export const customerProfileApi = {
  updateName: (name: string) =>
    api.put('/customers/me', { name }, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),

  requestCurrentPhoneCode: () =>
    api.post('/customers/me/security/sms-code', {}, { headers: customerAuthHeaders() }),

  requestAccountClosureCode: () =>
    api.post('/customers/me/close/sms-code', {}, { headers: customerAuthHeaders() }),

  closeAccount: (verification: AccountClosureVerification) =>
    api.post('/customers/me/close', verification, {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),

  changePassword: (verification: CurrentVerification, newPassword: string) =>
    api.put(
      '/customers/me/password',
      { ...verification, newPassword },
      { headers: customerAuthHeaders(), suppressGlobalError: true },
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
      { headers: customerAuthHeaders(), suppressGlobalError: true },
    ),

  uploadAvatar: (file: File, idempotencyKey: string) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.put('/customers/me/avatar', formData, {
      // 让浏览器/Axios 为 FormData 自动生成带 boundary 的 Content-Type。
      headers: {
        ...customerAuthHeaders(),
        'Idempotency-Key': idempotencyKey,
      },
      suppressGlobalError: true,
    });
  },

  getAvatarUploadStatus: (idempotencyKey: string) =>
    api.get<{ status: AvatarUploadStatus }>('/customers/me/avatar/status', {
      headers: {
        ...customerAuthHeaders(),
        'Idempotency-Key': idempotencyKey,
      },
      suppressGlobalError: true,
    }),

  deleteAvatar: () =>
    api.delete('/customers/me/avatar', {
      headers: customerAuthHeaders(),
      suppressGlobalError: true,
    }),
};
