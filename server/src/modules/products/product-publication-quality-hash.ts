import { createHash } from "node:crypto";

export const PRODUCT_QUALITY_GATE_VERSION = "p0-product-quality-v3";

type PublicationQualityHashInput = {
  code: string;
  name: string;
  shortDescription: unknown;
  description: unknown;
  detailContent: unknown;
  materialType: unknown;
  goldWeight: unknown;
  weight: unknown;
  size: unknown;
  gemInfo: unknown;
  craftTechnique: unknown;
  salesMode: unknown;
  inventoryPolicy: unknown;
  fulfillmentType: unknown;
  dispatchTime: unknown;
  deliveryMethods: unknown;
  requiresInsuredShipping: unknown;
  requiresSignature: unknown;
  includesCertificate: unknown;
  packageType: unknown;
  customLeadTime: unknown;
  isHot: unknown;
  isNew: unknown;
  isRecommended: unknown;
  isLimited: unknown;
  isCustom: unknown;
  shippingTemplate: null | {
    id: number;
    feeMode: unknown;
    baseFee: unknown;
    remoteSurcharge: unknown;
    freeShippingThreshold: unknown;
    excludedRegions: unknown;
    insured: unknown;
    signatureRequired: unknown;
    isActive: unknown;
    updatedAt: Date;
  };
  primaryImage: null | { id: number };
  listingImage: null | { id: number };
  images: Array<{
    id: number;
    type: unknown;
    sortOrder: unknown;
    mediaAssetId: number | null;
    mediaAsset: null | {
      lifecycleRevision: number;
      authorization: null | {
        revision: number;
        publicUseEpoch: number;
      };
    };
  }>;
  skus: Array<{
    id: number;
    material: unknown;
    size: unknown;
    price: unknown;
    goldWeight: unknown;
    inventories: readonly unknown[];
  }>;
  certificates: Array<{
    id: number;
    certType: unknown;
    certNumber: unknown;
    expireDate: Date | null;
  }>;
};

export function computeProductPublicationQualityHash(
  product: PublicationQualityHashInput,
): string {
  const snapshot = {
    version: PRODUCT_QUALITY_GATE_VERSION,
    code: product.code,
    name: product.name,
    shortDescription: product.shortDescription,
    description: product.description,
    detailContent: product.detailContent,
    materialType: product.materialType,
    goldWeight: product.goldWeight == null ? null : String(product.goldWeight),
    weight: product.weight == null ? null : String(product.weight),
    size: product.size,
    gemInfo: product.gemInfo,
    craftTechnique: product.craftTechnique,
    salesMode: product.salesMode,
    inventoryPolicy: product.inventoryPolicy,
    fulfillmentType: product.fulfillmentType,
    dispatchTime: product.dispatchTime,
    deliveryMethods: product.deliveryMethods,
    requiresInsuredShipping: product.requiresInsuredShipping,
    requiresSignature: product.requiresSignature,
    includesCertificate: product.includesCertificate,
    packageType: product.packageType,
    customLeadTime: product.customLeadTime,
    isHot: product.isHot,
    isNew: product.isNew,
    isRecommended: product.isRecommended,
    isLimited: product.isLimited,
    isCustom: product.isCustom,
    shippingTemplate: product.shippingTemplate == null ? null : {
      id: product.shippingTemplate.id,
      feeMode: product.shippingTemplate.feeMode,
      baseFee: String(product.shippingTemplate.baseFee),
      remoteSurcharge: String(product.shippingTemplate.remoteSurcharge),
      freeShippingThreshold: product.shippingTemplate.freeShippingThreshold == null
        ? null
        : String(product.shippingTemplate.freeShippingThreshold),
      excludedRegions: product.shippingTemplate.excludedRegions,
      insured: product.shippingTemplate.insured,
      signatureRequired: product.shippingTemplate.signatureRequired,
      isActive: product.shippingTemplate.isActive,
      updatedAt: product.shippingTemplate.updatedAt.toISOString(),
    },
    primaryImageId: product.primaryImage?.id ?? null,
    listingImageId: product.listingImage?.id ?? null,
    imageIds: product.images
      .map((image) => ({
        id: image.id,
        type: image.type,
        sortOrder: image.sortOrder,
        mediaAssetId: image.mediaAssetId,
        lifecycleRevision: image.mediaAsset?.lifecycleRevision ?? null,
        authorizationRevision: image.mediaAsset?.authorization?.revision ?? null,
        publicUseEpoch: image.mediaAsset?.authorization?.publicUseEpoch ?? null,
      }))
      .sort((left, right) => left.id - right.id),
    skus: product.skus.map((sku) => ({
      id: sku.id,
      material: sku.material,
      size: sku.size,
      price: String(sku.price),
      goldWeight: sku.goldWeight == null ? null : String(sku.goldWeight),
      inventoryRecords: sku.inventories.length,
    })),
    certificates: product.certificates.map((certificate) => ({
      id: certificate.id,
      certType: certificate.certType,
      certNumber: certificate.certNumber,
      expireDate: certificate.expireDate?.toISOString() ?? null,
    })),
  };
  return createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
}
