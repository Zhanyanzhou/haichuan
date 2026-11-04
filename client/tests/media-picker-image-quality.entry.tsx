import { useState } from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { App } from "antd";
import MediaPickerField from "@/page-builder/fields/MediaPickerField";
import { mediaSpecFromRecommendation, mediaSpecMatchingFrame } from "@/page-builder/fields/mediaSpec";
import { readPageMediaLibrary } from "@/page-builder/fields/pageMediaLibrary";
import { uploadApi } from "@/services/api";

export { mediaSpecFromRecommendation, mediaSpecMatchingFrame, readPageMediaLibrary, uploadApi };

type PickerProps = React.ComponentProps<typeof MediaPickerField>;

export async function mount(initial: PickerProps) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  let update = (_props: PickerProps) => {};
  function Harness() {
    const [props, setProps] = useState(initial);
    update = setProps;
    return (
      <App>
        <MediaPickerField {...props} />
      </App>
    );
  }
  await act(async () => {
    root.render(<Harness />);
  });
  return {
    host,
    async setProps(props: PickerProps) {
      await act(async () => {
        update(props);
      });
    },
    async unmount() {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

export async function flush() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

export async function click(element: Element) {
  await act(async () => {
    (element as HTMLButtonElement).click();
  });
}
