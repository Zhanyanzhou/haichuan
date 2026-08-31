import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ProductReferencesField from "../../src/page-builder/fields/ProductReferencesField";
import "../../src/pages/admin/HomepageConfig/editor.css";

function ProductReferencesFixture() {
  const searchParams = new URLSearchParams(window.location.search);
  const legacyMode = searchParams.get("legacy") === "1";
  const singleMode = searchParams.get("single") === "1";
  const [codes, setCodes] = useState(
    legacyMode ? [] : singleMode ? ["SKU-OK"] : ["SKU-OK", "SKU-OFFLINE", "SKU-MISSING"],
  );
  const [legacyIds, setLegacyIds] = useState<number[]>(legacyMode ? [77, 88] : []);
  return (
    <main style={{ width: 560, margin: "24px auto" }}>
      <ProductReferencesField
        value={codes}
        legacyIds={legacyIds}
        minProducts={singleMode ? 1 : 2}
        maxProducts={singleMode ? 1 : 8}
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
