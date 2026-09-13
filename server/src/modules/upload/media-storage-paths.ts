import { isAbsolute, relative, resolve, sep } from 'path';

export type MediaStorageRoots = {
  publicRoot: string;
  archiveRoot: string;
  paymentProofRoot: string;
  productMediaRoot: string;
  privateMediaRoot: string;
};

export function mediaRootsOverlap(left: string, right: string) {
  const isInsideOrSame = (parent: string, candidate: string) => {
    const pathFromParent = relative(parent, candidate);
    return pathFromParent === '' || (
      pathFromParent !== '..' &&
      !pathFromParent.startsWith(`..${sep}`) &&
      !isAbsolute(pathFromParent)
    );
  };
  return isInsideOrSame(left, right) || isInsideOrSame(right, left);
}

/**
 * 公开静态根与任何私有根必须完全分离。这里在模块初始化和 Service 构造时共同调用，
 * 使 Nginx/Nest 静态映射与写入路径消费同一组已验证绝对路径。
 */
export function resolveMediaStorageRoots(): MediaStorageRoots {
  const cwd = process.cwd();
  const roots: MediaStorageRoots = {
    publicRoot: resolve(process.env.PUBLIC_MEDIA_ROOT || resolve(cwd, 'uploads')),
    archiveRoot: resolve(process.env.PAGE_MEDIA_ARCHIVE_ROOT || resolve(cwd, 'private-media', 'page-assets-archive')),
    paymentProofRoot: resolve(process.env.PAYMENT_PROOF_MEDIA_ROOT || resolve(cwd, 'private-media', 'payment-proofs')),
    productMediaRoot: resolve(process.env.PRODUCT_MEDIA_ROOT || resolve(cwd, 'private-media', 'products')),
    privateMediaRoot: resolve(cwd, 'private-media'),
  };
  for (const [label, privateRoot] of [
    ['页面素材归档目录', roots.archiveRoot],
    ['客户付款凭证目录', roots.paymentProofRoot],
    ['商品私有媒体目录', roots.productMediaRoot],
    ['默认私有媒体目录', roots.privateMediaRoot],
  ] as const) {
    if (mediaRootsOverlap(roots.publicRoot, privateRoot)) {
      throw new Error(`PUBLIC_MEDIA_ROOT 不能与${label}重叠`);
    }
  }
  return roots;
}
