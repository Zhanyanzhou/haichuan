import * as assert from "node:assert/strict";
import { test } from "node:test";
import { Controller, Get, Module, Req } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { Request } from "express";
import { configureProxyTrust } from "./proxy-trust";

@Controller("proxy-probe")
class ProxyProbeController {
  @Get()
  probe(@Req() request: Request) {
    return { ip: request.ip, protocol: request.protocol };
  }
}

@Module({ controllers: [ProxyProbeController] })
class ProxyProbeModule {}

test("真实 Nest 只取直接 Nginx 规范化链的最右 IP，并读取其单值协议", async () => {
  const app = await NestFactory.create(ProxyProbeModule, { logger: false });
  configureProxyTrust(app.getHttpAdapter().getInstance());
  await app.listen(0, "127.0.0.1");
  try {
    const address = app.getHttpServer().address();
    assert.ok(address && typeof address !== "string");
    const url = `http://127.0.0.1:${address.port}/proxy-probe`;

    const direct = await fetch(url).then((response) => response.json()) as {
      ip: string;
      protocol: string;
    };
    assert.match(direct.ip, /127\.0\.0\.1$/);
    assert.equal(direct.protocol, "http");

    const normalized = await fetch(url, {
      headers: {
        // 左侧模拟被边缘代理保留的伪造链；最右值是 Nginx 应覆盖后的单个客户 IP。
        "X-Forwarded-For": "198.51.100.66, 203.0.113.20",
        "X-Forwarded-Proto": "https",
      },
    }).then((response) => response.json()) as { ip: string; protocol: string };
    assert.equal(normalized.ip, "203.0.113.20");
    assert.equal(normalized.protocol, "https");
  } finally {
    await app.close();
  }
});
