import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { pageDocumentApi } from "@/services/api";
import { unwrapResponse } from "@/utils/unwrap";
import {
  ensureEditorPageStructure,
  isEditorPageKey,
} from "@/page-builder/config/editorPages";
import PuckDocumentRenderer, {
  type PuckDocument,
} from "@/page-builder/runtime/PuckDocumentRenderer";
import { migratePuckData } from "@/page-builder/utils/migratePuckData";

const LG = "#F4F5F5";

function useDraftPageDocument(pageKey = "home") {
  const [pageDocument, setPageDocument] = useState<{
    puckData?: PuckDocument;
  } | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(
    async () => {
      setStatus("loading");
      try {
        const response = await pageDocumentApi.getAdmin(pageKey);
        if (mountedRef.current) {
          setPageDocument(unwrapResponse<{ puckData?: PuckDocument } | null>(response));
          setStatus("ready");
        }
      } catch {
        if (mountedRef.current) {
          setPageDocument(null);
          setStatus("error");
        }
      }
    },
    [pageKey],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { pageDocument, status, refresh };
}

export function HomePreview() {
  return <PagePreview pageKey="home" />;
}

export function PagePreview({ pageKey: pageKeyProp }: { pageKey?: string }) {
  const { pageKey: routePageKey } = useParams();
  const pageKey = pageKeyProp || routePageKey || "home";
  const { pageDocument, status, refresh } = useDraftPageDocument(pageKey);
  const previewData = pageDocument?.puckData && isEditorPageKey(pageKey)
    ? ensureEditorPageStructure(pageKey, migratePuckData(pageDocument.puckData))
    : null;

  if (status === "loading") {
    return <main aria-busy="true" style={{ background: LG, minHeight: "100vh" }} />;
  }

  if (status === "error") {
    return (
      <main data-page-document-state="preview-error" style={{ background: LG, minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section role="alert" aria-label="草稿预览暂时无法载入" style={{ width: "min(100%, 520px)", padding: "32px 28px", background: "#FFFFFF", border: "1px solid #DDE1E2", textAlign: "center" }}>
          <h1 style={{ margin: 0, color: "#181A1B", fontSize: 24, fontWeight: 500 }}>草稿预览暂时无法载入</h1>
          <p style={{ margin: "14px 0 24px", color: "#5F6568", lineHeight: 1.7 }}>当前没有展示推荐结构或历史内容，请重新载入以核对最新草稿。</p>
          <button type="button" onClick={() => void refresh()} style={{ minHeight: 42, padding: "0 20px", border: "1px solid #181A1B", background: "#181A1B", color: "#FFFFFF", cursor: "pointer" }}>
            重新载入草稿预览
          </button>
        </section>
      </main>
    );
  }

  if (!previewData) {
    return (
      <main data-page-document-state="preview-empty" style={{ background: LG, minHeight: "70vh", display: "grid", placeItems: "center", padding: 24 }}>
        <section role="status" aria-labelledby="draft-preview-empty-title" style={{ width: "min(100%, 520px)", padding: "32px 28px", background: "#FFFFFF", border: "1px solid #DDE1E2", textAlign: "center" }}>
          <h1 id="draft-preview-empty-title" style={{ margin: 0, color: "#181A1B", fontSize: 24, fontWeight: 500 }}>尚无已保存草稿</h1>
          <p style={{ margin: "14px 0 0", color: "#5F6568", lineHeight: 1.7 }}>请先在店铺装修中保存草稿再预览。当前不会展示推荐结构或历史内容。</p>
        </section>
      </main>
    );
  }

  return (
    <main style={{ background: LG }}>
      <PuckDocumentRenderer data={previewData} mode="preview" surface={pageKey === "home" ? "home" : undefined} />
    </main>
  );
}
