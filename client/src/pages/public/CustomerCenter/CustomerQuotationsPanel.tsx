import { useCallback, useEffect, useMemo, useState } from "react";
import { App as AntdApp, Button, Modal, Select, Spin } from "antd";
import type {
  CooperationDesignFileVersionSummary,
  Quotation,
  QuotationVersion,
  WaxType,
} from "@/types";
import {
  customerQuotationApi,
  parseCustomerDesignFilesResponse,
  type ConfirmQuotationOrderResult,
  type CustomerCooperationDesignFileResource,
  type CustomerQuotationPage,
} from "@/services/api";
import {
  requestErrorCode,
  requestStatus,
} from "@/services/httpClient";
import { unwrapResponse } from "@/utils/unwrap";
import { useQuotationOrderingEnabled } from "@/store/featureFlags";
import type { CustomerAddress } from "./types";

type CustomerQuotationsPanelProps = {
  addresses: CustomerAddress[];
  onOrderCreated?: () => void;
};

const CHANNEL_LABEL = {
  RETAIL: "标准零售",
  CUSTOM: "高级定制",
  PARTNER_WAX: "合作蜡模",
} as const;

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  PENDING_CONFIRM: "待您确认",
  CONFIRMED: "历史已确认",
  CONVERTED: "已创建订单",
  EXPIRED: "已过期",
  CANCELLED: "已取消",
  ISSUED: "待您确认",
  ACCEPTED: "已接受",
  SUPERSEDED: "已被新版本替代",
};

const WAX_LABEL: Record<WaxType, string> = {
  RED: "红蜡",
  PURPLE: "紫蜡",
};

const FILE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "草稿",
  SUBMITTED: "待您确认",
  CONFIRMED: "您已确认",
  SUPERSEDED: "已被新版本替代",
  REJECTED: "已退回",
};

function pricingSourceLabel(value: string | null | undefined) {
  return ({
    SKU_FIXED_PRICE: "SKU 固定零售价",
    CUSTOM_QUOTE: "当前定制报价版本",
    CUSTOMER_AGREEMENT: "客户有效专属克价",
    CUSTOMER_AGREEMENT_RATE: "客户有效专属克价",
    SYSTEM_DEFAULT_D19_V1: "D.19 系统默认克价",
    DEFAULT_RATE: "D.19 系统默认克价",
  } as Record<string, string>)[value ?? ""] ?? value ?? null;
}

function formatCurrency(value: number | string | null | undefined) {
  const amount = Number(value ?? 0);
  return Number.isFinite(amount)
    ? `¥${amount.toLocaleString("zh-CN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`
    : "—";
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleDateString("zh-CN");
}

function currentVersionOf(quotation: Quotation | null): QuotationVersion | null {
  if (!quotation) return null;
  if (quotation.currentVersionRecord) return quotation.currentVersionRecord;
  return (
    quotation.versions?.find(
      (version) => version.version === quotation.currentVersion,
    ) ?? quotation.versions?.[0] ?? null
  );
}

function normalizeQuotationPage(value: unknown): CustomerQuotationPage {
  if (Array.isArray(value)) {
    return {
      list: value as Quotation[],
      total: value.length,
      page: 1,
      pageSize: value.length || 20,
    };
  }
  const page = value as Partial<CustomerQuotationPage> | null;
  return {
    list: Array.isArray(page?.list) ? page.list : [],
    total: typeof page?.total === "number" ? page.total : 0,
    page: typeof page?.page === "number" ? page.page : 1,
    pageSize: typeof page?.pageSize === "number" ? page.pageSize : 20,
  };
}

