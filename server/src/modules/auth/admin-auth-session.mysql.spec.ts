import assert from "node:assert/strict";
import test from "node:test";
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, rmSync } from "node:fs";
import { AddressInfo, createServer } from "node:net";
import { resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import { pathToFileURL } from "node:url";
import {
  Controller,
  Get,
  Module,
  Req,
  UseGuards,
  ValidationPipe,
} from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR, Reflector } from "@nestjs/core";
import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { PrismaClient, type Role } from "@prisma/client";
import * as bcrypt from "bcrypt";
import { PrismaService } from "../../common/prisma/prisma.service";
import { RolesGuard } from "../../common/guards/roles.guard";
import { Public } from "../../common/decorators/public.decorator";
import { SessionSecurityGuard } from "../../common/security/session-security.guard";
import { RefreshSessionService } from "../../common/security/refresh-session.service";
import { AuditLogInterceptor } from "../../common/interceptors/audit-log.interceptor";
import { TransformInterceptor } from "../../common/interceptors/transform.interceptor";
import { HttpExceptionFilter } from "../../common/filters/http-exception.filter";
import { CustomerAuthGuard } from "../customers/customer-auth.guard";
import type { CustomerRequest } from "../../common/security/authenticated-principal";
import { UsersController } from "../users/users.controller";
import { UsersService } from "../users/users.service";
import { TagsController } from "../products/tags.controller";
import { ProductsService } from "../products/products.service";
import { InventoryController } from "../inventory/inventory.controller";
import { InventoryService } from "../inventory/inventory.service";
import { AfterSalesController } from "../after-sales/after-sales.controller";
import { AfterSalesService } from "../after-sales/after-sales.service";
import { StatisticsController } from "../statistics/statistics.controller";
import { StatisticsService } from "../statistics/statistics.service";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { JwtAuthGuard } from "./jwt-auth.guard";
import { JwtStrategy } from "./jwt.strategy";
import { LocalStrategy } from "./local.strategy";

const { validateTarget } = require("../../../scripts/run-real-mysql-tests.cjs");
const databaseUrl = process.env.REAL_MYSQL_TEST_DATABASE_URL;

async function reserveLoopbackPort(): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close((error) => error ? reject(error) : resolvePort(address.port));
    });
  });
}

async function waitForUrl(url: string, child: ChildProcess): Promise<void> {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) throw new Error("AUTH_REAL_VITE_EXITED");
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // 服务仍在启动。
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 100));
  }
  throw new Error("AUTH_REAL_VITE_TIMEOUT");
}

async function stopChild(child: ChildProcess | undefined): Promise<void> {
  if (!child || child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise((resolveExit) => child.once("exit", resolveExit)),
    new Promise((resolveTimeout) => setTimeout(resolveTimeout, 5_000)),
  ]);
  if (child.exitCode === null) child.kill("SIGKILL");
}

