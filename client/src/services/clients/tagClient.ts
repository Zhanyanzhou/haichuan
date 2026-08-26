import api from "../httpClient";

export interface TagCreateInput {
  name: string;
  group?: string;
  sortOrder?: number;
}

export interface TagUpdateInput {
  name?: string;
  group?: string;
  sortOrder?: number;
  isActive?: boolean;
}

export const tagApi = {
  list: () => api.get("/tags"),
  create: (data: TagCreateInput) => api.post("/tags", data),
  update: (id: number, data: TagUpdateInput) =>
    api.put(`/tags/${id}`, data),
};
