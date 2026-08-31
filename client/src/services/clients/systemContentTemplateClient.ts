export interface SystemContentTemplateCurrent {
  contractKey: string;
  moduleType: string;
  displayName: string;
  contractVersion: number;
  activeVersion: number;
  layoutData: Record<string, unknown>;
  source: "code" | "database";
  changeNote: string | null;
  updatedAt: string | null;
}
