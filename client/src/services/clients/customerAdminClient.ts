import api from "../httpClient";

export type CustomerAdminListQuery = {
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
};

// 后台客户档案只读运营视图；员工令牌继续由共享请求拦截器注入。
export const customerAdminApi = {
  list: (params: CustomerAdminListQuery) =>
    api.get("/customers/admin", { params }),
  detail: (id: number) => api.get(`/customers/admin/${id}`),
};
