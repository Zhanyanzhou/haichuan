export interface Inquiry {
  id: number;
  productId?: number;
  productName?: string;
  customerName: string;
  customerPhone: string;
  content: string;
  status: "PENDING" | "REPLIED" | "CLOSED";
  assignedTo?: number;
  reply?: string;
  createdAt: string;
}
