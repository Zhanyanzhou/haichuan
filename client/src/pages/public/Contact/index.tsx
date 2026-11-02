import { lazy, Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import RouteLoading from "@/components/common/RouteLoading";
import { usePublicContactResource } from "@/hooks/usePublicSiteSettings";
import ContactLanding from "./ContactLanding";

const ConsultationRequest = lazy(() => import("./ConsultationRequest"));

export type ContactProps = { mode?: "public" | "editor-preview" };

export default function Contact({ mode = "public" }: ContactProps = {}) {
  const contact = usePublicContactResource();
  const [params] = useSearchParams();
  const requestOnly = mode !== "editor-preview"
    && (params.get("view") === "request" || params.get("type") === "privacy");
  if (requestOnly) {
    return (
      <Suspense fallback={<RouteLoading surface="public" />}>
        <ConsultationRequest mode={mode} contact={contact} />
      </Suspense>
    );
  }
  return (
    <>
      <ContactLanding mode={mode} contact={contact} />
      <Suspense fallback={<RouteLoading scope="inline" surface="public" label="正在准备预约咨询…" />}>
        <ConsultationRequest mode={mode} embedded contact={contact} />
      </Suspense>
    </>
  );
}
