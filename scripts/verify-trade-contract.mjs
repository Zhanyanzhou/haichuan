// 交易域关键链路跨层静态契约测试
// 验证：前端类型/API/路由权限与后端 DTO/Controller/角色一致；
//       客户认证旁通、下单入口职责、结算契约对齐、DIRECT_PURCHASE 校验。
// 运行：node scripts/verify-trade-contract.mjs

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel) => readFile(path.join(root, rel), "utf8");

function tokenizeNginx(source) {
  const tokens = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    if (char === "#") {
      while (index < source.length && source[index] !== "\n") index += 1;
      continue;
    }
    if ("{};".includes(char)) {
      tokens.push({
        value: char,
        quoted: false,
        structural: true,
        start: index,
        end: index + 1,
      });
      index += 1;
      continue;
    }
    if (char === '"' || char === "'") {
      const start = index;
      const quote = char;
      let value = "";
      let closed = false;
      index += 1;
      while (index < source.length) {
        if (source[index] === "\\" && index + 1 < source.length) {
          value += source[index + 1];
          index += 2;
          continue;
        }
        if (source[index] === quote) {
          index += 1;
          closed = true;
          break;
        }
        value += source[index];
        index += 1;
      }
      assert.ok(closed, "Nginx 配置含未闭合字符串");
      tokens.push({ value, quoted: true, structural: false, start, end: index });
      continue;
    }

    const start = index;
    while (
      index < source.length &&
      !/\s/.test(source[index]) &&
      !"{};#".includes(source[index])
    ) {
      index += 1;
    }
    tokens.push({
      value: source.slice(start, index),
      quoted: false,
      structural: false,
      start,
      end: index,
    });
  }
  return tokens;
}

function parseNginx(source) {
  const tokens = tokenizeNginx(source);
  let index = 0;

  function parseNodes(expectClosingBrace) {
    const nodes = [];
    while (index < tokens.length) {
      if (tokens[index].structural && tokens[index].value === "}") {
        assert.ok(expectClosingBrace, "Nginx 配置含多余右花括号");
        index += 1;
        return nodes;
      }

      const head = [];
      const start = tokens[index].start;
      while (index < tokens.length && !tokens[index].structural) {
        head.push(tokens[index]);
        index += 1;
      }
      assert.ok(head.length > 0, "Nginx 配置含空指令");
      assert.ok(index < tokens.length, `Nginx 指令 ${head[0].value} 未结束`);
      const terminator = tokens[index];
      index += 1;
      assert.notEqual(terminator.value, "}", `Nginx 指令 ${head[0].value} 缺少结束符`);

      if (terminator.value === ";") {
        nodes.push({
          name: head[0].value,
          nameToken: head[0],
          args: head.slice(1),
          children: null,
          start,
          end: terminator.end,
        });
        continue;
      }

      assert.equal(terminator.value, "{", `Nginx 指令 ${head[0].value} 结构无效`);
      const children = parseNodes(true);
      nodes.push({
        name: head[0].value,
        nameToken: head[0],
        args: head.slice(1),
        children,
        start,
        end: tokens[index - 1].end,
      });
    }
    assert.ok(!expectClosingBrace, "Nginx 配置缺少右花括号");
    return nodes;
  }

  return parseNodes(false);
}

function parseCspDirectives(policy) {
  const directives = new Map();
  for (const segment of policy.split(";")) {
    const parts = segment.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) continue;
    const name = parts[0].toLowerCase();
    assert.ok(!directives.has(name), `CSP 指令不可重复：${name}`);
    directives.set(name, parts.slice(1));
  }
  return directives;
}

function collectNginxNodes(nodes, predicate, depth = 0, matches = [], parent = null) {
  for (const node of nodes) {
    if (predicate(node)) matches.push({ node, depth, parent });
    if (node.children) {
      collectNginxNodes(node.children, predicate, depth + 1, matches, node);
    }
  }
  return matches;
}

function parseListenPort(value) {
  if (!/^[0-9]+$/.test(value)) return null;
  const port = Number(value);
  return port >= 1 && port <= 65535 ? port : null;
}

function isValidIpv4(value) {
  const parts = value.split(".");
  return (
    parts.length === 4 &&
    parts.every(
      (part) =>
        /^[0-9]+$/.test(part) &&
        Number(part) >= 0 &&
        Number(part) <= 255,
    )
  );
}

function isValidHostname(value) {
  if (value.length === 0) return false;
  const hostname = value.endsWith(".") ? value.slice(0, -1) : value;
  if (!hostname || hostname.length > 253) return false;
  return hostname.split(".").every(
    (label) =>
      label.length >= 1 &&
      label.length <= 63 &&
      /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/.test(label),
  );
}

