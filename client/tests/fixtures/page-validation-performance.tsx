import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { MemoryRouter } from "react-router-dom";
import AntdProvider from "../../src/components/common/AntdProvider";
import { usePageWorkspaceController } from "../../src/pages/admin/HomepageConfig/PageWorkspaceController";

declare global {
  interface Window {
    validationProbe: { reads: number; change: (value: number) => void };
  }
}

window.validationProbe = { reads: 0, change: () => {} };

function Probe() {
  const controller = usePageWorkspaceController({ pageKey: "products", locale: "zh-CN", canPublish: true });
  const { trackEditorData } = controller;
  const [iteration, setIteration] = useState(-1);
  useEffect(() => {
    window.validationProbe.change = (value) => {
      // 这个 getter 只存在于测试数据：直接观察真实控制器对整页语义内容的遍历。
      const props = Object.defineProperty({}, "workProbe", {
        enumerable: true,
        get() { window.validationProbe.reads += 1; return value; },
      });
      trackEditorData({ content: [], zones: {}, root: { props } });
      setIteration(value);
    };
  }, [trackEditorData]);
  return <output
    data-ready={controller.loadedPageKey === "products" && !controller.initialLoading && !controller.loadError}
    data-iteration={iteration}
    data-dirty={controller.hasUnsavedChanges}
  >{controller.publishValidationStatus}</output>;
}

createRoot(document.getElementById("root")!).render(
  <MemoryRouter><AntdProvider><Probe /></AntdProvider></MemoryRouter>,
);
