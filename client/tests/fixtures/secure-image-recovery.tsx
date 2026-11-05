import React from "react";
import { createRoot } from "react-dom/client";
import { SecureImage } from "../../src/components/common/SecureImage";

const frame = { width: 240, height: 240 };
const privateMedia = new URLSearchParams(location.search).has("private");
createRoot(document.getElementById("root")!).render(
  <main>
    <section aria-label="独立图片">
      <SecureImage
        src={privateMedia ? "/products/catalog/88/media/99" : "/__secure-image.svg?kind=standalone"}
        alt="恢复测试作品"
        style={frame}
        width={240}
        height={240}
        priority
      />
    </section>
    <a href="/__image-detail" aria-label="进入作品">
      <SecureImage src="/__secure-image.svg?kind=link" alt="" style={frame} priority />
    </a>
    <button type="button" aria-label="选择图片">
      <SecureImage src="/__secure-image.svg?kind=button" alt="" style={frame} priority />
    </button>
  </main>,
);