function classifyNginxListenEndpoint(value) {
  if (value !== value.trim()) {
    return { kind: "invalid", reason: "surrounding-whitespace" };
  }
  const endpoint = value;
  if (!endpoint) return { kind: "invalid", reason: "empty" };
  if (endpoint.startsWith("unix:")) {
    return { kind: "unix", path: endpoint.slice("unix:".length) };
  }
  if (endpoint.includes("://")) {
    return { kind: "invalid", reason: "uri-scheme" };
  }
  const directPort = parseListenPort(endpoint);
  if (directPort !== null) {
    return { kind: "tcp", hostType: "port", host: null, port: directPort };
  }
  if (endpoint === "*") {
    return { kind: "tcp", hostType: "wildcard", host: "*", port: 80 };
  }
  if (endpoint.startsWith("*:")) {
    const port = parseListenPort(endpoint.slice(2));
    return port === null
      ? { kind: "invalid", reason: "wildcard-port" }
      : { kind: "tcp", hostType: "wildcard", host: "*", port };
  }
  if (endpoint.startsWith("[")) {
    const bracketEnd = endpoint.indexOf("]");
    if (bracketEnd <= 1 || bracketEnd !== endpoint.lastIndexOf("]")) {
      return { kind: "invalid", reason: "ipv6-brackets" };
    }
    const host = endpoint.slice(1, bracketEnd);
    if (host.includes("%")) {
      return { kind: "invalid", reason: "ipv6-zone" };
    }
    const suffix = endpoint.slice(bracketEnd + 1);
    const port = suffix === "" ? 80 : suffix.startsWith(":") ? parseListenPort(suffix.slice(1)) : null;
    return isIP(host) === 6 && port !== null
      ? { kind: "tcp", hostType: "ipv6", host, port }
      : { kind: "invalid", reason: "ipv6-or-port" };
  }

  const firstColon = endpoint.indexOf(":");
  if (firstColon === -1) {
    if (isValidIpv4(endpoint)) {
      return { kind: "tcp", hostType: "ipv4", host: endpoint, port: 80 };
    }
    if (/^[0-9.]+$/.test(endpoint)) {
      return { kind: "invalid", reason: "ipv4-or-port" };
    }
    return isValidHostname(endpoint)
      ? { kind: "tcp", hostType: "hostname", host: endpoint, port: 80 }
      : { kind: "invalid", reason: "hostname" };
  }
  if (firstColon <= 0 || firstColon !== endpoint.lastIndexOf(":")) {
    return { kind: "invalid", reason: "host-port-shape" };
  }
  const host = endpoint.slice(0, firstColon);
  const port = parseListenPort(endpoint.slice(firstColon + 1));
  if (port === null) return { kind: "invalid", reason: "port" };
  if (isValidIpv4(host)) return { kind: "tcp", hostType: "ipv4", host, port };
  if (/^[0-9.]+$/.test(host)) return { kind: "invalid", reason: "ipv4" };
  if (isValidHostname(host)) return { kind: "tcp", hostType: "hostname", host, port };
  return { kind: "invalid", reason: "hostname" };
}

function validateNginxListen(node) {
  assert.ok(node.args.length >= 1, "listen 必须声明 endpoint");
  const endpoint = classifyNginxListenEndpoint(node.args[0].value);
  assert.equal(endpoint.kind, "tcp", `listen 只允许合法 TCP endpoint：${node.args[0].value}`);

  const allowedFlags = new Set([
    "default_server",
    "reuseport",
    "ssl",
    "http2",
    "bind",
  ]);
  const seen = new Set();
  for (const token of node.args.slice(1)) {
    const parameter = token.value;
    const separator = parameter.indexOf("=");
    const parameterName = separator === -1 ? parameter : parameter.slice(0, separator);
    assert.ok(parameterName, `listen 参数名不可为空：${parameter}`);
    assert.ok(!seen.has(parameterName), `listen 参数不可重复：${parameterName}`);
    seen.add(parameterName);
    if (allowedFlags.has(parameter)) continue;
    if (parameterName === "ipv6only" && separator !== -1) {
      assert.equal(endpoint.hostType, "ipv6", "ipv6only 只能用于 IPv6 endpoint");
      assert.ok(
        parameter === "ipv6only=on" || parameter === "ipv6only=off",
        "ipv6only 只允许 on 或 off",
      );
      continue;
    }
    assert.fail(`listen 参数不在当前 Nginx 1.27 合同 allowlist：${parameter}`);
  }
  return endpoint;
}

function resolveTrustedCsp(source) {
  const nodes = parseNginx(source);
  const servers = collectNginxNodes(nodes, (node) => node.name === "server");
  const listeners = collectNginxNodes(nodes, (node) => node.name === "listen").map(
    (entry) => {
      assert.equal(entry.depth, 1, "listen 只能是配置顶层 server 的直属子节点");
      assert.equal(entry.parent?.name, "server", "listen 的直属父节点必须是 server");
      const serverEntry = servers.find(({ node }) => node === entry.parent);
      assert.equal(serverEntry?.depth, 0, "listen 所属 server 必须位于配置顶层");
      return {
        endpoint: validateNginxListen(entry.node),
        listener: entry.node,
        server: entry.parent,
      };
    },
  );
  const trustedListeners = listeners.filter(({ endpoint }) => endpoint.port === 8081);
  assert.equal(trustedListeners.length, 1, "全配置必须且只能声明一个 8081 监听端点");
  const { listener, server: trustedServer } = trustedListeners[0];

  const allHeaders = collectNginxNodes(
    trustedServer.children,
    (node) => node.name === "add_header",
  );
  assert.equal(
    allHeaders.filter(({ depth }) => depth > 0).length,
    0,
    "可信 8081 server 的后代块不可声明 add_header，以免覆盖安全头继承",
  );
  const cspHeaders = allHeaders.filter(
    ({ node }) => node.args[0]?.value.toLowerCase() === "content-security-policy",
  );
  assert.equal(cspHeaders.length, 1, "可信 8081 server 必须且只能绑定一个 CSP header");
  const header = cspHeaders[0].node;
  assert.equal(header.args.length, 3, "CSP header 必须包含值和 always");
  assert.equal(header.args[2].value, "always", "CSP header 必须在所有响应上生效");

  const valueToken = header.args[1];
  if (!valueToken.value.startsWith("$")) {
    assert.ok(valueToken.quoted, "字面量 CSP 必须使用引号包裹");
    return {
      policy: valueToken.value,
      policyToken: valueToken,
      header,
      map: null,
      policies: [{ selector: "literal", policy: valueToken.value, policyToken: valueToken }],
      listener,
      server: trustedServer,
      source: "literal",
    };
  }

  assert.equal(
    valueToken.value,
    "$hc_content_security_policy",
    "可信 8081 server 必须绑定受控 CSP map 变量",
  );
  const maps = collectNginxNodes(
    nodes,
    (node) => node.name === "map" && node.args[1]?.value === valueToken.value,
  );
  assert.equal(maps.length, 1, "CSP 输出变量必须由唯一 map 定义");
  assert.equal(maps[0].depth, 0, "CSP map 必须位于配置顶层");
  const cspMap = maps[0].node;
  assert.equal(cspMap.args.length, 2, "CSP map 参数数量无效");
  assert.equal(cspMap.args[0].value, "$uri", "CSP map 输入变量必须为 $uri");
  const defaults = cspMap.children.filter((node) => node.name === "default");
  assert.equal(defaults.length, 1, "CSP map 必须有且仅有一个 default 分支");
  const policies = cspMap.children.map((node) => {
    assert.equal(node.children, null, `CSP map 分支不可嵌套：${node.name}`);
    assert.equal(node.args.length, 1, `CSP map 分支结构无效：${node.name}`);
    assert.ok(node.args[0].quoted, `CSP map 策略必须使用引号包裹：${node.name}`);
    return {
      selector: node.name,
      selectorToken: node.nameToken,
      policy: node.args[0].value,
      policyToken: node.args[0],
    };
  });
  return {
    policy: defaults[0].args[0].value,
    policyToken: defaults[0].args[0],
    header,
    listener,
    map: cspMap,
    policies,
    server: trustedServer,
    source: "map",
  };
}

