export const REQUEST_ERROR_EVENT = "haichuan:request-error";

export function notifyRequestError(message: string) {
  window.dispatchEvent(
    new CustomEvent(REQUEST_ERROR_EVENT, { detail: { message } }),
  );
}