async function startProductionApp(options: {
  serverRoot: string;
  cwd: string;
  databaseUrl: string;
  jwtSecret: string;
  corsOrigin: string;
}): Promise<{ child: ChildProcess; port: number }> {
  const modulePath = (path: string) =>
    JSON.stringify(resolve(options.serverRoot, path));
  const script = [
    `const { NestFactory, Reflector } = require(${modulePath("node_modules/@nestjs/core")});`,
    `const { ValidationPipe } = require(${modulePath("node_modules/@nestjs/common")});`,
    `const { AppModule } = require(${modulePath("src/app.module.ts")});`,
    `const { TransformInterceptor } = require(${modulePath("src/common/interceptors/transform.interceptor.ts")});`,
    `const { HttpExceptionFilter } = require(${modulePath("src/common/filters/http-exception.filter.ts")});`,
    `(async () => {`,
    `  const app = await NestFactory.create(AppModule, { abortOnError: false, logger: false });`,
    `  app.setGlobalPrefix("api");`,
    `  app.enableCors({ origin: [process.env.CORS_ORIGIN], credentials: true });`,
    `  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true } }));`,
    `  app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));`,
    `  app.useGlobalFilters(new HttpExceptionFilter());`,
    `  await app.listen(0, "127.0.0.1");`,
    `  process.stdout.write("AUTH_PRODUCTION_READY:" + app.getHttpServer().address().port + "\\n");`,
    `})().catch((error) => { process.stderr.write(String(error?.stack || error)); process.exit(1); });`,
  ].join("\n");
  const child = spawn(
    process.execPath,
    [
      "-r",
      resolve(options.serverRoot, "node_modules/ts-node/register"),
      "--eval",
      script,
    ],
    {
      cwd: options.cwd,
      env: {
        NODE_ENV: "development",
        HOST: "127.0.0.1",
        DATABASE_URL: options.databaseUrl,
        JWT_SECRET: options.jwtSecret,
        CORS_ORIGIN: options.corsOrigin,
        PUBLIC_MEDIA_ROOT: resolve(options.cwd, "public-media"),
        PAGE_MEDIA_ARCHIVE_ROOT: resolve(
          options.cwd,
          "private-media/page-assets-archive",
        ),
        PAYMENT_PROOF_MEDIA_ROOT: resolve(
          options.cwd,
          "private-media/payment-proofs",
        ),
        PRODUCT_MEDIA_ROOT: resolve(options.cwd, "private-media/products"),
        SystemRoot: process.env.SystemRoot,
        WINDIR: process.env.WINDIR,
        TEMP: process.env.TEMP,
        TMP: process.env.TMP,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  return new Promise((resolveStart, reject) => {
    let output = "";
    const timeout = setTimeout(() => {
      child.kill();
      reject(new Error("AUTH_PRODUCTION_APP_TIMEOUT"));
    }, 30_000);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += String(chunk);
      const match = /AUTH_PRODUCTION_READY:(\d+)/.exec(output);
      if (!match) return;
      clearTimeout(timeout);
      resolveStart({ child, port: Number(match[1]) });
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += String(chunk);
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("exit", (status) => {
      if (status === null || /AUTH_PRODUCTION_READY:/.test(output)) return;
      clearTimeout(timeout);
      reject(
        new Error(`AUTH_PRODUCTION_APP_EXIT_${status}: ${output.slice(-4_000)}`),
      );
    });
  });
}

async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env: NodeJS.ProcessEnv },
): Promise<{ status: number | null; output: string }> {
  return new Promise((resolveRun, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let output = "";
    child.stdout?.on("data", (chunk) => { output += String(chunk); });
    child.stderr?.on("data", (chunk) => { output += String(chunk); });
    child.once("error", reject);
    child.once("exit", (status) => resolveRun({ status, output }));
  });
}

@Controller("auth-test/customer")
class CustomerIdentityProbeController {
  @Public()
  @UseGuards(CustomerAuthGuard)
  @Get()
  read(@Req() request: CustomerRequest) {
    return { id: request.customer.id };
  }
}

type JsonResult = {
  response: Response;
  body: any;
  setCookies: string[];
};

class CookieJar {
  private readonly values = new Map<string, string>();

  capture(response: Response): string[] {
    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const lines = headers.getSetCookie?.() ?? [];
    for (const line of lines) {
      const pair = line.split(";", 1)[0];
      const separator = pair.indexOf("=");
      if (separator <= 0) continue;
      const name = pair.slice(0, separator);
      const value = pair.slice(separator + 1);
      if (value) this.values.set(name, value);
      else this.values.delete(name);
    }
    return lines;
  }

  header(overrides: Record<string, string> = {}): string {
    const values = new Map(this.values);
    for (const [name, value] of Object.entries(overrides)) {
      if (value) values.set(name, value);
      else values.delete(name);
    }
    return [...values].map(([name, value]) => `${name}=${value}`).join("; ");
  }

  get(name: string): string {
    const value = this.values.get(name);
    assert.ok(value, `缺少 Cookie ${name}`);
    return value;
  }
}

function readSetCookies(response: Response): string[] {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  return headers.getSetCookie?.() ?? [];
}

test(
  "真实 Nest HTTP + MySQL：员工登录、双域、角色、会话吊销与审计闭环",
  {
    skip: databaseUrl
      ? false
      : "需要显式提供一次性 REAL_MYSQL_TEST_DATABASE_URL",
  },
  async () => {
    assert.equal(
      databaseUrl,
      validateTarget(process.env),
      "员工鉴权测试必须使用显式隔离库",
    );
    assert.equal(process.versions.node.split(".")[0], "22");

    const prisma = new PrismaClient({ datasourceUrl: databaseUrl });
    const prismaService = prisma as unknown as PrismaService;
    const jwtSecret = `admin-auth-real-${randomUUID()}`;
    const jwt = new JwtService({ secret: jwtSecret });
    const frontPort = await reserveLoopbackPort();
    const frontOrigin = `http://127.0.0.1:${frontPort}`;
    const previousNodeEnv = process.env.NODE_ENV;
    const previousCorsOrigin = process.env.CORS_ORIGIN;
    const previousDatabaseUrl = process.env.DATABASE_URL;
    const previousJwtSecret = process.env.JWT_SECRET;
    process.env.NODE_ENV = "development";
    process.env.CORS_ORIGIN = frontOrigin;
    process.env.DATABASE_URL = databaseUrl;
    process.env.JWT_SECRET = jwtSecret;

    const readOnlyList = async () => ({ list: [], total: 0, page: 1, pageSize: 20 });
    const dashboard = {
      orderToday: 0,
      revenueToday: 0,
      inquiriesToday: 0,
      pageViewsToday: 0,
      pendingShip: 0,
      pendingAppointmentInquiries: 0,
      pendingSelectionInquiries: 0,
      lowStock: 0,
      pendingReview: 0,
    };

    @Module({
      imports: [PassportModule],
      controllers: [
        AuthController,
        UsersController,
        TagsController,
        InventoryController,
        AfterSalesController,
        StatisticsController,
        CustomerIdentityProbeController,
      ],
      providers: [
        AuthService,
        UsersService,
        RefreshSessionService,
        LocalStrategy,
        JwtStrategy,
        CustomerAuthGuard,
        { provide: PrismaService, useValue: prismaService },
        { provide: JwtService, useValue: jwt },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) =>
              key === "JWT_SECRET"
                ? jwtSecret
                : key === "NODE_ENV"
                  ? "development"
                  : undefined,
          },
        },
        { provide: ProductsService, useValue: { listTags: async () => [] } },
        { provide: InventoryService, useValue: { findAll: readOnlyList } },
        { provide: AfterSalesService, useValue: { findAll: readOnlyList } },
        {
          provide: StatisticsService,
          useValue: {
            getDashboard: async () => dashboard,
            getTrend: async () => [],
          },
        },
        { provide: APP_GUARD, useClass: JwtAuthGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
        { provide: APP_GUARD, useClass: SessionSecurityGuard },
        { provide: APP_INTERCEPTOR, useClass: AuditLogInterceptor },
      ],
    })
    class AdminAuthRealTestModule {}

    const app = await NestFactory.create(AdminAuthRealTestModule, {
      abortOnError: false,
      logger: ["error"],
    });
    app.setGlobalPrefix("api");
    app.enableCors({ origin: [frontOrigin], credentials: true });
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.useGlobalInterceptors(new TransformInterceptor(app.get(Reflector)));
    app.useGlobalFilters(new HttpExceptionFilter());

    const marker = randomUUID().replaceAll("-", "").slice(0, 10);
    const loginPassword = "R7!mQ2";
    const changedPassword = "T8!nW3";
    const roles = [
      "SUPER_ADMIN",
      "ADMIN",
      "EDITOR",
      "WAREHOUSE",
      "CUSTOMER_SERVICE",
    ] as const satisfies readonly Role[];
    const users = new Map<Role, { id: number; username: string }>();
    let customerId: number | undefined;
    let appStarted = false;
    let productionProcess: ChildProcess | undefined;
    let viteProcess: ChildProcess | undefined;
    let browserTempDir: string | undefined;
    let productionTempDir: string | undefined;
    await prisma.$connect();
    try {
      const passwordHash = await bcrypt.hash(loginPassword, 4);
      for (const role of roles) {
        const user = await prisma.user.create({
          data: {
            username: `auth-${role.toLowerCase().replaceAll("_", "-")}-${marker}`,
            realName: `鉴权测试-${role}`,
            password: passwordHash,
            role,
          },
          select: { id: true, username: true },
        });
        users.set(role, user);
      }
      const customer = await prisma.customer.create({
        data: {
          phone: `139${marker.replace(/\D/g, "").padEnd(8, "7").slice(0, 8)}`,
          name: `鉴权客户-${marker}`,
          passwordHash,
        },
      });
      customerId = customer.id;

      await app.listen(0, "127.0.0.1");
      appStarted = true;
      const port = (app.getHttpServer().address() as AddressInfo).port;
      const baseUrl = `http://127.0.0.1:${port}`;

      const call = async (
        path: string,
        init: {
          method?: string;
          body?: unknown;
          headers?: Record<string, string>;
          jar?: CookieJar;
          cookieOverrides?: Record<string, string>;
        } = {},
      ): Promise<JsonResult> => {
        const headers = new Headers(init.headers);
        const cookie = init.jar?.header(init.cookieOverrides);
        if (cookie) headers.set("Cookie", cookie);
        if (init.body !== undefined) headers.set("Content-Type", "application/json");
        const response = await fetch(`${baseUrl}${path}`, {
          method: init.method ?? "GET",
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const setCookies = readSetCookies(response);
        init.jar?.capture(response);
        const body = await response.json().catch(() => null);
        return { response, body, setCookies };
      };

      const loginCookie = async (role: (typeof roles)[number]) => {
        const jar = new CookieJar();
        const result = await call("/api/auth/login", {
          method: "POST",
          jar,
          headers: {
            Origin: frontOrigin,
            "X-Session-Mode": "cookie",
          },
          body: { username: users.get(role)!.username, password: loginPassword },
        });
        assert.equal(result.response.status, 201);
        assert.equal(result.body.data.user.role, role);
        assert.equal("accessToken" in result.body.data, false);
        assert.ok(result.setCookies.some((line) => /^hc_admin_access=/.test(line) && /HttpOnly/i.test(line)));
        assert.ok(result.setCookies.some((line) => /^hc_admin_refresh=/.test(line) && /HttpOnly/i.test(line)));
        assert.ok(result.setCookies.some((line) => /^hc_csrf=/.test(line) && !/HttpOnly/i.test(line)));
        return jar;
      };

      const roleJars = new Map<string, CookieJar>();
      for (const role of roles) roleJars.set(role, await loginCookie(role));

      const roleMatrix = [
        { path: "/api/statistics/dashboard", allowed: ["SUPER_ADMIN", "ADMIN"] },
        { path: "/api/tags", allowed: ["SUPER_ADMIN", "ADMIN", "EDITOR"] },
        { path: "/api/inventory", allowed: ["SUPER_ADMIN", "ADMIN", "WAREHOUSE"] },
        { path: "/api/after-sales-cases", allowed: ["SUPER_ADMIN", "ADMIN", "CUSTOMER_SERVICE"] },
      ];
      for (const probe of roleMatrix) {
        for (const role of roles) {
          const result = await call(probe.path, { jar: roleJars.get(role)! });
          assert.equal(
            result.response.status,
            probe.allowed.includes(role) ? 200 : 403,
            `${role} -> ${probe.path}`,
          );
        }
      }

      const superJar = roleJars.get("SUPER_ADMIN")!;
      const adminJar = roleJars.get("ADMIN")!;
      const protectedCreate = await call("/api/users", {
        method: "POST",
        jar: adminJar,
        headers: { Origin: frontOrigin, "X-CSRF-Token": adminJar.get("hc_csrf") },
        body: { username: `admin-forbidden-${marker}`, password: loginPassword },
      });
      assert.equal(protectedCreate.response.status, 403);

      const noCsrf = await call(`/api/users/${users.get("EDITOR")!.id}`, {
        method: "PUT",
        jar: superJar,
        headers: { Origin: frontOrigin },
        body: { realName: "不得写入" },
      });
      assert.equal(noCsrf.response.status, 403);
      assert.equal(noCsrf.body.errorCode, "CSRF_TOKEN_INVALID");
      const badOrigin = await call(`/api/users/${users.get("EDITOR")!.id}`, {
        method: "PUT",
        jar: superJar,
        headers: { Origin: "https://attacker.example", "X-CSRF-Token": superJar.get("hc_csrf") },
        body: { realName: "不得写入" },
      });
      assert.equal(badOrigin.response.status, 403);
      assert.equal(badOrigin.body.errorCode, "SESSION_ORIGIN_REJECTED");

      for (const [password, expectedMessage] of [
        ["12345", "6-18"],
        ["x".repeat(19), "6-18"],
        ["123456", "密码过于常见"],
      ] as const) {
        const rejected = await call("/api/users", {
          method: "POST",
          jar: superJar,
          headers: { Origin: frontOrigin, "X-CSRF-Token": superJar.get("hc_csrf") },
          body: { username: `weak-${password.length}-${marker}`, password },
        });
        assert.equal(rejected.response.status, 400);
        assert.match(rejected.body.message, new RegExp(expectedMessage));
      }

      const changeTarget = users.get("EDITOR")!;
      const editorJarBeforeRejectedChanges = roleJars.get("EDITOR")!;
      for (const [password, expectedMessage] of [
        ["12345", "6-18"],
        ["x".repeat(19), "6-18"],
        ["123456", "密码过于常见"],
      ] as const) {
        const rejected = await call(`/api/users/${changeTarget.id}`, {
          method: "PUT",
          jar: superJar,
          headers: { Origin: frontOrigin, "X-CSRF-Token": superJar.get("hc_csrf") },
          body: { password },
        });
        assert.equal(rejected.response.status, 400);
        assert.match(rejected.body.message, new RegExp(expectedMessage));
        assert.equal(
          (await call("/api/auth/profile", { jar: editorJarBeforeRejectedChanges })).response.status,
          200,
          "被拒绝的改密不得吊销既有员工会话",
        );
      }
      const changed = await call(`/api/users/${changeTarget.id}`, {
        method: "PUT",
        jar: superJar,
        headers: { Origin: frontOrigin, "X-CSRF-Token": superJar.get("hc_csrf") },
        body: { password: changedPassword },
      });
      assert.equal(changed.response.status, 200);
      const oldEditorJar = roleJars.get("EDITOR")!;
      assert.equal((await call("/api/auth/profile", { jar: oldEditorJar })).response.status, 401);
      const oldEditorRefresh = await call("/api/auth/session/refresh", {
        method: "POST",
        jar: oldEditorJar,
        headers: { Origin: frontOrigin, "X-CSRF-Token": oldEditorJar.get("hc_csrf") },
      });
      assert.equal(oldEditorRefresh.response.status, 401);
      const oldPasswordLogin = await call("/api/auth/login", {
        method: "POST",
        headers: { Origin: frontOrigin, "X-Session-Mode": "cookie" },
        body: { username: changeTarget.username, password: loginPassword },
      });
      assert.equal(oldPasswordLogin.response.status, 401);
      const newEditorJar = new CookieJar();
      const newPasswordLogin = await call("/api/auth/login", {
        method: "POST",
        jar: newEditorJar,
        headers: { Origin: frontOrigin, "X-Session-Mode": "cookie" },
        body: { username: changeTarget.username, password: changedPassword },
      });
      assert.equal(newPasswordLogin.response.status, 201);

      const disabledTarget = users.get("WAREHOUSE")!;
      const disabled = await call(`/api/users/${disabledTarget.id}`, {
        method: "PUT",
        jar: superJar,
        headers: { Origin: frontOrigin, "X-CSRF-Token": superJar.get("hc_csrf") },
        body: { status: "DISABLED" },
      });
      assert.equal(disabled.response.status, 200);
      assert.equal(
        (await call("/api/auth/profile", { jar: roleJars.get("WAREHOUSE")! })).response.status,
        401,
      );

      const refreshJar = await loginCookie("CUSTOMER_SERVICE");
      const oldRefreshToken = refreshJar.get("hc_admin_refresh");
      const oldFamily = await prisma.adminRefreshSession.findUniqueOrThrow({
        where: { tokenHash: createHash("sha256").update(oldRefreshToken).digest("hex") },
      });
      const rejectedRefreshHeaders: Array<Record<string, string>> = [
        { Origin: frontOrigin },
        { Origin: frontOrigin, "X-CSRF-Token": "wrong-csrf" },
        { Origin: "https://attacker.example", "X-CSRF-Token": refreshJar.get("hc_csrf") },
      ];
      for (const headers of rejectedRefreshHeaders) {
        const rejected = await call("/api/auth/session/refresh", {
          method: "POST",
          jar: refreshJar,
          headers,
        });
        assert.equal(rejected.response.status, 403);
      }
      const unchangedRefreshRow = await prisma.adminRefreshSession.findUniqueOrThrow({
        where: { id: oldFamily.id },
      });
      assert.equal(unchangedRefreshRow.revokedAt, null);
      assert.equal(unchangedRefreshRow.replacedByHash, null);
      assert.equal((await call("/api/auth/profile", { jar: refreshJar })).response.status, 200);
      const refreshed = await call("/api/auth/session/refresh", {
        method: "POST",
        jar: refreshJar,
        headers: { Origin: frontOrigin, "X-CSRF-Token": refreshJar.get("hc_csrf") },
      });
      assert.equal(refreshed.response.status, 201);
      assert.notEqual(refreshJar.get("hc_admin_refresh"), oldRefreshToken);
      const oldRefreshRow = await prisma.adminRefreshSession.findUniqueOrThrow({ where: { id: oldFamily.id } });
      assert.ok(oldRefreshRow.revokedAt);
      assert.ok(oldRefreshRow.replacedByHash);
      const replayed = await call("/api/auth/session/refresh", {
        method: "POST",
        jar: refreshJar,
        cookieOverrides: { hc_admin_refresh: oldRefreshToken },
        headers: { Origin: frontOrigin, "X-CSRF-Token": refreshJar.get("hc_csrf") },
      });
      assert.equal(replayed.response.status, 401);
      assert.equal(
        await prisma.adminRefreshSession.count({ where: { familyId: oldFamily.familyId, revokedAt: null } }),
        0,
      );
      assert.equal((await call("/api/auth/profile", { jar: refreshJar })).response.status, 401);

      const logoutJar = await loginCookie("ADMIN");
      const replayAccess = logoutJar.get("hc_admin_access");
      const logoutRefresh = logoutJar.get("hc_admin_refresh");
      const logoutFamily = await prisma.adminRefreshSession.findUniqueOrThrow({
        where: { tokenHash: createHash("sha256").update(logoutRefresh).digest("hex") },
      });
      const rejectedLogoutHeaders: Array<Record<string, string>> = [
        { Origin: frontOrigin },
        { Origin: frontOrigin, "X-CSRF-Token": "wrong-csrf" },
        {
          Origin: "https://attacker.example",
          "X-Session-Mode": "cookie",
          "X-CSRF-Token": logoutJar.get("hc_csrf"),
        },
      ];
      for (const headers of rejectedLogoutHeaders) {
        const rejected = await call("/api/auth/session/logout", {
          method: "POST",
          jar: logoutJar,
          headers,
        });
        assert.equal(rejected.response.status, 403);
      }
      assert.equal(
        (await prisma.adminRefreshSession.findUniqueOrThrow({ where: { id: logoutFamily.id } })).revokedAt,
        null,
      );
      assert.equal((await call("/api/auth/profile", { jar: logoutJar })).response.status, 200);
      const loggedOut = await call("/api/auth/session/logout", {
        method: "POST",
        jar: logoutJar,
        headers: {
          Origin: frontOrigin,
          "X-Session-Mode": "cookie",
          "X-CSRF-Token": logoutJar.get("hc_csrf"),
        },
      });
      assert.equal(loggedOut.response.status, 201);
      assert.ok(loggedOut.setCookies.filter((line) => /Max-Age=0/i.test(line)).length >= 2);
      assert.equal(
        (await call("/api/auth/profile", { headers: { Cookie: `hc_admin_access=${replayAccess}` } })).response.status,
        401,
      );

      const bearerLogin = await call("/api/auth/login", {
        method: "POST",
        body: { username: users.get("ADMIN")!.username, password: loginPassword },
      });
      assert.equal(bearerLogin.response.status, 201);
      assert.equal(typeof bearerLogin.body.data.accessToken, "string");
      assert.equal(bearerLogin.setCookies.length, 0);
      const bearer = bearerLogin.body.data.accessToken as string;
      assert.equal(
        (await call("/api/auth/profile", { headers: { Authorization: `Bearer ${bearer}` } })).response.status,
        200,
      );
      assert.equal(
        (await call("/api/auth/session/logout", { method: "POST", headers: { Authorization: `Bearer ${bearer}` } })).response.status,
        201,
      );
      assert.equal(
        (await call("/api/auth/profile", { headers: { Authorization: `Bearer ${bearer}` } })).response.status,
        401,
      );

      const customerDomainTokenForAdminId = jwt.sign({
        sub: users.get("ADMIN")!.id,
        type: "customer",
        tokenUse: "access",
        authVersion: customer.authVersion,
      });
      assert.equal(
        (await call("/api/auth/profile", {
          headers: { Authorization: `Bearer ${customerDomainTokenForAdminId}` },
        })).response.status,
        401,
      );
      const adminDomainTokenForCustomerId = jwt.sign({
        sub: customer.id,
        type: "admin",
        tokenUse: "access",
        authVersion: customer.authVersion,
      });
      assert.equal(
        (await call("/api/auth-test/customer", {
          headers: { Authorization: `Bearer ${adminDomainTokenForCustomerId}` },
        })).response.status,
        401,
      );
      assert.equal(
        (await call("/api/auth-test/customer", {
          headers: {
            Authorization: `Bearer ${jwt.sign({
              sub: customer.id,
              type: "customer",
              tokenUse: "access",
              authVersion: customer.authVersion,
            })}`,
          },
        })).response.status,
        200,
      );

      const auditDeadline = Date.now() + 3_000;
      let passwordAudit;
      do {
        passwordAudit = await prisma.operationLog.findFirst({
          where: {
            userId: users.get("SUPER_ADMIN")!.id,
            action: "update",
            module: "users",
            targetId: changeTarget.id,
          },
          orderBy: { id: "desc" },
        });
        if (!passwordAudit) await new Promise((resolve) => setTimeout(resolve, 25));
      } while (!passwordAudit && Date.now() < auditDeadline);
      assert.ok(passwordAudit);
      assert.deepEqual(JSON.parse(passwordAudit.detail || "{}"), {
        schemaVersion: 1,
        method: "PUT",
        path: `/api/users/${changeTarget.id}`,
      });
      assert.doesNotMatch(passwordAudit.detail || "", /password|R7|T8/i);

      const serverRoot = resolve(__dirname, "../../..");
      const clientRoot = resolve(serverRoot, "../client");
      browserTempDir = resolve(serverRoot, `.auth-browser-${marker}`);
      const envDir = resolve(browserTempDir, "env");
      const outputDir = resolve(browserTempDir, "playwright-output");
      mkdirSync(envDir, { recursive: true });
      mkdirSync(outputDir, { recursive: true });
      const viteEntry = pathToFileURL(
        resolve(clientRoot, "node_modules/vite/dist/node/index.js"),
      ).href;
      const viteScript = [
        `const { createServer } = await import(${JSON.stringify(viteEntry)});`,
        `const server = await createServer({`,
        `  root: ${JSON.stringify(clientRoot)},`,
        `  envDir: ${JSON.stringify(envDir)},`,
        `  server: { host: "127.0.0.1", port: ${frontPort}, strictPort: true },`,
        `});`,
        `await server.listen();`,
      ].join("\n");
      viteProcess = spawn(
        process.execPath,
        ["--input-type=module", "--eval", viteScript],
        {
          cwd: clientRoot,
          env: {
            ...process.env,
            VITE_API_BASE_URL: `${baseUrl}/api`,
            VITE_USE_MOCK: "false",
          },
          stdio: ["ignore", "pipe", "pipe"],
        },
      );
      await waitForUrl(frontOrigin, viteProcess);

      const playwrightCli = resolve(clientRoot, "node_modules/@playwright/test/cli.js");
      const browserRun = await runCommand(
        process.execPath,
        [
          playwrightCli,
          "test",
          "admin-auth-real-closure.spec.ts",
          "--project=admin-chromium",
          "--reporter=line",
          "--workers=1",
          `--output=${outputDir}`,
        ],
        {
          cwd: clientRoot,
          env: {
            ...process.env,
            ADMIN_AUTH_REAL_E2E: "1",
            ADMIN_AUTH_REAL_API_BASE_URL: `${baseUrl}/api`,
            ADMIN_AUTH_REAL_USERNAME: users.get("SUPER_ADMIN")!.username,
            ADMIN_AUTH_REAL_PASSWORD: loginPassword,
            PLAYWRIGHT_BASE_URL: frontOrigin,
            PLAYWRIGHT_PORT: String(frontPort),
            VITE_USE_MOCK: "false",
          },
        },
      );
      const safeBrowserOutput = browserRun.output
        .replaceAll(loginPassword, "[REDACTED]")
        .replaceAll(users.get("SUPER_ADMIN")!.username, "[SYNTHETIC_USER]");
      assert.equal(
        browserRun.status,
        0,
        `真实浏览器鉴权失败\n${safeBrowserOutput.slice(-8_000)}`,
      );
      assert.match(safeBrowserOutput, /1 passed/);

      // 再在独立子进程以真实 AppModule 启动一条隔离数据库烟测，覆盖生产模块注册、
      // 全局 Guard 顺序与 ThrottlerGuard。子进程只接收白名单环境且 cwd 位于临时目录，
      // 避免读取工作区 .env 或连接任何第三方服务配置。
      productionTempDir = resolve(serverRoot, `.auth-production-${marker}`);
      mkdirSync(productionTempDir, { recursive: true });
      const productionStart = await startProductionApp({
        serverRoot,
        cwd: productionTempDir,
        databaseUrl: databaseUrl!,
        jwtSecret,
        corsOrigin: frontOrigin,
      });
      productionProcess = productionStart.child;
      const productionPort = productionStart.port;
      const productionBaseUrl = `http://127.0.0.1:${productionPort}`;
      const productionCall = async (
        path: string,
        init: {
          method?: string;
          body?: unknown;
          headers?: Record<string, string>;
          jar?: CookieJar;
        } = {},
      ): Promise<JsonResult> => {
        const headers = new Headers(init.headers);
        const cookie = init.jar?.header();
        if (cookie) headers.set("Cookie", cookie);
        if (init.body !== undefined) headers.set("Content-Type", "application/json");
        const response = await fetch(`${productionBaseUrl}${path}`, {
          method: init.method ?? "GET",
          headers,
          body: init.body === undefined ? undefined : JSON.stringify(init.body),
        });
        const setCookies = readSetCookies(response);
        init.jar?.capture(response);
        const body = await response.json().catch(() => null);
        return { response, body, setCookies };
      };

      const productionJar = new CookieJar();
      const productionLogin = await productionCall("/api/auth/login", {
        method: "POST",
        jar: productionJar,
        headers: { Origin: frontOrigin, "X-Session-Mode": "cookie" },
        body: {
          username: users.get("SUPER_ADMIN")!.username,
          password: loginPassword,
        },
      });
      assert.equal(productionLogin.response.status, 201);
      assert.equal(
        (await productionCall("/api/auth/profile", { jar: productionJar })).response.status,
        200,
      );
      assert.equal(
        (
          await productionCall("/api/auth/session/refresh", {
            method: "POST",
            jar: productionJar,
            headers: { Origin: frontOrigin },
          })
        ).response.status,
        403,
      );

      const throttledStatuses: number[] = [];
      for (let index = 0; index < 5; index += 1) {
        throttledStatuses.push(
          (
            await productionCall("/api/auth/login", {
              method: "POST",
              headers: { Origin: frontOrigin },
              body: {
                username: `missing-${marker}`,
                password: loginPassword,
              },
            })
          ).response.status,
        );
      }
      assert.equal(throttledStatuses[0], 401);
      assert.equal(throttledStatuses.at(-1), 429);
    } finally {
      await stopChild(viteProcess);
      if (browserTempDir) rmSync(browserTempDir, { recursive: true, force: true });
      await stopChild(productionProcess);
      if (productionTempDir) rmSync(productionTempDir, { recursive: true, force: true });
      if (appStarted) await app.close();
      if (customerId !== undefined) await prisma.customer.deleteMany({ where: { id: customerId } });
      if (users.size > 0) {
        const userIds = [...users.values()].map((user) => user.id);
        await prisma.operationLog.deleteMany({ where: { userId: { in: userIds } } });
        await prisma.user.deleteMany({ where: { id: { in: userIds } } });
      }
      await prisma.$disconnect();
      if (previousNodeEnv === undefined) delete process.env.NODE_ENV;
      else process.env.NODE_ENV = previousNodeEnv;
      if (previousCorsOrigin === undefined) delete process.env.CORS_ORIGIN;
      else process.env.CORS_ORIGIN = previousCorsOrigin;
      if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousDatabaseUrl;
      if (previousJwtSecret === undefined) delete process.env.JWT_SECRET;
      else process.env.JWT_SECRET = previousJwtSecret;
    }
  },
);
