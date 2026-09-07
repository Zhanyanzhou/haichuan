import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const shellSource = readFileSync(
  resolve("src/page-builder/workspace/FourZoneWorkspaceShell.tsx"),
  "utf8",
);

test.describe("四区工作区基础壳合同", () => {
  test("冻结桌面 12/8/60/20 与四区语义顺序", () => {
    expect(shellSource).toContain("library: 12");
    expect(shellSource).toContain("tree: 8");
    expect(shellSource).toContain("canvas: 60");
    expect(shellSource).toContain("inspector: 20");
    expect(shellSource).toContain('data-desktop-layout="12/8/60/20"');
    expect(shellSource).toContain('data-desktop-min-width="1200"');

    const regionOrder = [
      'zone="library"',
      'zone="tree"',
      'zone="canvas"',
      'zone="inspector"',
    ].map((marker) => shellSource.indexOf(marker));
    expect(regionOrder.every((index) => index >= 0)).toBeTruthy();
    expect(regionOrder).toEqual([...regionOrder].sort((a, b) => a - b));
  });

  test("折叠只隐藏区内内容并保留原四列与键盘按钮语义", () => {
    expect(shellSource).toContain("hidden={collapsed}");
    expect(shellSource).toContain("aria-controls={contentId}");
    expect(shellSource).toContain("aria-expanded={!collapsed}");
    expect(shellSource).toContain('type="button"');
    expect(shellSource).toContain("collapsedRegions.has(\"tree\")");
    expect(shellSource).toContain("collapsedRegions.has(\"inspector\")");
    const gridContractStart = shellSource.indexOf("const DESKTOP_GRID_STYLE");
    const gridContractEnd = shellSource.indexOf(
      "satisfies CSSProperties;",
      gridContractStart,
    );
    const gridContract = shellSource.slice(gridContractStart, gridContractEnd);

    expect(gridContract).not.toContain("collapsed");
  });

  test("基础壳不拥有任何工作区业务状态", () => {
    for (const forbidden of [
      "workspaceMode",
      "workspaceKind",
      "controller",
      "dirty",
      "history",
      "save",
      "publish",
      "UnsavedChangesGuard",
      "DynamicTemplateRenderer",
    ]) {
      expect(shellSource).not.toContain(forbidden);
    }
    expect(shellSource).not.toMatch(/template-editor|HomepageConfig|services\/|repository/i);
  });
});
