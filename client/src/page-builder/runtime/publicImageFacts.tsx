import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { PublicImageSourceFacts } from "@/utils/responsiveUploadsImage";

const EMPTY_FACTS: Readonly<Record<string, PublicImageSourceFacts>> = {};

const PublicImageFactsContext = createContext<Readonly<Record<string, PublicImageSourceFacts>>>(EMPTY_FACTS);

export function readPublicImageFacts(document: unknown): Record<string, PublicImageSourceFacts> {
  if (!document || typeof document !== "object") return {};
  const raw = (document as { mediaFacts?: unknown }).mediaFacts;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const facts: Record<string, PublicImageSourceFacts> = {};
  for (const [key, value] of Object.entries(raw)) {
    const path = key.split("?")[0];
    if (!path.startsWith("/uploads/") || !value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const { displayWidth, displayHeight } = row;
    if (!Number.isInteger(displayWidth) || !Number.isInteger(displayHeight)) continue;
    if ((displayWidth as number) <= 0 || (displayHeight as number) <= 0) continue;
    facts[path] = {
      displayWidth: displayWidth as number,
      displayHeight: displayHeight as number,
      animated: row.animated === true,
      revision: typeof row.revision === "string" ? row.revision : undefined,
    };
  }
  return facts;
}

export function PublicImageFactsProvider({
  facts,
  children,
}: {
  facts: Readonly<Record<string, PublicImageSourceFacts>>;
  children: ReactNode;
}) {
  const value = useMemo(() => facts, [facts]);
  return (
    <PublicImageFactsContext.Provider value={value}>
      {children}
    </PublicImageFactsContext.Provider>
  );
}

export function usePublicImageFact(src: string | undefined): PublicImageSourceFacts | null {
  const facts = useContext(PublicImageFactsContext);
  if (!src) return null;
  return facts[src.split("?")[0]] ?? null;
}
