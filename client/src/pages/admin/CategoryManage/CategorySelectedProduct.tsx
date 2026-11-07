import { useEffect, useState, type Ref } from "react";
import { Link } from "react-router-dom";
import { Button, Tag } from "antd";
import { ArrowLeftOutlined, FolderOpenOutlined } from "@ant-design/icons";
import { AdminErrorState, AdminLoadingState } from "@/components/common/AdminDataStates";
import { SecureImage } from "@/components/common/SecureImage";
import { productApi } from "@/services/api";
import type { Product } from "@/types";
import { formatPrice } from "@/utils/format";
import { getMaterialLabel } from "@/utils/material";
import { getPrimaryImage } from "@/utils/productImage";
import { productPlaceholder } from "@/utils/placeholder";
import { unwrapResponse } from "@/utils/unwrap";
import { salesModeLabels, statusMeta } from "../ProductManage/productManageModel";
import { getCategoryPath, type CatTreeNode } from "./categoryManageModel";

export default function CategorySelectedProduct({
  category, tree, productId, unclassified, titleRef, onBack,
}: Readonly<{
  category: CatTreeNode;
  tree: CatTreeNode[];
  productId: number;
  unclassified: boolean;
  titleRef: Ref<HTMLHeadingElement>;
  onBack: () => void;
}>) {
  const [result, setResult] = useState<{ product: Product } | { error: unknown }>();
  const [retry, setRetry] = useState(0);
  const categoryId = category.id;

  useEffect(() => {
    const controller = new AbortController();
    setResult(undefined);
    void productApi.getById(productId, controller.signal).then((response) => {
      if (controller.signal.aborted) return;
      const product = unwrapResponse<Product>(response);
      if (product?.id !== productId || product.categoryId !== categoryId || product.status === "ARCHIVED") {
        throw new Error("商品已不在当前分类");
      }
      setResult({ product });
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setResult({ error });
    });
    return () => controller.abort();
  }, [categoryId, productId, retry]);

  const product = result && "product" in result ? result.product : undefined;
  const path = getCategoryPath(tree, categoryId).map((node) => node.name).join(" / ") + (unclassified ? " / 未分类" : "");
  const status = product?.reviewStatus === "IN_REVIEW"
    ? { label: "审核中", color: "blue" }
    : product ? statusMeta[product.status] : undefined;
  const returnTo = encodeURIComponent(`/admin/categories?categoryId=${categoryId}&productId=${productId}${unclassified ? "&scope=unclassified" : ""}`);

  return (
    <section className="cat-products" id="category-products-preview" aria-labelledby="category-products-title">
      <header className="cat-products__header">
        <div className="cat-products__path"><FolderOpenOutlined aria-hidden="true" /><span>{path}</span></div>
        <div className="cat-products__title">
          <h2 id="category-products-title" ref={titleRef} tabIndex={-1}>{product?.name || "商品详情"}</h2>
          <div className="cat-row__actions">
            <Button icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={onBack}>返回分类商品</Button>
            {product ? <Link to={`/admin/products/${product.id}/edit?returnTo=${returnTo}`}>编辑商品</Link> : null}
          </div>
        </div>
      </header>
      {!result ? <AdminLoadingState subject="商品详情" compact /> : "error" in result ? (
        <AdminErrorState subject="商品详情" error={result.error} onRetry={() => setRetry((value) => value + 1)} />
      ) : product ? (
        <div className="cat-focused-product">
          <div className="cat-focused-product__media">
            <SecureImage
              src={getPrimaryImage(product)}
              fallback={productPlaceholder(product.id, product.name)}
              alt={product.name}
              tokenKind="staff"
              className="cat-focused-product__image"
            />
          </div>
          <div className="cat-focused-product__details">
            <dl>
              <div><dt>所属分类</dt><dd>{path}</dd></div>
              <div><dt>款号</dt><dd>{product.code}</dd></div>
              <div><dt>材质</dt><dd>{getMaterialLabel(product.materialType)}</dd></div>
              <div><dt>状态</dt><dd><Tag color={status?.color}>{status?.label ?? "未知状态"}</Tag></dd></div>
              {Number(product.goldWeight) > 0 ? <div><dt>金重</dt><dd>{product.goldWeight} g</dd></div> : null}
              {product.size ? <div><dt>尺寸</dt><dd>{product.size}</dd></div> : null}
              {product.salesMode ? <div><dt>销售方式</dt><dd>{salesModeLabels[product.salesMode]}</dd></div> : null}
              {Number(product.price) > 0 ? <div><dt>SKU 最低价</dt><dd>{formatPrice(product.price)}</dd></div> : null}
            </dl>
            {product.shortDescription ? <p>{product.shortDescription}</p> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
