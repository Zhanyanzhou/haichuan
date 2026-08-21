import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ProductReferencesField from "../../src/page-builder/fields/ProductReferencesField";
import "../../src/pages/admin/HomepageConfig/editor.css";

function ProductReferencesFixture() {
  const legacyMode = new URLSearchParams(window.location.search).get("legacy") === "1";
  const [codes, setCodes] = useState(legacyMode ? [] : ["SKU-OK", "SKU-OFFLINE", "SKU-MISSING"]);
  const [legacyIds, setLegacyIds] = useState<number[]>(legacyMode ? [77, 88] : []);
  return (
    <main style={{ width: 560, margin: "24px auto" }}>
      <ProductReferencesField
        value={codes}
        legacyIds={legacyIds}
        minProducts={2}
        maxProducts={8}
        onChange={(nextCodes, nextLegacyIds) => {
          setCodes(nextCodes);
          setLegacyIds(nextLegacyIds);
        }}
      />
      <pre data-testid="product-reference-state">{JSON.stringify({ codes, legacyIds })}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<ProductReferencesFixture />);
