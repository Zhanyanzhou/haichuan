import { useCallback, useEffect, useRef } from "react";

export type EditorWorkspaceOwner = Readonly<{
  workspaceKey: string;
  active: boolean;
  epoch: symbol;
}>;

/**
 * 绑定一次连续的工作区活动区间。离开后再回到同名页面也属于新身份，
 * 旧文件读取、确认框和延迟回调不能因此恢复写入资格。
 */
export function useEditorWorkspaceOwner(workspaceKey: string, active: boolean) {
  const ownerRef = useRef<EditorWorkspaceOwner | null>(null);
  const mountedRef = useRef(true);
  if (!ownerRef.current
    || ownerRef.current.workspaceKey !== workspaceKey
    || ownerRef.current.active !== active) {
    ownerRef.current = { workspaceKey, active, epoch: Symbol("editor-workspace-owner") };
  }
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const isCurrent = useCallback((owner: EditorWorkspaceOwner | null | undefined) => (
    mountedRef.current && Boolean(owner?.active) && ownerRef.current === owner
  ), []);
  return { owner: ownerRef.current, isCurrent };
}