function quotationErrorMessage(error: unknown, fallback: string) {
  const code = requestErrorCode(error);
  const status = requestStatus(error);
  const messages: Record<string, string> = {
    CUSTOMER_QUOTATION_ORDERING_DISABLED:
      "报价确认暂未开放。您仍可查看报价，顾问会在开放后通知您。",
    PARTNER_NOT_APPROVED:
      "当前合作资格不能确认这份报价，请联系顾问核对资格状态。",
    QUOTE_VERSION_STALE:
      "报价已有新版本，请重新加载并核对后再确认。",
    QUOTE_EXPIRED: "报价已过有效期，请联系顾问重新报价。",
    DESIGN_VERSION_CHANGED:
      "3D 文件版本已经变化，请重新核对并确认最新版本。",
    RATE_AGREEMENT_CHANGED:
      "合作价格条件已经变化，请等待顾问重新发出报价。",
    RESOURCE_INSUFFICIENT:
      "当前生产资源暂不足，订单尚未创建。请联系顾问确认后续安排。",
    NON_RETAIL_FULFILLMENT_MODEL_REQUIRED:
      "定制或合作订单的生产交付流程尚未开放，当前不会确认全额收款。请联系顾问确认安排。",
    QUOTE_SNAPSHOT_MISMATCH:
      "报价内容校验未通过，订单尚未创建。请联系顾问重新发出报价。",
    IDEMPOTENCY_KEY_REUSED:
      "本次确认请求与原请求不一致，请重新加载报价后再试。",
  };
  if (code && messages[code]) return messages[code];
  if (status === 409) return "报价状态已经变化，请重新加载后再试。";
  if (status === 403) return "当前账户不能确认这份报价，请联系顾问。";
  return fallback;
}

function idempotencyStorageKey(quotationId: number, version: number) {
  return `haichuan.quotation-confirm.${quotationId}.${version}`;
}

function getOrCreateIdempotencyKey(quotationId: number, version: number) {
  const storageKey = idempotencyStorageKey(quotationId, version);
  if (typeof window !== "undefined") {
    const existing = window.sessionStorage.getItem(storageKey);
    if (existing) return existing;
  }
  const idempotencyKey = crypto.randomUUID();
  if (typeof window !== "undefined") {
    window.sessionStorage.setItem(storageKey, idempotencyKey);
  }
  return idempotencyKey;
}

function clearIdempotencyKey(quotationId: number, version: number) {
  if (typeof window !== "undefined") {
    window.sessionStorage.removeItem(
      idempotencyStorageKey(quotationId, version),
    );
  }
}