function validateControlledImageCsp(source) {
  const resolved = resolveTrustedCsp(source);
  for (const entry of resolved.policies) {
    const directives = parseCspDirectives(entry.policy);
    const blobOwners = [...directives]
      .filter(([, values]) => values.includes("blob:"))
      .map(([name]) => name)
      .sort();
    if (entry.selector === "default" || entry.selector === "literal") {
      assert.ok(directives.has("img-src"), "通用 CSP 必须显式声明 img-src");
      assert.deepEqual(blobOwners, ["img-src"], "通用 CSP 的 blob: 只能由 img-src 使用");
    } else {
      assert.ok(
        blobOwners.every((name) => name === "img-src"),
        `CSP 特例 ${entry.selector} 不可在 img-src 外使用 blob:`,
      );
    }
  }
  return resolved;
}

function replaceRange(source, tokenOrNode, replacement) {
  return `${source.slice(0, tokenOrNode.start)}${replacement}${source.slice(tokenOrNode.end)}`;
}

function insertBeforeBlockClose(source, node, addition) {
  assert.equal(source[node.end - 1], "}", `Nginx 块 ${node.name} 缺少结束位置`);
  return `${source.slice(0, node.end - 1)}${addition}${source.slice(node.end - 1)}`;
}

function mutateCspDirective(policy, directiveName, mutateSources) {
  let changed = false;
  const next = policy
    .split(";")
    .map((segment) => {
      const parts = segment.trim().split(/\s+/).filter(Boolean);
      if (parts[0]?.toLowerCase() !== directiveName) return segment;
      changed = true;
      return [parts[0], ...mutateSources(parts.slice(1))].join(" ");
    })
    .join(";");
  assert.ok(changed, `fixture 未找到 CSP 指令：${directiveName}`);
  return next;
}

function addCspSource(policy, directiveName, source) {
  if (parseCspDirectives(policy).has(directiveName)) {
    return mutateCspDirective(policy, directiveName, (sources) => [
      ...sources,
      source,
    ]);
  }
  const separator = policy.trimEnd().endsWith(";") ? " " : "; ";
  return `${policy}${separator}${directiveName} ${source}`;
}

async function readExportedTypeSurface(entry, visited = new Set()) {
  const normalized = entry.replaceAll("\\", "/");
  if (visited.has(normalized)) return "";
  visited.add(normalized);
  const source = await readSrc(normalized);
  const chunks = [source];
  for (const match of source.matchAll(
    /export\s+(?:type\s+)?\*\s+from\s+["'](\.[^"']+)["']/g,
  )) {
    const target = path.posix.normalize(
      path.posix.join(path.posix.dirname(normalized), `${match[1]}.ts`),
    );
    chunks.push(await readExportedTypeSurface(target, visited));
  }
  return chunks.join("\n");
}

let passed = 0;
function check(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    process.exitCode = 1;
  }
}

console.log("交易域跨层静态契约测试\n");

// ── 客户认证旁通（验收项 #1/#2：登录客户可下单，未登录不可）──
const customersController = await readSrc(
  "server/src/modules/customers/customers.controller.ts",
);
const customersService = await readSrc(
  "server/src/modules/customers/customers.service.ts",
);
const customerApi = await readSrc("client/src/services/api.ts");
const customerAfterSalesController = await readSrc(
  "server/src/modules/after-sales/customer-after-sales.controller.ts",
);
const afterSalesDto = await readSrc(
  "server/src/modules/after-sales/dto/after-sales.dto.ts",
);
const afterSalesService = await readSrc(
  "server/src/modules/after-sales/after-sales.service.ts",
);
const uploadController = await readSrc(
  "server/src/modules/upload/upload.controller.ts",
);
const uploadService = await readSrc(
  "server/src/modules/upload/upload.service.ts",
);
const mediaStoragePaths = await readSrc(
  "server/src/modules/upload/media-storage-paths.ts",
);
const publicUploadsGateway = await readSrc(
  "server/src/modules/upload/public-uploads.gateway.ts",
);
const uploadModule = await readSrc(
  "server/src/modules/upload/upload.module.ts",
);
const nginxConfig = await readSrc("client/nginx.conf");
const composeConfig = await readSrc("docker-compose.yml");

check(
  "客户接口：所有 CustomerAuthGuard 端点均有 @Public()（绕过全局 JwtAuthGuard）",
  () => {
    // 每个含 CustomerAuthGuard 的方法前必须有 @Public()
    const methodsWithGuard =
      customersController.match(/@UseGuards\([^)]*CustomerAuthGuard[^)]*\)/g) ||
      [];
    const publicGuardedBlocks =
      customersController.match(
        /@Public\(\)\s*@UseGuards\([^)]*CustomerAuthGuard[^)]*\)/g,
      ) || [];
    assert.ok(
      methodsWithGuard.length >= 11,
      `CustomerAuthGuard 端点应≥11 个，实际 ${methodsWithGuard.length}`,
    );
    assert.equal(
      publicGuardedBlocks.length,
      methodsWithGuard.length,
      `@Public() 必须紧邻覆盖所有 CustomerAuthGuard 端点（已覆盖 ${publicGuardedBlocks.length}/${methodsWithGuard.length}）`,
    );
  },
);

