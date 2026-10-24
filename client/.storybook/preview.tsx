import type { Preview } from "@storybook/react-vite";
import "@fontsource/cormorant-garamond/400.css";
import "@fontsource/cormorant-garamond/500.css";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/noto-serif-sc/400.css";
import "../src/styles/globals.css";

const preview: Preview = {
  parameters: {
    layout: "fullscreen",
    backgrounds: { disable: true },
    controls: { disable: true },
  },
};

export default preview;
