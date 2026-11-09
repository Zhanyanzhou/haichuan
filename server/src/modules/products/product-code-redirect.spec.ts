import * as assert from "node:assert/strict";
import { test } from "node:test";
import {
  readProductCodeRedirectMap,
  retargetProductCodeRedirects,
} from "./product-code-redirect";

test("连续更正款号时，更早的旧款号跟着指到最新款号", () => {
  const once = retargetProductCodeRedirects({}, 39, "ATP375", "ATP376");
  const twice = retargetProductCodeRedirects(once, 39, "ATP376", "ATP377");
  assert.deepEqual(twice, {
    ATP375: { productId: 39, code: "ATP377" },
    ATP376: { productId: 39, code: "ATP377" },
  });
});

test("改回自己用过的款号时，收回该款号并保留其余旧地址", () => {
  const current = {
    ATP375: { productId: 39, code: "ATP377" },
    ATP376: { productId: 39, code: "ATP377" },
    OTHER: { productId: 8, code: "KEEP" },
  };
  assert.deepEqual(retargetProductCodeRedirects(current, 39, "ATP377", "ATP375"), {
    ATP376: { productId: 39, code: "ATP375" },
    ATP377: { productId: 39, code: "ATP375" },
    OTHER: { productId: 8, code: "KEEP" },
  });
});

test("只接受完整的旧款号记录", () => {
  assert.deepEqual(readProductCodeRedirectMap({
    codes: {
      ATP375: { productId: 39, code: "ATP376" },
      blank: { productId: 0, code: "ATP376" },
      text: "ATP376",
    },
  }), {
    ATP375: { productId: 39, code: "ATP376" },
  });
  assert.deepEqual(readProductCodeRedirectMap("{\"codes\":{\"OLD\":{\"productId\":2,\"code\":\"NEW\"}}}"), {
    OLD: { productId: 2, code: "NEW" },
  });
});
