import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import CategoryReferencesField from "../../src/page-builder/fields/CategoryReferencesField";
import "../../src/pages/admin/HomepageConfig/editor.css";

function CategoryReferencesFixture() {
  const [slugs, setSlugs] = useState(["rings", "inactive", "missing-cover"]);
  return (
    <main style={{ width: 560, margin: "24px auto" }}>
      <CategoryReferencesField
        value={slugs}
        minItems={2}
        maxItems={4}
        onChange={setSlugs}
      />
      <pre data-testid="category-reference-state">{JSON.stringify(slugs)}</pre>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<CategoryReferencesFixture />);
