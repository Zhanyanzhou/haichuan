import type { NormalizedRequestError } from "./httpClient";
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

export function mockRequestError(
  message: string,
  status: number,
): NormalizedRequestError {
  const error = new Error(message) as NormalizedRequestError;
  error.status = status;
  return error;
}
