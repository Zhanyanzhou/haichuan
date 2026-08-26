import type { ApiResponse } from "@/types";

export function mockResponse<T>(data: T): { data: ApiResponse<T> } {
  return {
    data: {
      code: 200,
      data,
      message: "success",
      timestamp: new Date().toISOString(),
    },
  };
}