function DesignFileSummary({
  file,
  confirming,
  onConfirm,
  waxType,
  confirmedWaxWeight,
  enabled,
  onDownload,
}: {
  file: CooperationDesignFileVersionSummary;
  confirming: boolean;
  onConfirm: () => void;
  waxType?: WaxType | null;
  confirmedWaxWeight?: number | string | null;
  enabled: boolean;
  onDownload: () => void;
}) {
  return (
    <section className="my-account__quote-subsection" aria-labelledby="quote-file-heading">
      <div className="my-account__quote-subsection-head">
        <h4 id="quote-file-heading">3D 文件确认</h4>
        <span>{FILE_STATUS_LABEL[file.status] ?? file.status}</span>
      </div>
      <dl className="my-account__quote-facts">
        <div>
          <dt>文件版本</dt>
          <dd>V{file.version}</dd>
        </div>
        {file.originalName || file.fileName ? (
          <div>
            <dt>文件名称</dt>
            <dd>{file.originalName || file.fileName}</dd>
          </div>
        ) : null}
        {waxType ? (
          <div>
            <dt>蜡种</dt>
            <dd>{WAX_LABEL[waxType]}</dd>
          </div>
        ) : null}
        {confirmedWaxWeight != null ? (
          <div>
            <dt>确认蜡重</dt>
            <dd>{Number(confirmedWaxWeight).toFixed(3)} 克</dd>
          </div>
        ) : null}
        {file.checksumSha256 ? (
          <div>
            <dt>校验摘要</dt>
            <dd>{file.checksumSha256.slice(0, 16)}…</dd>
          </div>
        ) : null}
      </dl>
      <Button className="my-account__quote-secondary-action" onClick={onDownload}>
        下载并核对文件
      </Button>
      {file.status === "SUBMITTED" ? (
        <>
          <Button
            className="my-account__quote-secondary-action"
            loading={confirming}
            disabled={!enabled}
            onClick={onConfirm}
          >
            明确确认此文件版本
          </Button>
          {!enabled ? (
            <p className="my-account__quote-gate">文件确认暂未开放，您仍可核对当前版本。</p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

export default function CustomerQuotationsPanel({
  addresses,
  onOrderCreated,
}: CustomerQuotationsPanelProps) {
  const { message, modal } = AntdApp.useApp();
  const orderingEnabled = useQuotationOrderingEnabled();
  const [quotations, setQuotations] = useState<Quotation[]>([]);
  const [designFiles, setDesignFiles] = useState<CustomerCooperationDesignFileResource[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [designFileError, setDesignFileError] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Quotation | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<number>();
  const [confirmingOrder, setConfirmingOrder] = useState(false);
  const [confirmingFile, setConfirmingFile] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await customerQuotationApi.list({ pageSize: 20 });
      const page = normalizeQuotationPage(unwrapResponse<unknown>(response));
      setQuotations(page.list);
      setLoadError(null);
      try {
        const designFilesResponse = await customerQuotationApi.listDesignFiles();
        setDesignFiles(parseCustomerDesignFilesResponse(designFilesResponse));
        setDesignFileError(null);
      } catch (error) {
        setDesignFiles([]);
        setDesignFileError(
          quotationErrorMessage(
            error,
            "3D 文件记录暂时无法加载，请重新加载后再确认报价。",
          ),
        );
      }
    } catch (error) {
      setLoadError(
        quotationErrorMessage(
          error,
          "报价记录暂时无法加载，请稍后重试。",
        ),
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openDetail = async (id: number) => {
    setDetailId(id);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    try {
      const response = await customerQuotationApi.detail(id);
      setDetail(unwrapResponse<Quotation>(response));
    } catch (error) {
      setDetailError(
        quotationErrorMessage(
          error,
          "报价详情暂时无法加载，请稍后重试。",
        ),
      );
    } finally {
      setDetailLoading(false);
    }
  };

  const version = useMemo(() => currentVersionOf(detail), [detail]);
  const isLegacySnapshot = Boolean(
    version && (version.snapshotSchemaVersion ?? 1) < 2,
  );
  const selectedAddress = addresses.find(
    (address) => address.id === selectedAddressId,
  );
  const canConfirm = Boolean(
      detail &&
      version &&
      !isLegacySnapshot &&
      detail.status === "PENDING_CONFIRM" &&
      version.status === "ISSUED" &&
      selectedAddress,
  );

  const downloadDesignFile = async (
    fileId: number,
    fileVersion: number,
    fileName?: string | null,
  ) => {
    try {
      const response = await customerQuotationApi.downloadDesignFile(fileId, fileVersion);
      const payload = unwrapResponse<Blob>(response);
      if (!(payload instanceof Blob)) throw new Error("文件响应无效");
      const url = URL.createObjectURL(payload);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = fileName || `design-v${fileVersion}`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      message.error(
        quotationErrorMessage(error, "3D 文件当前无法读取，请联系顾问重新提交。"),
      );
    }
  };

  const confirmDesignFile = () => {
    const file = version?.designFileVersion;
    const fileId = file?.fileId ?? file?.designFileId;
    if (!file || !fileId) {
      message.error("当前报价缺少可确认的文件档案，请联系顾问重新发出报价。");
      return;
    }
    modal.confirm({
      title: `确认 3D 文件 V${file.version}？`,
      content:
        "确认后，当前文件版本和页面显示的蜡重将用于这份合作报价。文件如需调整，必须由顾问重新提交新版本。",
      okText: "确认此文件版本",
      cancelText: "返回核对",
      onOk: async () => {
        setConfirmingFile(true);
        try {
          await customerQuotationApi.confirmDesignFileVersion(
            fileId,
            file.version,
          );
          message.success("3D 文件版本已确认");
          if (detailId !== null) await openDetail(detailId);
        } catch (error) {
          message.error(
            quotationErrorMessage(
              error,
              "3D 文件确认未完成，请重新加载后再试。",
            ),
          );
        } finally {
          setConfirmingFile(false);
        }
      },
    });
  };

  const confirmPendingDesignFile = (fileId: number, version: number) => {
    modal.confirm({
      title: `确认 3D 文件 V${version}？`,
      content:
        "确认后，顾问可以据此文件版本和页面显示的蜡重发出合作报价。文件如需调整，必须重新提交新版本。",
      okText: "确认此文件版本",
      cancelText: "返回核对",
      onOk: async () => {
        setConfirmingFile(true);
        try {
          await customerQuotationApi.confirmDesignFileVersion(fileId, version);
          message.success("3D 文件版本已确认");
          await load();
        } catch (error) {
          message.error(
            quotationErrorMessage(
              error,
              "3D 文件确认未完成，请重新加载后再试。",
            ),
          );
        } finally {
          setConfirmingFile(false);
        }
      },
    });
  };

  const confirmAndCreateOrder = () => {
    if (!detail || !version || !selectedAddress) return;
    if ((version.snapshotSchemaVersion ?? 1) < 2) {
      message.warning("旧版报价仅供查看，请联系顾问复制或修订后重发 v2。");
      return;
    }
    const fullAddress = [
      selectedAddress.recipientName,
      selectedAddress.recipientPhone,
      selectedAddress.province,
      selectedAddress.city,
      selectedAddress.district,
      selectedAddress.detail,
    ]
      .filter(Boolean)
      .join(" ");
    modal.confirm({
      title: `确认报价 V${version.version} 并创建订单？`,
      content: (
        <div className="my-account__quote-confirm-copy">
          <p>
            应付总额为 {formatCurrency(version.totalAmount)}。确认后将以当前报价版本创建待付款订单，员工不能代您完成此操作。
          </p>
          <p>收货信息：{fullAddress}</p>
          <p>在线支付暂未开放；订单创建后不会自动扣款或发起支付。</p>
        </div>
      ),
      okText: "确认报价并创建订单",
      cancelText: "返回核对",
      onOk: async () => {
        const idempotencyKey = getOrCreateIdempotencyKey(
          detail.id,
          version.version,
        );
        setConfirmingOrder(true);
        try {
          const response = await customerQuotationApi.confirmAndOrder(
            detail.id,
            {
              quotationVersion: version.version,
              addressId: selectedAddress.id,
            },
            idempotencyKey,
          );
          const result = unwrapResponse<ConfirmQuotationOrderResult>(response);
          clearIdempotencyKey(detail.id, version.version);
          message.success(
            result?.order?.orderNo
              ? `订单 ${result.order.orderNo} 已创建`
              : "订单已创建",
          );
          await load();
          setDetailId(null);
          setDetail(null);
          onOrderCreated?.();
        } catch (error) {
          if (requestErrorCode(error) === "IDEMPOTENCY_KEY_REUSED") {
            clearIdempotencyKey(detail.id, version.version);
          }
          message.error(
            quotationErrorMessage(
              error,
              "报价确认未完成，订单尚未创建。请稍后重试。",
            ),
          );
        } finally {
          setConfirmingOrder(false);
        }
      },
    });
  };

  return (
    <section
      id="my-quotations"
      className="my-account__panel my-account__panel--wide my-account__quotations"
    >
      <div className="my-account__panel-head">
        <div>
          <p>PRIVATE QUOTATIONS</p>
          <h2>我的报价</h2>
        </div>
        {loadError ? (
          <button
            type="button"
            className="my-account__inline-retry"
            onClick={() => void load()}
          >
            重新加载
          </button>
        ) : null}
      </div>

      {designFileError ? (
        <p className="my-account__quote-state" role="alert">
          {designFileError}{" "}
          <button type="button" className="my-account__inline-retry" onClick={() => void load()}>
            重新加载文件
          </button>
        </p>
      ) : null}

      {designFiles.some((file) =>
        file.versions?.some((version) => version.status === "SUBMITTED"),
      ) ? (
        <section className="my-account__pending-files" aria-labelledby="pending-files-heading">
          <h3 id="pending-files-heading">待确认的 3D 文件</h3>
          {designFiles.flatMap((file) =>
            (file.versions ?? [])
              .filter((version) => version.status === "SUBMITTED")
              .map((version) => (
                <article key={version.id}>
                  <div>
                    <strong>{file.referenceNo} · V{version.version}</strong>
                    <small>
                      {[
                        version.redWaxWeight != null
                          ? `红蜡 ${Number(version.redWaxWeight).toFixed(3)} 克`
                          : null,
                        version.purpleWaxWeight != null
                          ? `紫蜡 ${Number(version.purpleWaxWeight).toFixed(3)} 克`
                          : null,
                      ].filter(Boolean).join("；") || "尚未记录可确认蜡重"}
                    </small>
                  </div>
                  <Button
                    onClick={() => void downloadDesignFile(
                      file.id,
                      version.version,
                      version.fileName,
                    )}
                  >
                    下载并核对文件
                  </Button>
                  <Button
                    disabled={!orderingEnabled}
                    loading={confirmingFile}
                    onClick={() => confirmPendingDesignFile(file.id, version.version)}
                  >
                    明确确认此文件版本
                  </Button>
                </article>
              )),
          )}
          {!orderingEnabled ? (
            <p className="my-account__quote-gate">文件确认暂未开放，您仍可核对版本与蜡重。</p>
          ) : null}
        </section>
      ) : null}

      {loading && quotations.length === 0 ? (
        <div className="my-account__quote-state" aria-live="polite">
          <Spin size="small" /> 正在加载报价…
        </div>
      ) : loadError ? (
        <p className="my-account__quote-state" role="alert">
          {loadError}
        </p>
      ) : quotations.length === 0 ? (
        <p className="my-account-empty">
          暂无报价记录。顾问发出报价后，您可以在这里核对版本与费用。
        </p>
      ) : (
        <div className="my-account__quote-list">
          {quotations.map((quotation) => {
            const currentVersion = currentVersionOf(quotation);
            return (
              <article key={quotation.id}>
                <div>
                  <small>
                    {quotation.quoteNo} · V{quotation.currentVersion ?? currentVersion?.version ?? 1}
                  </small>
                  <h3>
                    {CHANNEL_LABEL[quotation.channel ?? "CUSTOM"]}报价
                  </h3>
                  <p>
                    有效期至 {formatDate(currentVersion?.validUntil ?? quotation.validUntil)}
                  </p>
                </div>
                <div className="my-account__quote-list-meta">
                  <span>
                    {(currentVersion?.snapshotSchemaVersion ?? 1) < 2
                      ? "旧版只读"
                      : STATUS_LABEL[quotation.status] ?? quotation.status}
                  </span>
                  <strong>
                    {formatCurrency(currentVersion?.totalAmount ?? quotation.finalAmount)}
                  </strong>
                  <button type="button" onClick={() => void openDetail(quotation.id)}>
                    查看报价
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <Modal
        open={detailId !== null}
        title="报价详情"
        footer={null}
        width={720}
        destroyOnHidden
        onCancel={() => {
          if (confirmingOrder || confirmingFile) return;
          setDetailId(null);
          setDetail(null);
          setDetailError(null);
        }}
      >
        {detailLoading ? (
          <div className="my-account__quote-state" aria-live="polite">
            <Spin size="small" /> 正在加载报价详情…
          </div>
        ) : detailError ? (
          <div className="my-account__quote-state" role="alert">
            <p>{detailError}</p>
            <Button onClick={() => detailId !== null && void openDetail(detailId)}>
              重新加载
            </Button>
          </div>
        ) : detail && version ? (
          <div className="my-account__quote-detail">
            <header>
              <div>
                <small>{detail.quoteNo}</small>
                <h3>{CHANNEL_LABEL[detail.channel ?? "CUSTOM"]}报价</h3>
              </div>
              <span>
                {isLegacySnapshot
                  ? "旧版只读"
                  : STATUS_LABEL[detail.status] ?? detail.status}
              </span>
            </header>

            {isLegacySnapshot ? (
              <p className="my-account__quote-gate" role="alert">
                旧版报价仅供查看，请联系顾问复制或修订后重发 v2。
              </p>
            ) : null}

            <dl className="my-account__quote-facts">
              <div>
                <dt>报价版本</dt>
                <dd>V{version.version}</dd>
              </div>
              <div>
                <dt>有效期</dt>
                <dd>{formatDate(version.validUntil ?? detail.validUntil)}</dd>
              </div>
              <div>
                <dt>报价渠道</dt>
                <dd>{CHANNEL_LABEL[detail.channel ?? "CUSTOM"]}</dd>
              </div>
              {version.pricingSource?.label ? (
                <div>
                  <dt>价格来源</dt>
                  <dd>{version.pricingSource.label}</dd>
                </div>
              ) : null}
            </dl>

            <section className="my-account__quote-subsection">
              <h4>报价明细</h4>
              <div className="my-account__quote-lines">
                {(version.items ?? []).map((item) => (
                  <div key={item.id}>
                    <div>
                      <strong>{item.description || "报价项目"}</strong>
                      <small>
                        {item.waxType ? `${WAX_LABEL[item.waxType]} · ` : ""}
                        数量 {item.quantity}
                        {(item.confirmedWaxWeight ?? item.pricingSnapshot?.confirmedWaxWeight) != null
                          ? ` · 确认蜡重 ${Number(item.confirmedWaxWeight ?? item.pricingSnapshot?.confirmedWaxWeight).toFixed(3)} 克`
                          : ""}
                      </small>
                      {pricingSourceLabel(item.pricingSource ?? item.pricingSnapshot?.rateSourceLabel) ? (
                        <small>
                          克价来源：{pricingSourceLabel(item.pricingSource ?? item.pricingSnapshot?.rateSourceLabel)}
                          {(item.rate ?? item.pricingSnapshot?.rate) != null
                            ? ` · ${formatCurrency(item.rate ?? item.pricingSnapshot?.rate)}/克`
                            : ""}
                        </small>
                      ) : null}
                    </div>
                    <span>{formatCurrency(item.subtotal)}</span>
                  </div>
                ))}
              </div>
            </section>

            {version.feeLines?.length ? (
              <section className="my-account__quote-subsection">
                <h4>费用明细</h4>
                <div className="my-account__quote-lines">
                  {version.feeLines.map((fee, index) => (
                    <div key={fee.id ?? `${fee.code}-${index}`}>
                      <div>
                        <strong>{fee.displayText}</strong>
                        <small>
                          {fee.calculationMethod === "PER_GRAM"
                            ? `${formatCurrency(fee.rate)}/克 × ${Number(fee.basisQuantity ?? 0).toFixed(3)} 克`
                            : fee.calculationMethod === "FIXED"
                              ? "固定费用"
                              : "每单费用"}
                        </small>
                      </div>
                      <span>{formatCurrency(fee.amount)}</span>
                    </div>
                  ))}
                </div>
              </section>
            ) : null}

            {detail.channel === "PARTNER_WAX" && version.designFileVersion ? (
              <DesignFileSummary
                file={version.designFileVersion}
                confirming={confirmingFile}
                onConfirm={confirmDesignFile}
                waxType={version.items?.find((item) => item.waxType)?.waxType}
                confirmedWaxWeight={version.items?.find((item) => item.waxType)?.confirmedWaxWeight}
                enabled={orderingEnabled && !isLegacySnapshot}
                onDownload={() => void downloadDesignFile(
                  version.designFileVersion!.fileId
                    ?? version.designFileVersion!.designFileId!,
                  version.designFileVersion!.version,
                  version.designFileVersion!.originalName
                    ?? version.designFileVersion!.fileName,
                )}
              />
            ) : null}

            <section className="my-account__quote-total" aria-label="报价金额汇总">
              <span>费用合计 {formatCurrency(version.feeAmount)}</span>
              <strong>应付总额 {formatCurrency(version.totalAmount)}</strong>
            </section>

            {detail.status === "PENDING_CONFIRM" && !isLegacySnapshot ? (
              <section className="my-account__quote-confirmation">
                <label htmlFor="quotation-address">收货地址</label>
                <Select
                  id="quotation-address"
                  value={selectedAddressId}
                  onChange={setSelectedAddressId}
                  placeholder="选择已保存的收货地址"
                  className="w-full"
                  options={addresses.map((address) => ({
                    value: address.id,
                    label: `${address.recipientName} · ${[
                      address.province,
                      address.city,
                      address.district,
                      address.detail,
                    ]
                      .filter(Boolean)
                      .join("")}`,
                  }))}
                />
                {addresses.length === 0 ? (
                  <p>请先在“个人资料”中保存收货地址，再确认报价。</p>
                ) : null}
                {!orderingEnabled ? (
                  <p className="my-account__quote-gate">
                    报价确认暂未开放。您仍可核对全部报价内容。
                  </p>
                ) : null}
                <Button
                  type="primary"
                  className="my-account__quote-primary-action"
                  disabled={!orderingEnabled || !canConfirm}
                  loading={confirmingOrder}
                  onClick={confirmAndCreateOrder}
                >
                  确认报价并创建订单
                </Button>
                <p>
                  在线支付暂未开放；确认后只创建待付款订单，不会自动扣款或发起支付。
                </p>
              </section>
            ) : null}
          </div>
        ) : (
          <p className="my-account__quote-state">报价详情暂不可用。</p>
        )}
      </Modal>
    </section>
  );
}
