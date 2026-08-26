export interface User {
  id: number;
  username: string;
  realName?: string;
  phone?: string;
  email?: string;
  avatar?: string;
  role:
    | "SUPER_ADMIN"
    | "ADMIN"
    | "EDITOR"
    | "CUSTOMER_SERVICE"
    | "WAREHOUSE"
    | "SALES_CONSULTANT"
    | "FINANCE";
  status: "ACTIVE" | "DISABLED";
  lastLoginAt?: string;
  createdAt: string;
}

export interface LoginParams {
  username: string;
  password: string;
}

export interface LoginResult {
  accessToken: string;
  user: User;
}
