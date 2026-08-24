import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Controller, Get, Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { resolveCorsOrigins } from "./cors-origins";

@Controller("probe")
class CorsProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

@Module({ controllers: [CorsProbeController] })
class CorsProbeModule {}

test("真实 NestJS 预检只为显式开发 loopback Origin 返回凭据 CORS 头", async () => {
  const app = await NestFactory.create(CorsProbeModule, { logger: false });
  app.enableCors({
    origin: resolveCorsOrigins("development", "http://127.0.0.1:5189"),
    credentials: true,
  });
  await app.listen(0, "127.0.0.1");
  try {
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/probe`;
    const preflight = (origin: string) =>
      fetch(url, {
        method: "OPTIONS",
        headers: {
          Origin: origin,
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "authorization,content-type",
        },
      });

    const allowed = await preflight("http://127.0.0.1:5189");
    assert.equal(allowed.status, 204);
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "http://127.0.0.1:5189",
    );
    assert.equal(
      allowed.headers.get("access-control-allow-credentials"),
      "true",
    );

    const denied = await preflight("http://127.0.0.1:5190");
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  } finally {
    await app.close();
  }
});