check("结算接口：使用 CustomerAuthGuard（登录客户才能下单）", () => {
  const checkoutBlock = customersController.match(
    /@Public\(\)\s*@UseGuards\([^)]*CustomerAuthGuard[^)]*\)[\s\S]*?@Post\(['"]checkout['"]\)[\s\S]*?checkout\(/,
  );
  assert.ok(checkoutBlock, "未找到 checkout 路由");
  assert.ok(
    checkoutBlock[0].includes("CustomerAuthGuard"),
    "checkout 必须用 CustomerAuthGuard",
  );
  assert.ok(
    checkoutBlock[0].includes("@Public()"),
    "checkout 必须有 @Public()",
  );
});

check("客户账户：订单号不可兑换访问令牌", () => {
  assert.ok(
    !customersController.includes("@Post('order-access')"),
    "不得暴露 order-access 接口",
  );
  assert.ok(
    !customersService.includes("accessByOrder"),
    "订单号不可用于签发客户访问令牌",
  );
  assert.ok(
    !customerApi.includes("accessByOrder"),
    "前端不可调用订单号访问接口",
  );
});

check("客户售后：本人认证入口与后台售后入口隔离", () => {
  assert.ok(
    customerAfterSalesController.includes("@UseGuards(CustomerAuthGuard)"),
    "客户售后必须使用 CustomerAuthGuard",
  );
  assert.ok(
    customerAfterSalesController.includes("@Public()"),
    "客户售后必须绕过后台全局 JWT 后再执行客户认证",
  );
  assert.ok(
    !customerAfterSalesController.includes("CustomerCommerceGuard"),
    "交易暂停时仍应允许客户查看并处理历史售后",
  );
});

check("客户售后：DTO 只接收订单商品、类型和原因", () => {
  const customerDto = afterSalesDto.match(
    /export class CreateCustomerAfterSalesDto \{[\s\S]*?\n\}/,
  )?.[0];
  assert.ok(customerDto, "缺少 CreateCustomerAfterSalesDto");
  for (const field of ["orderItemId", "type", "reason"]) {
    assert.ok(customerDto.includes(field), `客户售后 DTO 缺少 ${field}`);
  }
  for (const field of [
    "customerId",
    "requestedRefundAmount",
    "evidenceUrls",
    "adminNote",
  ]) {
    assert.ok(!customerDto.includes(field), `客户售后 DTO 不可含 ${field}`);
  }
});

check("客户售后：服务端校验归属、商品、状态并串行化重复申请", () => {
  assert.ok(afterSalesService.includes("await this.lockOrder(tx, orderId)"));
  assert.ok(afterSalesService.includes("where: { id: orderId, customerId }"));
  assert.ok(afterSalesService.includes("item.id === data.orderItemId"));
  assert.ok(afterSalesService.includes("ACTIVE_AFTER_SALES_STATUSES"));
  assert.ok(afterSalesService.includes("requestedRefundAmount: null"));
});

check("付款凭证：新上传文件使用私有存储且读取需要鉴权", () => {
  const paymentProofUpload = uploadController.match(
    /@Post\('payment-proof'\)[\s\S]*?async uploadPaymentProof[\s\S]*?\n  \}/,
  );
  assert.ok(
    paymentProofUpload?.[0].includes("uploadPrivatePaymentProof"),
    "付款凭证上传必须进入私有存储方法",
  );
  assert.ok(
    uploadController.includes("@Get('payment-proofs/:orderId')"),
    "客户读取付款凭证必须经过受保护接口",
  );
  assert.ok(
    mediaStoragePaths.includes(
      "paymentProofRoot: resolve(process.env.PAYMENT_PROOF_MEDIA_ROOT || resolve(cwd, 'private-media', 'payment-proofs'))",
    ) && uploadService.includes("this.paymentProofRoot"),
    "付款凭证不可保存到公开 uploads 目录",
  );
  assert.ok(
    !paymentProofUpload?.[0].includes("uploadFile(file)"),
    "付款凭证不可复用公开上传接口",
  );
});

check("静态上传文件：缺失资源不触发 SPA 回退", () => {
  assert.ok(
    uploadModule.includes("PublicUploadsGateway")
      && publicUploadsGateway.includes("app.use('/uploads'")
      && publicUploadsGateway.includes("index: false")
      && !uploadModule.includes("ServeStaticModule"),
    "uploads 必须由禁用目录 index 的专用网关处理，不能挂入 SPA ServeStaticModule",
  );
});

