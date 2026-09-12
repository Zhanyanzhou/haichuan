import { useCallback, useRef, useState, type CSSProperties } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp } from "antd";
import { useSelectionStore } from "@/store/selectionStore";
import type { CatalogProduct } from "@/data/catalogData";
import { getListingImage } from "@/utils/productImage";
import { SecureImage } from "@/components/common/SecureImage";
import { selectionInquiryApi } from "@/services/api";
import { createIdempotencyKey } from "@/utils/idempotency";
import { trackSubmitSelection } from "@/hooks/useAnalytics";
import { catalogTokens as T } from "./catalogTokens";
import useCatalogDialog from "./useCatalogDialog";
import { useCustomerAuthStore } from "@/store/customerAuthStore";
export type SelectionLookupState = "loading" | "error" | "ready";

export default function SelectionTray({
  products,
  lookupState,
  onRetry,
}: {
  products: CatalogProduct[];
  lookupState: SelectionLookupState;
  onRetry: () => void;
}) {
  const { message } = AntdApp.useApp();
  const ids = useSelectionStore((s) => s.selectedIds);
  const clear = useSelectionStore((s) => s.clear);
  const [open, setOpen] = useState(false);
  const trayButtonRef = useRef<HTMLButtonElement>(null);
  const closeDialog = useCallback(() => setOpen(false), []);
  const resolveTrayButton = useCallback(() => trayButtonRef.current, []);
  const { dialogRef, initialFocusRef } = useCatalogDialog(
    closeDialog,
    trayButtonRef,
    open,
    resolveTrayButton,
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const submitPendingRef = useRef(false);
  const idempotencyKeyRef = useRef(createIdempotencyKey());
  const [form, setForm] = useState({
    customerName: "",
    phone: "",
    email: "",
    wechat: "",
    message: "",
    privacyConsent: false,
  });
  const account = useCustomerAuthStore((state) => state.customer);
  const isSignedIn = useCustomerAuthStore((state) => state.isLoggedIn);

  if (!ids.size) return null;

  const selected = products.filter((p) => ids.has(p.id));
  if (lookupState !== "ready") {
    const failed = lookupState === "error";
    return (
      <div
        role={failed ? "alert" : "status"}
        aria-live="polite"
        style={{
          position: "fixed",
          bottom: 24,
          left: "50%",
          transform: "translateX(-50%)",
          zIndex: 80,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          minHeight: 48,
          maxWidth: "calc(100vw - 32px)",
          padding: failed ? "2px 4px 2px 18px" : "0 20px",
          background: T.txt,
          color: "#FFFFFF",
          borderRadius: 4,
          boxSizing: "border-box",
        }}
      >
        <span style={{ minWidth: 0, fontSize: 12, lineHeight: 1.5 }}>
          {failed ? "选款状态暂时无法确认" : "正在确认已选作品"}
        </span>
        {failed ? (
          <button
            type="button"
            onClick={onRetry}
            style={{
              minHeight: 44,
              flexShrink: 0,
              border: 0,
              paddingInline: 14,
              background: "rgba(255,255,255,0.12)",
              color: "#FFFFFF",
              cursor: "pointer",
              font: "inherit",
              fontSize: 12,
            }}
          >
            重新确认选款
          </button>
        ) : null}
      </div>
    );
  }
  if (!selected.length) return null;

  const selectedCount = selected.length;
  const thumbs = selected.slice(0, 4);

  const handleSubmit = async () => {
    if (submitPendingRef.current || submitting) return;
    if (!isSignedIn && !form.customerName.trim()) {
      message.warning("请填写您的称呼");
      return;
    }
    if (!isSignedIn && !/^1[3-9]\d{9}$/.test(form.phone.trim())) {
      message.warning("请填写正确的手机号码");
      return;
    }
    if (selected.length === 0) {
      message.warning("请至少选择一款作品");
      return;
    }
    if (!form.privacyConsent) {
      message.warning("请阅读并同意隐私说明");
      return;
    }
    submitPendingRef.current = true;
    setSubmitting(true);
    setSubmitError("");
    try {
      await selectionInquiryApi.submit(
        {
          customerName: isSignedIn ? undefined : form.customerName.trim(),
          phone: isSignedIn ? undefined : form.phone.trim(),
          email: form.email.trim() || undefined,
          wechat: form.wechat.trim() || undefined,
          message: form.message.trim() || undefined,
          privacyConsent: form.privacyConsent,
          items: selected.map((p) => ({
            productId: p.id,
            productNameSnapshot: p.name || p.sku,
            productSkuSnapshot: p.sku,
            productImageSnapshot: p.images?.[0] || "",
          })),
        },
        idempotencyKeyRef.current,
      );
      idempotencyKeyRef.current = createIdempotencyKey();
      trackSubmitSelection(selected.length);
      message.success(
        `已提交 ${selected.length} 款作品的选款咨询，我们的珠宝顾问将尽快与您联系`,
      );
      clear();
      closeDialog();
      setSubmitError("");
      setForm({
        customerName: "",
        phone: "",
        email: "",
        wechat: "",
        message: "",
        privacyConsent: false,
      });
    } catch {
      setSubmitError("提交失败，已保留本次选款与填写内容，请重新提交。");
      message.error("选款咨询提交失败，内容已保留");
    } finally {
      submitPendingRef.current = false;
      setSubmitting(false);
    }
  };

  const inputStyle: CSSProperties = {
    width: "100%",
    height: 40,
    border: `1px solid ${T.line}`,
    padding: "0 12px",
    fontSize: 13,
    color: T.txt,
    background: T.bg,
    outline: "none",
    boxSizing: "border-box",
  };

  return (
    <>
      {/* 底部托盘：咨询弹窗打开时卸载，避免重复行动。 */}
      {!open ? (
        <button
          ref={trayButtonRef}
          className="catalog-selection-tray"
          type="button"
          aria-label={`查看已选 ${selectedCount} 款并提交选款咨询`}
          onClick={() => setOpen(true)}
          style={{
            position: "fixed",
            bottom: 24,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 80,
            display: "flex",
            alignItems: "center",
            gap: 14,
            paddingInline: 20,
            height: 48,
            background: T.txt,
            maxWidth: "calc(100vw - 32px)",
            cursor: "pointer",
            borderRadius: 4,
            border: 0,
            textAlign: "left",
            fontFamily: "inherit",
          }}
        >
          <div
            className="tray-thumbs"
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            {thumbs.map((p) => (
              <div
                key={p.id}
                style={{
                  width: 32,
                  height: 32,
                  background: T.imgBg,
                  overflow: "hidden",
                  flexShrink: 0,
                  borderRadius: 2,
                }}
              >
                <SecureImage
                  src={p.images?.[0] || getListingImage(p)}
                  alt={p.sku}
                  style={{ width: "100%", height: "100%", objectFit: "contain" }}
                />
              </div>
            ))}
          </div>
          <span style={{ fontSize: 12, color: "#FFFFFF" }}>
            已选 {selectedCount} 款
          </span>
          <span style={{ fontSize: 12, color: "rgba(255,255,255,0.6)" }}>
            提交选款咨询 →
          </span>
        </button>
      ) : null}

      {/* 提交弹窗 */}
      {open && (
        <>
          <div
            className="catalog-selection-inquiry__backdrop"
            aria-hidden="true"
            onClick={closeDialog}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 99,
              background: "rgba(0,0,0,0.25)",
            }}
          />
          <div
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="selection-inquiry-title"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              zIndex: 100,
              background: T.bg,
              width: "min(480px, 92vw)",
              padding: "32px 28px 28px",
              boxShadow: "0 8px 40px rgba(0,0,0,0.12)",
            }}
          >
            <button
              ref={initialFocusRef}
              type="button"
              aria-label="关闭选款咨询"
              onClick={closeDialog}
              style={{
                position: "absolute",
                top: 16,
                right: 20,
                background: "none",
                border: 0,
                cursor: "pointer",
                fontSize: 18,
                color: T.sec,
                lineHeight: 1,
                minWidth: 36,
                minHeight: 36,
              }}
            >
              ✕
            </button>

            <h2
              id="selection-inquiry-title"
              style={{
                fontSize: 16,
                fontWeight: 400,
                color: T.txt,
                margin: "0 0 4px",
              }}
            >
              提交选款咨询
            </h2>
            <p style={{ fontSize: 12, color: T.sec, margin: "0 0 20px" }}>
              已选 {selected.length}{" "}
              款作品，请填写联系方式，珠宝顾问将为您提供一对一服务
            </p>

            {/* 已选作品缩略图 */}
            <div
              style={{
                display: "flex",
                gap: 8,
                marginBottom: 20,
                flexWrap: "wrap",
              }}
            >
              {selected.slice(0, 6).map((p) => (
                <div
                  key={p.id}
                  style={{
                    width: 52,
                    height: 52,
                    background: T.imgBg,
                    overflow: "hidden",
                    flexShrink: 0,
                  }}
                >
                  <SecureImage
                    src={p.images?.[0] || getListingImage(p)}
                    alt={p.sku}
                    style={{
                      width: "100%",
                      height: "100%",
                      objectFit: "contain",
                    }}
                  />
                </div>
              ))}
              {selected.length > 6 && (
                <span
                  style={{ fontSize: 11, color: T.sec, alignSelf: "center" }}
                >
                  +{selected.length - 6} 款
                </span>
              )}
            </div>

            {/* 表单 */}
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              {isSignedIn ? (
                <div
                  style={{
                    padding: "12px 14px",
                    background: T.bgWarm,
                    fontSize: 12,
                    color: T.sec,
                    lineHeight: 1.7,
                  }}
                >
                  将使用账户资料：{account?.name || "海川贵宾"} ·{" "}
                  {account?.phone}
                </div>
              ) : (
                <>
                  <div>
                    <label
                      htmlFor="sel-name"
                      style={{
                        fontSize: 12,
                        color: T.txt,
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      称呼 <span style={{ color: "#8C3F3B" }}>*</span>
                    </label>
                    <input
                      id="sel-name"
                      value={form.customerName}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, customerName: e.target.value }))
                      }
                      placeholder="您的称呼"
                      style={inputStyle}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="sel-phone"
                      style={{
                        fontSize: 12,
                        color: T.txt,
                        display: "block",
                        marginBottom: 4,
                      }}
                    >
                      手机号 <span style={{ color: "#8C3F3B" }}>*</span>
                    </label>
                    <input
                      id="sel-phone"
                      value={form.phone}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, phone: e.target.value }))
                      }
                      placeholder="方便我们联系您"
                      inputMode="numeric"
                      maxLength={11}
                      style={inputStyle}
                    />
                  </div>
                </>
              )}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: 12,
                }}
              >
                <div>
                  <label
                    htmlFor="sel-email"
                    style={{
                      fontSize: 12,
                      color: T.txt,
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    邮箱
                  </label>
                  <input
                    id="sel-email"
                    value={form.email}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, email: e.target.value }))
                    }
                    placeholder="选填"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <label
                    htmlFor="sel-wechat"
                    style={{
                      fontSize: 12,
                      color: T.txt,
                      display: "block",
                      marginBottom: 4,
                    }}
                  >
                    微信
                  </label>
                  <input
                    id="sel-wechat"
                    value={form.wechat}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, wechat: e.target.value }))
                    }
                    placeholder="选填"
                    style={inputStyle}
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="sel-message"
                  style={{
                    fontSize: 12,
                    color: T.txt,
                    display: "block",
                    marginBottom: 4,
                  }}
                >
                  备注
                </label>
                <textarea
                  id="sel-message"
                  value={form.message}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, message: e.target.value }))
                  }
                  placeholder="预算范围、佩戴需求、特殊要求等"
                  rows={3}
                  style={{
                    ...inputStyle,
                    height: 72,
                    padding: "8px 12px",
                    resize: "vertical",
                  }}
                />
              </div>
            </div>

            <label
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: 8,
                marginTop: 16,
                cursor: "pointer",
                fontSize: 12,
                color: T.sec,
                lineHeight: 1.6,
              }}
            >
              <input
                type="checkbox"
                checked={form.privacyConsent}
                onChange={(e) =>
                  setForm((f) => ({ ...f, privacyConsent: e.target.checked }))
                }
                style={{ marginTop: 2, accentColor: T.txt }}
              />
              <span>
                我已阅读并同意
                <Link
                  to="/privacy"
                  onClick={(e) => e.stopPropagation()}
                  style={{ color: T.txt, textDecoration: "underline" }}
                >
                  隐私说明
                </Link>
                ，提交的信息仅用于选款咨询与顾问联系。
              </span>
            </label>

            {submitError ? (
              <div
                role="alert"
                style={{
                  marginTop: 16,
                  border: "1px solid #D7B6B4",
                  background: "#FAF0EF",
                  color: "#8C3F3B",
                  padding: "10px 12px",
                  fontSize: 12,
                  lineHeight: 1.6,
                }}
              >
                {submitError}
              </div>
            ) : null}

            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting}
              style={{
                width: "100%",
                height: 44,
                marginTop: 20,
                background: submitting ? T.sec : T.txt,
                border: "none",
                cursor: submitting ? "not-allowed" : "pointer",
                fontSize: 14,
                color: "#FFFFFF",
                letterSpacing: "0.04em",
              }}
            >
              {submitting
                ? "提交中…"
                : `${submitError ? "重新" : ""}提交选款咨询（${selected.length} 款）`}
            </button>
          </div>
        </>
      )}
    </>
  );
}
