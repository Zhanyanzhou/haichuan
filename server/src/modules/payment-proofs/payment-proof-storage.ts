import { lstat } from 'fs/promises';
import { isAbsolute, relative, resolve, sep } from 'path';
import { resolveMediaStorageRoots } from '../upload/media-storage-paths';

const PAYMENT_PROOF_KEY_PATTERN = /^(\d+)\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.(jpg|png|webp|gif)$/i;

export type ResolvedPaymentProof = {
  storageKey: string;
  absolutePath: string;
};

/** 付款凭证键必须属于当前客户，并且解析后仍位于私有凭证根目录内。 */
export function resolveCustomerPaymentProof(
  customerId: number,
  rawStorageKey: string | null | undefined,
  root = resolveMediaStorageRoots().paymentProofRoot,
): ResolvedPaymentProof | null {
  const storageKey = rawStorageKey?.trim();
  const match = storageKey?.match(PAYMENT_PROOF_KEY_PATTERN);
  if (!storageKey || !match || Number(match[1]) !== customerId) return null;

  const absolutePath = resolve(root, ...storageKey.split('/'));
  const relativePath = relative(root, absolutePath);
  if (
    relativePath === '' ||
    relativePath === '..' ||
    relativePath.startsWith(`..${sep}`) ||
    isAbsolute(relativePath)
  ) return null;
  return { storageKey, absolutePath };
}

export async function storedCustomerPaymentProofExists(
  customerId: number,
  storageKey: string,
  root?: string,
): Promise<boolean> {
  const resolved = resolveCustomerPaymentProof(customerId, storageKey, root);
  if (!resolved) return false;
  try {
    const fileStat = await lstat(resolved.absolutePath);
    return fileStat.isFile() && !fileStat.isSymbolicLink();
  } catch {
    return false;
  }
}