check("受控图片：CSP 允许 Blob URL，且范围限定在 img-src", () => {
  const resolved = validateControlledImageCsp(nginxConfig);
  const withListenEndpoint = (endpoint) =>
    replaceRange(nginxConfig, resolved.listener.args[0], endpoint);
  const withListenDirective = (directive) =>
    replaceRange(nginxConfig, resolved.listener, directive);
  const withAdditionalListenEndpoint = (endpoint) =>
    insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      `\n  listen ${endpoint};\n`,
    );
  const withDuplicateListenEndpoints = (first, second) => {
    const duplicated = insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      `\n  listen ${second};\n`,
    );
    return replaceRange(duplicated, resolved.listener.args[0], first);
  };

  const withPolicy = (policy) =>
    replaceRange(nginxConfig, resolved.policyToken, JSON.stringify(policy));
  const maxLengthHostname = [
    "a".repeat(63),
    "b".repeat(63),
    "c".repeat(63),
    "d".repeat(61),
  ].join(".");
  const overlongHostname = `${maxLengthHostname}d`;
  assert.equal(maxLengthHostname.length, 253, "最大 hostname fixture 必须为 253 字符");
  assert.equal(overlongHostname.length, 254, "超长 hostname fixture 必须为 254 字符");
  const invalidFixtures = [
    [
      "删除 img-src blob:",
      withPolicy(
        mutateCspDirective(resolved.policy, "img-src", (sources) =>
          sources.filter((source) => source !== "blob:"),
        ),
      ),
    ],
    ...["default-src", "script-src", "media-src"].map((directive) => [
      `${directive} 增加 blob:`,
      withPolicy(
        mutateCspDirective(resolved.policy, directive, (sources) => [
          ...sources,
          "blob:",
        ]),
      ),
    ]),
    [
      "绑定错误变量",
      replaceRange(
        nginxConfig,
        resolved.header.args[1],
        "$hc_wrong_content_security_policy",
      ),
    ],
    ["移除 always", replaceRange(nginxConfig, resolved.header.args[2], "")],
    ["移除 CSP header 绑定", replaceRange(nginxConfig, resolved.header, "")],
    [
      "注释伪装 CSP header",
      replaceRange(
        nginxConfig,
        resolved.header,
        "# add_header Content-Security-Policy $hc_content_security_policy always;",
      ),
    ],
    [
      "字符串伪装 CSP header",
      replaceRange(
        nginxConfig,
        resolved.header,
        'set $csp_decoy "add_header Content-Security-Policy $hc_content_security_policy always;";',
      ),
    ],
  ];
  if (resolved.map) {
    const specialPolicy = resolved.policies.find(
      (entry) => entry.selector !== "default",
    );
    assert.ok(specialPolicy, "当前 CSP map 必须保留路径特例 fixture");
    for (const directive of ["default-src", "script-src", "media-src"]) {
      invalidFixtures.push([
        `路径特例 ${directive} 增加 blob:`,
        replaceRange(
          nginxConfig,
          specialPolicy.policyToken,
          JSON.stringify(addCspSource(specialPolicy.policy, directive, "blob:")),
        ),
      ]);
    }

    const mapSource = nginxConfig.slice(resolved.map.start, resolved.map.end);
    const relativeInputToken = {
      start: resolved.map.args[0].start - resolved.map.start,
      end: resolved.map.args[0].end - resolved.map.start,
    };
    const secondMap = replaceRange(mapSource, relativeInputToken, "$request_uri");
    invalidFixtures.push([
      "第二个同输出变量 CSP map",
      `${nginxConfig.slice(0, resolved.map.end)}\n${secondMap}${nginxConfig.slice(resolved.map.end)}`,
    ]);
    invalidFixtures.push([
      "移除 CSP map",
      replaceRange(nginxConfig, resolved.map, ""),
    ]);
    invalidFixtures.push([
      "后代块内第二个同输出变量 CSP map",
      insertBeforeBlockClose(
        nginxConfig,
        resolved.server,
        `\n  location = /__csp_nested_map_fixture__ {\n${secondMap}\n  }\n`,
      ),
    ]);
  }
  invalidFixtures.push([
    "location 嵌套 CSP header",
    insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      '\n  location = /__csp_nested_fixture__ {\n    add_header Content-Security-Policy $hc_content_security_policy always;\n  }\n',
    ),
  ]);
  invalidFixtures.push([
    "location 嵌套非 CSP add_header",
    insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      '\n  location = /__header_inheritance_fixture__ {\n    add_header X-QA-Probe "1" always;\n  }\n',
    ),
  ]);
  for (const [first, second] of [
    ["8081", "8081"],
    ["8081", "0.0.0.0:8081"],
    ["8081", "*:8081"],
    ["8081", "[::]:8081"],
    ["*:8081", "[::]:8081"],
  ]) {
    invalidFixtures.push([
      `重复 8081 监听 ${first} + ${second}`,
      withDuplicateListenEndpoints(first, second),
    ]);
  }
  for (const endpoint of [
    "unix:8081",
    "http://localhost:8081",
    "::8081",
    "[not-ipv6]:8081",
    "0.0.0.0:",
    "[::8081",
    ":8081",
    "999.0.0.1:8081",
    "-invalid.example:8081",
    "0",
    "65536",
    "[fe80::1%eth0]:8081",
    "[fe80::1%25eth0]:8081",
    "unix:/tmp/nginx.sock",
    "$listen_host",
    "$listen_host:8081",
    `${maxLengthHostname}..:8081`,
    `${overlongHostname}:8081`,
  ]) {
    invalidFixtures.push([
      `非法 listen endpoint ${endpoint}`,
      withListenEndpoint(endpoint),
    ]);
  }
  invalidFixtures.push(["listen 缺少 endpoint", withListenDirective("listen;")]);
  invalidFixtures.push([
    "未知 listen 参数",
    withListenDirective("listen 8081 unknown_parameter;"),
  ]);
  invalidFixtures.push([
    "非法 ipv6only 参数值",
    withListenDirective("listen [::]:8081 ipv6only=maybe;"),
  ]);
  invalidFixtures.push([
    "重复 ipv6only 参数键",
    withListenDirective("listen [::]:8081 ipv6only=on ipv6only=off;"),
  ]);
  invalidFixtures.push([
    "非 IPv6 endpoint 使用 ipv6only",
    withListenDirective("listen 8081 ipv6only=on;"),
  ]);
  invalidFixtures.push([
    "非 8081 非法 endpoint",
    insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      "\n  listen http://localhost:8080;\n",
    ),
  ]);
  for (const endpoint of ["[fe80::1%eth0]:8080", "[fe80::1%25eth0]:8080"]) {
    invalidFixtures.push([
      `额外监听拒绝 IPv6 zone ${endpoint}`,
      withAdditionalListenEndpoint(endpoint),
    ]);
  }
  for (const endpoint of [" 8081 ", "localhost:8081 "]) {
    invalidFixtures.push([
      `引号内首尾空白 endpoint ${JSON.stringify(endpoint)}`,
      withListenEndpoint(JSON.stringify(endpoint)),
    ]);
  }
  invalidFixtures.push([
    "引号内参数不可混入 endpoint",
    withListenDirective('listen "localhost:8081 default_server";'),
  ]);
  invalidFixtures.push([
    "location 内第二个 8081 监听",
    insertBeforeBlockClose(
      nginxConfig,
      resolved.server,
      "\n  location = /__nested_listen_fixture__ {\n    listen 8081;\n  }\n",
    ),
  ]);
  invalidFixtures.push(["配置根级第二个 8081 监听", `${nginxConfig}\nlisten 8081;\n`]);
  invalidFixtures.push(["外层块包裹唯一可信 server", `http {\n${nginxConfig}\n}\n`]);

  for (const [name, fixture] of invalidFixtures) {
    assert.notEqual(fixture, nginxConfig, `${name} fixture 必须真实改变配置`);
    assert.throws(
      () => validateControlledImageCsp(fixture),
      undefined,
      `${name} 必须被 CSP 合同拒绝`,
    );
  }

  const positiveFixtures = [
    ...[
      "0.0.0.0:8081",
      "127.0.0.1:8081",
      "*:8081",
      "localhost:8081",
      "edge.example.com:8081",
      "[::]:8081",
      "[2001:db8::1]:8081",
    ].map((endpoint) => [
      `唯一等价监听 ${endpoint}`,
      withListenEndpoint(endpoint),
    ]),
    ["引号 hostname 监听", withListenEndpoint(JSON.stringify("localhost:8081"))],
    [
      "引号 hostname 与独立参数",
      withListenDirective('listen "localhost:8081" default_server;'),
    ],
    [
      "允许的无值 listen 参数",
      withListenDirective("listen 8081 default_server reuseport ssl http2 bind;"),
    ],
    [
      "允许的 IPv6 ipv6only 参数",
      withListenDirective("listen [::]:8081 ipv6only=on;"),
    ],
    ...["127.0.0.1", "localhost", "[2001:db8::1]", "*"].map((endpoint) => [
      `额外 address-only 监听 ${endpoint} 默认端口 80`,
      withAdditionalListenEndpoint(endpoint),
    ]),
    [
      "253 字符 hostname 加单个尾点",
      withListenEndpoint(`${maxLengthHostname}.:8081`),
    ],
  ];
  if (resolved.map) {
    const specialPolicy = resolved.policies.find(
      (entry) => entry.selector !== "default",
    );
    assert.ok(specialPolicy, "当前 CSP map 必须保留路径特例正例");
    positiveFixtures.push([
      "selector 前置注释",
      `${nginxConfig.slice(0, specialPolicy.selectorToken.start)}# selector fixture\n  ${nginxConfig.slice(specialPolicy.selectorToken.start)}`,
    ]);
    positiveFixtures.push([
      "引号 selector",
      replaceRange(
        nginxConfig,
        specialPolicy.selectorToken,
        JSON.stringify(specialPolicy.selector),
      ),
    ]);
    const escapedSelector = specialPolicy.selector.replace("/", "\\/");
    assert.notEqual(escapedSelector, specialPolicy.selector, "转义 selector fixture 必须可构造");
    positiveFixtures.push([
      "转义 selector",
      replaceRange(nginxConfig, specialPolicy.selectorToken, escapedSelector),
    ]);

    const literalHeader = replaceRange(
      nginxConfig,
      resolved.header.args[1],
      JSON.stringify(resolved.policy),
    );
    const legacyLiteralFixture = replaceRange(literalHeader, resolved.map, "");
    positiveFixtures.push(["旧字面量 CSP header", legacyLiteralFixture]);
  }
  for (const [name, fixture] of positiveFixtures) {
    assert.notEqual(fixture, nginxConfig, `${name} fixture 必须真实改变配置`);
    assert.doesNotThrow(
      () => validateControlledImageCsp(fixture),
      `${name} 必须被 CSP 合同接受`,
    );
  }
  console.log(
    `    ↳ ${invalidFixtures.length}/${invalidFixtures.length} 个负向变异被拒绝，${positiveFixtures.length}/${positiveFixtures.length} 个等价正例被接受；全部 changed=true`,
  );
});

