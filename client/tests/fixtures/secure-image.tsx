import { useState } from "react";
import { createRoot } from "react-dom/client";
import { SecureImage } from "@/components/common/SecureImage";
import { useStructuredData } from "@/hooks/useStructuredData";

function Fixture() {
  const [privateImage, setPrivateImage] = useState("/payments/1/proof");
  const [showPrivateImage, setShowPrivateImage] = useState(true);
  useStructuredData("fixture-valid", {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "海川</script>珠宝",
    url: "https://jewelry.example.com",
  });
  useStructuredData("fixture-invalid", {
    "@context": "https://schema.org",
    "@type": "Product",
    name: "Invalid relative canonical fact",
    url: "/relative-product",
  });

  return (
    <main style={{ width: 360 }}>
      <section aria-label="LCP image">
        <SecureImage
          className="priority-image"
          src="/products/public/1/media/10"
          srcSet="/products/public/1/media/10?width=400 400w, /products/public/1/media/10?width=800 800w"
          sizes="(max-width: 600px) 100vw, 800px"
          alt="Priority jewelry"
          width={800}
          height={1000}
          priority
          deferUntilVisible
          style={{ display: "block", width: 320, height: "auto" }}
        />
      </section>

      <section aria-label="Private image">
        {showPrivateImage && (
          <SecureImage
            className="private-image"
            src={privateImage}
            alt="Private proof"
            width={160}
            height={90}
            tokenKind="staff"
            style={{ display: "block", width: 160, height: 90 }}
          />
        )}
        <button type="button" onClick={() => setPrivateImage("/payments/2/proof")}>Replace private image</button>
        <button type="button" onClick={() => setShowPrivateImage(false)}>Unmount private image</button>
      </section>

      <section aria-label="Failure placeholder">
        <SecureImage
          className="failed-image"
          src="/payments/404/proof"
          fallback="/missing-fallback.jpg"
          alt="Unavailable proof"
          width={160}
          height={90}
          style={{ width: 160 }}
        />
      </section>

      <div style={{ height: 1800 }} aria-hidden="true" />
      <section aria-label="Deferred image">
        <SecureImage
          className="deferred-image"
          src="/deferred.svg"
          alt="Deferred jewelry"
          width={320}
          height={180}
          deferUntilVisible
          style={{ display: "block", width: 320, height: 180 }}
        />
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Fixture />);


