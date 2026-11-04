/**
 * 联系页业务区的店铺资料编辑。
 * 字段写回既有店铺资料，不写入页面草稿，也不改 Puck 属性。
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { App as AntdApp, Button, Upload } from "antd";
import { UploadOutlined } from "@ant-design/icons";
import TextField from "../../controls/TextField";
import { SIGNED_PUBLIC_CONTACT, isDialablePhone } from "@/config/publicContact";
import { getSafeAdminErrorMessage } from "@/constants/adminCopy";
import { refreshPublicContactPreview } from "@/hooks/usePublicSiteSettings";
import { settingsApi, uploadApi, type StoredPageMediaAsset } from "@/services/api";
import { useAuthStore } from "@/store/authStore";
import { resolveManagedTemplateMediaPreviewUrl } from "../../../template-definition/managedMediaPreview";
import { unwrapResponse } from "@/utils/unwrap";
import {
  contactFactError,
  contactFactSavePatch,
  effectiveContactFacts,
  emptyContactFacts,
  misplacedWechatId,
  isContactQrCodeReference,
  readContactFacts,
  type ContactFacts,
} from "./contactFacts";

const SIGNED = {
  phone: SIGNED_PUBLIC_CONTACT.phone,
  email: SIGNED_PUBLIC_CONTACT.email,
  address: SIGNED_PUBLIC_CONTACT.address,
  hours: SIGNED_PUBLIC_CONTACT.hours,
};

function responseStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object" || !("response" in error)) return undefined;
  const response = (error as { response?: { status?: unknown } }).response;
  return typeof response?.status === "number" ? response.status : undefined;
}

function applyPatch(stored: ContactFacts, patch: Partial<ContactFacts>): ContactFacts {
  return { ...stored, ...patch };
}

export default function ContactFactsEditor() {
  const { message, modal } = AntdApp.useApp();
  const status = useAuthStore((state) => state.status);
  const role = useAuthStore((state) => state.user?.role);
  const canEdit = status === "authenticated" && (role === "SUPER_ADMIN" || role === "ADMIN");
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [stored, setStored] = useState<ContactFacts>(emptyContactFacts);
  const [baseline, setBaseline] = useState<ContactFacts>(emptyContactFacts);
  const [draft, setDraft] = useState<ContactFacts>(emptyContactFacts);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [qrUploading, setQrUploading] = useState(false);
  const [qrAuthorizing, setQrAuthorizing] = useState(false);
  const [qrPreviewFailed, setQrPreviewFailed] = useState(false);
  const [qrAssetId, setQrAssetId] = useState<number | null>(null);
  const [qrEligible, setQrEligible] = useState<boolean | null>(null);
  const loadSeq = useRef(0);

  const acceptFacts = useCallback((
    facts: ContactFacts,
    keepQr?: { id: number | null; eligible: boolean | null; url: string },
  ) => {
    const next = effectiveContactFacts(facts, SIGNED);
    setStored(facts);
    setBaseline(next);
    setDraft(next);
    setFormError(null);
    if (keepQr && facts.contactWechatQrCode.trim() === keepQr.url) {
      setQrAssetId(keepQr.id);
      setQrEligible(keepQr.eligible);
    } else {
      setQrAssetId(null);
      setQrEligible(null);
    }
    setQrPreviewFailed(false);
  }, []);

  const loadFacts = useCallback(async (editable: boolean) => {
    const seq = loadSeq.current + 1;
    loadSeq.current = seq;
    setLoadState("loading");
    try {
      const response = editable
        ? await settingsApi.getSettings()
        : await settingsApi.getPublicContact();
      if (loadSeq.current !== seq) return;
      acceptFacts(readContactFacts(unwrapResponse(response)));
      setLoadState("ready");
    } catch {
      if (loadSeq.current !== seq) return;
      setLoadState("error");
    }
  }, [acceptFacts]);

  useEffect(() => {
    if (status === "unknown") return;
    void loadFacts(canEdit);
  }, [canEdit, loadFacts, status]);

  const patch = useMemo(
    () => contactFactSavePatch(stored, baseline, draft),
    [baseline, draft, stored],
  );
  const dirty = Object.keys(patch).length > 0;

  useEffect(() => {
    if (!dirty) return;
    const onLeave = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onLeave);
    return () => window.removeEventListener("beforeunload", onLeave);
  }, [dirty]);

  const updateDraft = (key: keyof ContactFacts, value: string) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setFormError(null);
  };

  const save = async () => {
    const nextPatch = contactFactSavePatch(stored, baseline, draft);
    const error = contactFactError(nextPatch);
    if (error) {
      setFormError(error);
      return;
    }
    if (Object.keys(nextPatch).length === 0 || saving) return;
    setSaving(true);
    try {
      await settingsApi.updateSettings(nextPatch);
      let facts = applyPatch(stored, nextPatch);
      let readbackFailed = false;
      try {
        facts = readContactFacts(unwrapResponse(await settingsApi.getSettings()));
      } catch {
        readbackFailed = true;
      }
      acceptFacts(facts, {
        id: qrAssetId,
        eligible: qrEligible,
        url: draft.contactWechatQrCode.trim(),
      });
      refreshPublicContactPreview();
      if (readbackFailed) {
        message.warning("联系信息已保存。核对最新店铺资料失败，若画布没有更新，请稍后重新打开。");
      } else {
        message.success("联系信息已保存。画布、联系页和页脚会使用这份店铺资料。");
      }
    } catch (error) {
      if (responseStatus(error) === 409) {
        message.error(getSafeAdminErrorMessage(error, "数据已被其他操作更新，请重新加载后再试。"));
        await loadFacts(true);
        return;
      }
      message.error(getSafeAdminErrorMessage(error, "联系信息保存失败，请检查填写内容后重试。"));
    } finally {
      setSaving(false);
    }
  };

  const handleWechatQrUpload = async (file: File) => {
    if (!["image/png", "image/jpeg", "image/webp", "image/gif"].includes(file.type) || file.size > 10 * 1024 * 1024) {
      message.error("请选择不超过 10MB 的 PNG、JPEG、WebP 或 GIF 图片。");
      return;
    }
    setQrUploading(true);
    try {
      const data = unwrapResponse<StoredPageMediaAsset>(await uploadApi.uploadImage(file));
      if (!data?.url || !isContactQrCodeReference(data.url)) {
        throw new Error("二维码素材地址无效");
      }
      updateDraft("contactWechatQrCode", data.url);
      setQrAssetId(data.id);
      setQrEligible(data.publicEligibility?.eligible === true);
      setQrPreviewFailed(false);
      message.success(data.publicEligibility?.eligible
        ? "二维码已上传。请保存联系信息，联系页才会使用这张图。"
        : "二维码已上传。这张图还没有公开授权，联系页不会显示二维码。请由超级管理员确认可公开使用，然后再保存。");
    } catch (error) {
      message.error(getSafeAdminErrorMessage(error, "微信加好友码上传失败，请检查图片和网络后重试。"));
    } finally {
      setQrUploading(false);
    }
  };

  const confirmQrPublicUse = () => {
    if (!qrAssetId || qrAuthorizing) return;
    modal.confirm({
      title: "确认这张加好友码可公开使用？",
      content: "请仅在你已核实这是公司微信的加好友码、拥有公开网站使用权，并愿意以当前账号留下审核记录时继续。确认后请保存联系信息，联系页才会使用这张图。",
      okText: "确认并公开",
      cancelText: "取消",
      onOk: async () => {
        setQrAuthorizing(true);
        try {
          await uploadApi.authorizeMediaPublicUse(qrAssetId, true);
          setQrEligible(true);
          if (draft.contactWechatQrCode.trim() === stored.contactWechatQrCode.trim()) {
            refreshPublicContactPreview();
          }
          message.success(draft.contactWechatQrCode.trim() === stored.contactWechatQrCode.trim()
            ? "这张加好友码已可在联系页显示。"
            : "这张加好友码已可公开。请保存联系信息，联系页才会使用它。");
        } catch (error) {
          message.error(getSafeAdminErrorMessage(error, "公开确认失败。请稍后重试，或到页面素材里完成授权。"));
          throw error;
        } finally {
          setQrAuthorizing(false);
        }
      },
    });
  };

  const readOnly = !canEdit || saving;
  const qrUrl = draft.contactWechatQrCode.trim();
  const qrPreviewUrl = resolveManagedTemplateMediaPreviewUrl(qrUrl);

  if (status === "unknown" || loadState === "loading") {
    return <p className="homepage-editor__contact-facts-note" role="status">正在读取联系信息…</p>;
  }

  if (loadState === "error") {
    return (
      <div className="homepage-editor__contact-facts">
        <p className="homepage-editor__contact-facts-note" role="alert">
          联系信息读取失败。为避免覆盖未知内容，当前不能编辑。
        </p>
        <Button onClick={() => void loadFacts(canEdit)}>重新读取</Button>
      </div>
    );
  }

  return (
    <div className="homepage-editor__contact-facts">
      <p className="homepage-editor__contact-facts-note">
        这些内容来自店铺资料。在这里保存后，画布、联系页和页脚会一起更新。页面草稿不保存电话和微信。
      </p>
      {canEdit ? null : (
        <p className="homepage-editor__contact-facts-note" role="status">
          当前账号不能修改店铺资料。请使用管理员账号，或打开店铺资料。
        </p>
      )}
      <div className="homepage-editor__contact-fact">
        <TextField
          label="公司微信号"
          value={draft.contactWechat}
          maxLength={100}
          readOnly={readOnly}
          onChange={(value) => updateDraft("contactWechat", value)}
        />
        <p className="homepage-editor__contact-facts-note">
          {misplacedWechatId(stored)
            ? "这个微信号目前写在联系电话里。保存后会改存到公司微信号，联系页上的电话号码保持不变。"
            : "联系页显示为微信号。"}
        </p>
      </div>
      <div className="homepage-editor__contact-qr">
        <span className="homepage-editor__contact-qr-label">微信加好友二维码</span>
        {qrUrl && isContactQrCodeReference(qrUrl) && !qrPreviewFailed ? (
          <img
            src={qrPreviewUrl}
            alt="微信加好友二维码"
            onError={() => setQrPreviewFailed(true)}
          />
        ) : (
          <p className="homepage-editor__contact-facts-note">
            {qrPreviewFailed ? "二维码预览暂时无法显示。" : "尚未上传加好友码。"}
          </p>
        )}
        {canEdit ? (
          <div className="homepage-editor__contact-actions">
            <Upload
              accept="image/png,image/jpeg,image/webp,image/gif"
              showUploadList={false}
              disabled={qrUploading || saving}
              beforeUpload={(file) => {
                void handleWechatQrUpload(file);
                return false;
              }}
            >
              <Button
                aria-label={qrUrl ? "替换加好友码" : "上传加好友码"}
                loading={qrUploading}
                disabled={saving}
                icon={<UploadOutlined aria-hidden="true" />}
              >
                {qrUrl ? "替换加好友码" : "上传加好友码"}
              </Button>
            </Upload>
            {qrUrl ? (
              <Button
                disabled={qrUploading || qrAuthorizing || saving}
                onClick={() => {
                  updateDraft("contactWechatQrCode", "");
                  setQrAssetId(null);
                  setQrEligible(null);
                  setQrPreviewFailed(false);
                }}
              >
                清空加好友码
              </Button>
            ) : null}
          </div>
        ) : null}
        {qrEligible === false ? (
          <div>
            <p className="homepage-editor__contact-facts-note" role="status">
              这张图还没有公开授权，联系页不会显示二维码。请由超级管理员确认可公开使用。
            </p>
            {role === "SUPER_ADMIN" && qrAssetId ? (
              <Button loading={qrAuthorizing} disabled={saving} onClick={confirmQrPublicUse}>
                确认可在联系页公开
              </Button>
            ) : (
              <p className="homepage-editor__contact-facts-note">
                请由超级管理员确认公开，或打开店铺资料完成授权。
              </p>
            )}
          </div>
        ) : null}
        {canEdit ? (
          <p className="homepage-editor__contact-facts-note">上传后请保存，联系页才会使用这张图。</p>
        ) : null}
      </div>
      <div className="homepage-editor__contact-fact">
        <TextField
          label="联系电话"
          value={draft.contactPhone}
          maxLength={30}
          readOnly={readOnly}
          onChange={(value) => updateDraft("contactPhone", value)}
        />
        {draft.contactPhone.trim() && !isDialablePhone(draft.contactPhone.trim()) ? (
          <p className="homepage-editor__contact-facts-note">
            这个值不能作为电话拨打。联系页会继续显示已签认的联系电话。若这是微信号，请填到公司微信号。
          </p>
        ) : null}
      </div>
      <div className="homepage-editor__contact-fact">
        <TextField
          label="营业时间"
          value={draft.businessHours}
          maxLength={100}
          rows={2}
          readOnly={readOnly}
          onChange={(value) => updateDraft("businessHours", value)}
        />
        <p className="homepage-editor__contact-facts-note">联系页显示为服务时间。</p>
      </div>
      <div className="homepage-editor__contact-fact">
        <TextField
          label="公司地址"
          value={draft.contactAddress}
          maxLength={300}
          rows={3}
          readOnly={readOnly}
          onChange={(value) => updateDraft("contactAddress", value)}
        />
        <p className="homepage-editor__contact-facts-note">联系页显示为接待地址。</p>
      </div>
      <TextField
        label="联系邮箱"
        value={draft.contactEmail}
        maxLength={100}
        readOnly={readOnly}
        onChange={(value) => updateDraft("contactEmail", value)}
      />
      {formError ? (
        <p className="homepage-editor__contact-facts-note" role="alert">{formError}</p>
      ) : null}
      <div className="homepage-editor__contact-actions">
        {canEdit ? (
          <Button type="primary" disabled={!dirty || qrUploading} loading={saving} onClick={() => void save()}>
            保存联系信息
          </Button>
        ) : null}
        <Link
          className="homepage-editor__contact-link"
          to="/admin/site-content"
          onClick={(event) => {
            if (!dirty) return;
            event.preventDefault();
            message.warning("请先保存联系信息，再打开店铺资料。");
          }}
        >
          打开店铺资料
        </Link>
      </div>
      <p className="homepage-editor__contact-facts-note">预约咨询由访客填写，不在这里修改。</p>
      <p className="homepage-editor__contact-facts-note">此区域不能删除、隐藏或调整顺序。</p>
    </div>
  );
}