check("Redis：已移除（OR 批决策，服务端零消费方）", () => {
  assert.ok(
    !/^\s*redis:\s*$/m.test(composeConfig),
    "Compose 不应再定义 redis 服务（queue 已删，无消费方）",
  );
  assert.ok(
    !composeConfig.includes("REDIS_URL"),
    "Compose 不应再拼接 Redis 连接地址",
  );
  assert.ok(
    !composeConfig.includes("REDIS_PASSWORD"),
    "Compose 不应再传递 Redis 密码",
  );
});

// ── 结算契约对齐（验收项 #3）──
const checkoutDto = await readSrc(
  "server/src/modules/customers/dto/checkout.dto.ts",
);
check(
  "结算 DTO：不收集 customerName/customerPhone/paymentMethod（后端从登录态取）",
  () => {
    assert.ok(
      !/customerName/.test(checkoutDto),
      "CheckoutDto 不可含 customerName",
    );
    assert.ok(
      !/customerPhone/.test(checkoutDto),
      "CheckoutDto 不可含 customerPhone",
    );
    assert.ok(
      !/paymentMethod/.test(checkoutDto),
      "CheckoutDto 不可含 paymentMethod",
    );
    assert.ok(checkoutDto.includes("address"), "CheckoutDto 必须含 address");
    assert.ok(checkoutDto.includes("items"), "CheckoutDto 必须含 items");
  },
);

const checkoutPage = await readSrc(
  "client/src/pages/public/Checkout/index.tsx",
);
check("结算页：前端不再提交后端忽略的 customerName/phone/paymentMethod", () => {
  // checkout 调用仅传 address/customerEmail/items
  const callMatch = checkoutPage.match(/customerApi\.checkout\(\{[\s\S]*?\}\)/);
  assert.ok(callMatch, "未找到 checkout 调用");
  assert.ok(callMatch[0].includes("address"), "前端必须提交 address");
  assert.ok(callMatch[0].includes("items"), "前端必须提交 items");
  assert.ok(
    !/values\.customerName/.test(checkoutPage),
    "前端不应传 customerName",
  );
});

