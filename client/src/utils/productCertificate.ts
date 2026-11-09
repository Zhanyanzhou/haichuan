import type { Certificate } from "@/types";

export const CERTIFICATE_NUMBER_CONTENT = /[\p{L}\p{N}]/u;

export function isPublishableCertificate(certificate: Pick<Certificate, "certNumber" | "expireDate">): boolean {
  return typeof certificate.certNumber === "string"
    && CERTIFICATE_NUMBER_CONTENT.test(certificate.certNumber)
    && (!certificate.expireDate || Date.parse(certificate.expireDate) >= Date.now());
}
