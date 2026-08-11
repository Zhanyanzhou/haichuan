/**
 * 首页装修入口
 *
 * 该路由只服务“店铺 → 首页装修”。具体编辑器实现收敛在 HomepageConfig，
 * 避免影响后台内其他业务页面。
 */
import { Navigate, useParams } from "react-router-dom";
import HomepageConfig from "@/pages/admin/HomepageConfig";
import { isEditorPageKey } from "@/page-builder/config/editorPages";

export default function EditorWorkbench() {
  const { pageKey } = useParams();
  if (!isEditorPageKey(pageKey)) return <Navigate to="/admin/editor/home" replace />;
  return <HomepageConfig pageKey={pageKey} />;
}