// ── 下单入口职责（验收项 #4 前置：DIRECT_PURCHASE 校验）──
const ordersService = await readSrc(
  "server/src/modules/orders/orders.service.ts",
);
const productEligibility = await readSrc(
  "server/src/modules/products/product-eligibility.ts",
);
const directPurchaseBaseWhereBlock = productEligibility.match(
  /export function directPurchaseProductBaseWhere\(\): Prisma\.ProductWhereInput \{[\s\S]*?\n\}/,
)?.[0];
const directPurchaseCreateBlock = ordersService.match(
  /async create\(data:[\s\S]*?\n  async createFromQuotation/,
)?.[0];

check("下单：仅 DIRECT_PURCHASE 商品可下单（非直接购买被拒绝）", () => {
  assert.ok(
    ordersService.includes("directPurchaseProductBaseWhere") &&
      ordersService.includes("directPurchaseProductWhere"),
    "订单服务必须使用共享的直接购买商品门禁",
  );
  assert.ok(
    directPurchaseBaseWhereBlock &&
      /salesMode:\s*['"]DIRECT_PURCHASE['"]/.test(directPurchaseBaseWhereBlock),
    "必须校验 salesMode=DIRECT_PURCHASE",
  );
  assert.ok(
    /订单中包含不可直接购买的商品/.test(ordersService),
    "非 DIRECT_PURCHASE 必须有明确拒绝提示",
  );
});

check("下单：商品必须 PUBLISHED 且未软删除", () => {
  assert.ok(
    directPurchaseBaseWhereBlock &&
      /status:\s*['"]PUBLISHED['"]/.test(directPurchaseBaseWhereBlock),
    "必须校验商品 PUBLISHED",
  );
  assert.ok(
    directPurchaseBaseWhereBlock?.includes("deletedAt: null"),
    "必须过滤软删除商品",
  );
});

check("下单：SKU 必须 isActive", () => {
  assert.ok(ordersService.includes("isActive: true"), "必须校验 SKU isActive");
});

check("下单：库存不足时拒绝（无超卖）", () => {
  assert.ok(
    ordersService.includes("availableStock < quantity"),
    "必须校验库存充足",
  );
  assert.ok(/库存不足/.test(ordersService), "库存不足必须有明确提示");
});

check("固定价直购：成交价只认 SKU.price 且不读取金价", () => {
  assert.ok(directPurchaseCreateBlock, "未找到标准零售 create 方法");
  assert.ok(directPurchaseCreateBlock.includes("Number(sku.price)"), "固定价必须读取 ProductSKU.price");
  assert.ok(!directPurchaseCreateBlock.includes("goldPrice"), "固定价直购不得依赖金价查询");
  assert.ok(directPurchaseCreateBlock.includes("lockedGoldPrice: null"), "固定价订单不得伪造金价锁定语义");
});

// ── 双下单入口职责（DECISIONS D.7）──
const ordersController = await readSrc(
  "server/src/modules/orders/orders.controller.ts",
);
const manualCreateBlock = ordersController.match(
  /@ApiBearerAuth\(\)\s*@Roles\("SUPER_ADMIN", "ADMIN"\)\s*@Post\(\)[\s\S]*?create\(/,
);

check("后台建单：POST /orders 标注为非公开（后台人工建单）", () => {
  assert.ok(
    /后台人工建单|非公开/.test(ordersController),
    "POST /orders 必须标注为后台人工建单、非公开",
  );
  assert.ok(manualCreateBlock, "未找到后台建单路由");
  assert.ok(
    !manualCreateBlock[0].includes("@Public()"),
    "POST /orders 不可标注 @Public()",
  );
});

check("后台建单：POST /orders 限 SUPER_ADMIN/ADMIN（不含 EDITOR）", () => {
  assert.ok(manualCreateBlock, "未找到 create 路由");
  assert.ok(manualCreateBlock[0].includes("@Roles"), "create 必须有 @Roles");
  assert.ok(
    manualCreateBlock[0].includes("SUPER_ADMIN") &&
      manualCreateBlock[0].includes("ADMIN"),
    "create 限 SUPER_ADMIN/ADMIN",
  );
  assert.ok(
    !/@Roles\([^)]*EDITOR/.test(manualCreateBlock[0]),
    "create 不可含 EDITOR",
  );
});

// ── 角色权限一致性（验收项 #14）──
check("订单/付款控制器：EDITOR 无交易写权限", () => {
  // 类级 @Roles 含 EDITOR 吗？查看是否有方法级覆盖
  // OrdersController 类级应含 CUSTOMER_SERVICE，不含 EDITOR/WAREHOUSE
  const classRoles = ordersController.match(
    /@Roles\(([^)]+)\)[\s\S]*?@Controller\(['"]orders['"]\)/,
  );
  assert.ok(classRoles, "未找到 OrdersController 类级 @Roles");
  assert.ok(
    !classRoles[1].includes("EDITOR"),
    "OrdersController 类级 @Roles 不可含 EDITOR",
  );
});

const paymentsController = await readSrc(
  "server/src/modules/payments/payments.controller.ts",
);
check("付款控制器：查看含 CUSTOMER_SERVICE，审核限 ADMIN，不含 EDITOR", () => {
  const paymentRoles = paymentsController.match(/@Roles\(([^)]*)\)/g) || [];
  assert.ok(
    paymentRoles.some((roles) => roles.includes("CUSTOMER_SERVICE")),
    "付款查看应含 CUSTOMER_SERVICE",
  );
  assert.ok(
    paymentRoles.every((roles) => !roles.includes("EDITOR")),
    "付款控制器不可含 EDITOR",
  );
  // approve/reject 限 SUPER_ADMIN/ADMIN
  const approveMatch = paymentsController.match(
    /@Put\(['"]:id\/approve['"]\)[\s\S]*?approve\(/,
  );
  assert.ok(
    approveMatch && approveMatch[0].includes("SUPER_ADMIN"),
    "approve 必须限 SUPER_ADMIN/ADMIN",
  );
});

const routeAccess = await readSrc("client/src/config/adminRouteAccess.ts");
check("前端路由：/admin/orders 含 CS，不含 WAREHOUSE/EDITOR", () => {
  const orderRule = routeAccess.match(
    /prefix:\s*["']\/admin\/orders["'],\s*roles:\s*(\w+)/,
  );
  assert.ok(orderRule, "未找到 /admin/orders 路由规则");
  const roleSource = routeAccess.match(
    new RegExp(`const ${orderRule[1]}:[^=]*=\\s*\\[([^\\]]*)\\]`),
  );
  assert.ok(roleSource, "/admin/orders 路由角色常量未定义");
  assert.ok(
    roleSource[1].includes("CUSTOMER_SERVICE"),
    "/admin/orders 应含 CUSTOMER_SERVICE",
  );
  assert.ok(!roleSource[1].includes("WAREHOUSE"), "/admin/orders 不可含 WAREHOUSE");
  assert.ok(!roleSource[1].includes("EDITOR"), "/admin/orders 不可含 EDITOR");
});

check("订单控制器：WAREHOUSE 仅通过履约接口操作", () => {
  const classRoles = ordersController.match(
    /@Roles\(([^)]+)\)[\s\S]*?@Controller\(['"]orders['"]\)/,
  );
  assert.ok(classRoles, "未找到 OrdersController 类级 @Roles");
  assert.ok(!classRoles[1].includes("WAREHOUSE"), "通用订单接口不可授予 WAREHOUSE");
  for (const route of [":id/ship", ":id/receive"]) {
    const block = ordersController.match(
      new RegExp(`@Roles\\(([^)]*)\\)[\\s\\S]{0,200}@Put\\(["']${route.replace("/", "\\/")}["']\\)`),
    );
    assert.ok(block, `未找到订单兼容入口 ${route}`);
    assert.ok(!block[1].includes("WAREHOUSE"), `${route} 不可授予 WAREHOUSE`);
  }
});

check("前端路由：交易域子页面路由已定义", () => {
  for (const prefix of [
    "/admin/trade/payments",
    "/admin/trade/fulfillment",
    "/admin/trade/refunds",
    "/admin/trade/after-sales",
  ]) {
    assert.ok(routeAccess.includes(prefix), `缺少路由规则: ${prefix}`);
  }
});

// ── TradeEvent 审计（验收项：交易写操作有事件记录）──
check("交易事件：orders.service 在关键写操作记录 TradeEvent", () => {
  for (const ev of [
    "ORDER_CREATED",
    "STOCK_RESERVED",
    "PAYMENT_APPROVED",
    "ORDER_CANCELLED",
    "SHIPMENT_DISPATCHED",
    "STOCK_RELEASED",
  ]) {
    assert.ok(ordersService.includes(ev), `OrdersService 必须记录 ${ev} 事件`);
  }
});

const tradeEventsConstants = await readSrc(
  "server/src/modules/trade-events/trade-events.constants.ts",
);
check("交易事件：常量文件包含全部 14 种必需事件", () => {
  const required = [
    "ORDER_CREATED",
    "STOCK_RESERVED",
    "STOCK_RELEASED",
    "PAYMENT_PROOF_SUBMITTED",
    "PAYMENT_APPROVED",
    "PAYMENT_REJECTED",
    "FULFILLMENT_CREATED",
    "SHIPMENT_DISPATCHED",
    "ORDER_COMPLETED",
    "AFTER_SALES_REQUESTED",
    "AFTER_SALES_APPROVED",
    "REFUND_REQUESTED",
    "REFUND_APPROVED",
    "REFUND_COMPLETED",
  ];
  for (const ev of required) {
    assert.ok(tradeEventsConstants.includes(ev), `缺少必需事件类型: ${ev}`);
  }
});

// ── 前端 API 与类型覆盖 ──
const apiSrc = await readSrc("client/src/services/api.ts");
check(
  "前端 API：交易域四套 API 已接入（fulfillment/refund/afterSales + payment）",
  () => {
    assert.ok(apiSrc.includes("fulfillmentApi"), "缺少 fulfillmentApi");
    assert.ok(apiSrc.includes("refundApi"), "缺少 refundApi");
    assert.ok(apiSrc.includes("afterSalesApi"), "缺少 afterSalesApi");
    assert.ok(apiSrc.includes("createAfterSales"), "缺少客户售后申请 API");
    assert.ok(apiSrc.includes("cancelAfterSales"), "缺少客户售后撤销 API");
    const orderApiBlock = apiSrc.match(
      /export const orderApi\s*=\s*\{[\s\S]*?\n\};/,
    );
    assert.ok(orderApiBlock?.[0].includes("exportList"), "缺少订单导出 API");
  },
);

const typesSrc = await readExportedTypeSurface("client/src/types/index.ts");
check("前端类型：交易域扩展类型已定义", () => {
  for (const t of [
    "TradeEvent",
    "Fulfillment",
    "FulfillmentStatus",
    "Refund",
    "RefundStatus",
    "AfterSalesCase",
    "AfterSalesType",
    "AfterSalesStatus",
  ]) {
    assert.ok(typesSrc.includes(t), `缺少前端类型: ${t}`);
  }
});

// ── Schema 完整性 ──
const schemaSrc = await readSrc("server/prisma/schema.prisma");
check("Prisma Schema：包含交易域新模型", () => {
  assert.ok(schemaSrc.includes("model TradeEvent {"), "缺少 TradeEvent 模型");
  assert.ok(schemaSrc.includes("model Fulfillment {"), "缺少 Fulfillment 模型");
  assert.ok(
    schemaSrc.includes("model AfterSalesCase {"),
    "缺少 AfterSalesCase 模型",
  );
  assert.ok(
    schemaSrc.includes("enum FulfillmentStatus {"),
    "缺少 FulfillmentStatus 枚举",
  );
  assert.ok(
    schemaSrc.includes("enum AfterSalesStatus {"),
    "缺少 AfterSalesStatus 枚举",
  );
});

check("Prisma Schema：Refund 已扩展审核/幂等字段", () => {
  const refundBlock = schemaSrc.match(/model Refund \{[\s\S]*?\}/);
  assert.ok(refundBlock, "缺少 Refund 模型");
  for (const f of [
    "requestedBy",
    "reviewedBy",
    "processedBy",
    "idempotencyKey",
    "completedAt",
  ]) {
    assert.ok(refundBlock[0].includes(f), `Refund 缺少字段: ${f}`);
  }
});

check(
  "Prisma Schema：Order 关联 tradeEvents/fulfillments/afterSalesCases",
  () => {
    const orderBlock = schemaSrc.match(
      /model Order \{[\s\S]*?@@map\(["']orders["']\)/,
    );
    assert.ok(orderBlock, "缺少 Order 模型");
    assert.ok(
      orderBlock[0].includes("tradeEvents"),
      "Order 缺少 tradeEvents 关联",
    );
    assert.ok(
      orderBlock[0].includes("fulfillments"),
      "Order 缺少 fulfillments 关联",
    );
    assert.ok(
      orderBlock[0].includes("afterSalesCases"),
      "Order 缺少 afterSalesCases 关联",
    );
  },
);

console.log(`\n${passed} 项通过，跨层静态契约验证完成。`);
