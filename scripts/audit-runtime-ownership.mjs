import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, extname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const defaultOutput = "artifacts/runtime-ownership-audit/current.json";
const codeExtensions = [".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"];
const ignoredImportExtensions = new Set([
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".svg",
  ".png",
  ".jpg",
  ".jpeg",
  ".webp",
  ".avif",
  ".json",
]);
const requireFromClient = createRequire(resolve(projectRoot, "client/package.json"));
const ts = requireFromClient("typescript");

function fail(code) {
  throw new Error(code);
}

function normalizePath(path) {
  return path.split(sep).join("/");
}

function compareStable(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectRelative(path) {
  const value = normalizePath(relative(projectRoot, resolve(projectRoot, path)));
  if (!value || value === "." || value.startsWith("../")) {
    fail(`PATH_OUTSIDE_PROJECT:${path}`);
  }
  return value;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function walk(path) {
  if (!existsSync(path)) return [];
  const stat = lstatSync(path);
  if (!stat.isDirectory()) return [path];
  const files = [];
  const directoryEntries = readdirSync(path, { withFileTypes: true })
    .sort((left, right) => compareStable(left.name, right.name));
  for (const entry of directoryEntries) {
    const absolutePath = resolve(path, entry.name);
    if (entry.isDirectory()) files.push(...walk(absolutePath));
    else files.push(absolutePath);
  }
  return files;
}

function isCodeFile(path) {
  return codeExtensions.includes(extname(path).toLowerCase());
}

function sourceFile(path) {
  const content = readFileSync(path, "utf8");
  return {
    path,
    content,
    ast: ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      path.endsWith(".tsx") || path.endsWith(".jsx")
        ? ts.ScriptKind.TSX
        : ts.ScriptKind.TS,
    ),
  };
}

function importSpecifiers(ast) {
  const specifiers = [];
  function visit(node) {
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier &&
      ts.isStringLiteralLike(node.moduleSpecifier)
    ) {
      specifiers.push(node.moduleSpecifier.text);
    } else if (
      ts.isCallExpression(node) &&
      node.expression.kind === ts.SyntaxKind.ImportKeyword &&
      node.arguments.length === 1 &&
      ts.isStringLiteralLike(node.arguments[0])
    ) {
      specifiers.push(node.arguments[0].text);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return specifiers;
}

function resolveCodeImport(importer, specifier, scope) {
  let base;
  if (scope === "client" && specifier.startsWith("@/")) {
    base = resolve(projectRoot, "client/src", specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    base = resolve(dirname(importer), specifier);
  } else {
    return { external: true, path: null };
  }

  const explicitExtension = extname(base).toLowerCase();
  if (ignoredImportExtensions.has(explicitExtension)) {
    return { external: false, ignoredAsset: true, path: null };
  }
  const extensionlessBase = codeExtensions.includes(explicitExtension)
    ? base.slice(0, -explicitExtension.length)
    : base;
  const candidates = [
    ...(codeExtensions.includes(explicitExtension) ? [base] : []),
    ...codeExtensions.map((extension) => `${extensionlessBase}${extension}`),
    ...codeExtensions.map((extension) => resolve(extensionlessBase, `index${extension}`)),
  ];
  const match = candidates.find((candidate) => existsSync(candidate));
  return { external: false, ignoredAsset: false, path: match ?? null };
}

function buildGraph(paths, scope) {
  const parsed = new Map(paths.map((path) => [path, sourceFile(path)]));
  const graph = new Map();
  const unresolved = [];
  for (const [path, source] of parsed) {
    const dependencies = [];
    for (const specifier of importSpecifiers(source.ast)) {
      const resolved = resolveCodeImport(path, specifier, scope);
      if (resolved.path) dependencies.push(resolved.path);
      else if (!resolved.external && !resolved.ignoredAsset) {
        unresolved.push({ importer: projectRelative(path), specifier });
      }
    }
    graph.set(path, [...new Set(dependencies)].sort(compareStable));
  }
  return { parsed, graph, unresolved };
}

function reachableFrom(graph, entries) {
  const reached = new Set();
  const queue = entries.filter((entry) => graph.has(entry));
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || reached.has(current)) continue;
    reached.add(current);
    for (const dependency of graph.get(current) ?? []) {
      if (!reached.has(dependency)) queue.push(dependency);
    }
  }
  return reached;
}

function reverseImporters(graph, target, reachable) {
  return [...graph.entries()]
    .filter(([importer, dependencies]) =>
      reachable.has(importer) && dependencies.includes(target),
    )
    .map(([importer]) => projectRelative(importer))
    .sort(compareStable);
}

function extractClientCalls(parsed, reachable) {
  const calls = [];
  const methods = new Set(["get", "post", "put", "patch", "delete"]);

  function templatePath(argument) {
    if (ts.isStringLiteralLike(argument)) return argument.text;
    if (ts.isNoSubstitutionTemplateLiteral(argument)) return argument.text;
    if (ts.isTemplateExpression(argument)) {
      return argument.templateSpans.reduce(
        (value, span) => `${value}:param${span.literal.text}`,
        argument.head.text,
      );
    }
    return null;
  }

  function fetchMethod(node) {
    const options = node.arguments[1];
    if (!options || !ts.isObjectLiteralExpression(options)) return "GET";
    const property = options.properties.find(
      (entry) =>
        ts.isPropertyAssignment(entry) &&
        entry.name.getText().replace(/["']/g, "") === "method",
    );
    return property && ts.isPropertyAssignment(property) && ts.isStringLiteralLike(property.initializer)
      ? property.initializer.text.toUpperCase()
      : "GET";
  }

  for (const [path, source] of parsed) {
    if (!reachable.has(path) || /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(path)) continue;
    function visit(node) {
      if (ts.isCallExpression(node) && node.arguments.length > 0) {
        let method = null;
        let owner = null;
        if (
          ts.isPropertyAccessExpression(node.expression) &&
          methods.has(node.expression.name.text)
        ) {
          const candidateOwner = node.expression.expression.getText(source.ast);
          if (/(?:api|client|axios)/i.test(candidateOwner)) {
            method = node.expression.name.text.toUpperCase();
            owner = candidateOwner;
          }
        } else if (
          ts.isIdentifier(node.expression) &&
          node.expression.text === "fetch"
        ) {
          method = fetchMethod(node);
          owner = "fetch";
        }
        if (method && owner) {
          const rawPath = templatePath(node.arguments[0]);
          if (rawPath?.startsWith("/")) {
            const line = source.ast.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            calls.push({
              method,
              path: normalizeApiPath(rawPath),
              rawPath,
              owner,
              source: projectRelative(path),
              line,
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(source.ast);
  }
  return calls.sort((left, right) =>
    compareStable(
      `${left.path}:${left.method}:${left.source}:${left.line}`,
      `${right.path}:${right.method}:${right.source}:${right.line}`,
    ),
  );
}

function normalizeApiPath(value) {
  const withoutOrigin = value.replace(/^https?:\/\/[^/]+/i, "");
  const withoutQuery = withoutOrigin.split(/[?#]/, 1)[0];
  const withoutPrefix = withoutQuery.replace(/^\/api(?=\/|$)/, "");
  const normalized = `/${withoutPrefix}`.replace(/\/{2,}/g, "/").replace(/\/$/, "");
  return normalized || "/";
}

function extractServerRoutes(controllerFiles) {
  const routes = [];
  const methodPattern = /@(Get|Post|Put|Patch|Delete)\s*\(\s*([^)]*?)\s*\)/g;
  for (const path of controllerFiles) {
    const content = readFileSync(path, "utf8");
    const controllerMatch = /@Controller\s*\(\s*(['"`])([^'"`]*)\1\s*\)/.exec(content);
    const controllerPath = controllerMatch?.[2] ?? "";
    for (const match of content.matchAll(methodPattern)) {
      const line = content.slice(0, match.index).split("\n").length;
      const decoratorPaths = [...match[2].matchAll(/(['"`])([^'"`]*)\1/g)]
        .map((entry) => entry[2]);
      for (const decoratorPath of decoratorPaths.length > 0 ? decoratorPaths : [""]) {
        routes.push({
          method: match[1].toUpperCase(),
          path: normalizeApiPath(`/${controllerPath}/${decoratorPath}`),
          source: projectRelative(path),
          line,
        });
      }
    }
  }
  return routes.sort((left, right) =>
    compareStable(
      `${left.path}:${left.method}:${left.source}:${left.line}`,
      `${right.path}:${right.method}:${right.source}:${right.line}`,
    ),
  );
}

function routeMatches(serverRoute, clientCall) {
  if (serverRoute.method !== clientCall.method) return false;
  const serverSegments = serverRoute.path.split("/").filter(Boolean);
  const clientSegments = clientCall.path.split("/").filter(Boolean);
  if (serverSegments.length !== clientSegments.length) return false;
  return serverSegments.every((segment, index) =>
    segment.startsWith(":") ||
    clientSegments[index] === ":param" ||
    segment === clientSegments[index],
  );
}

const indirectRouteOwnership = new Map([
  ["POST /analytics/track", ["DYNAMIC_CLIENT_REQUEST", "useAnalytics 通过运行时 baseUrl 调用"]],
  ["POST /auth/session/refresh", ["DYNAMIC_CLIENT_REQUEST", "httpClient 按身份域选择刷新路径"]],
  ["POST /customers/session/refresh", ["DYNAMIC_CLIENT_REQUEST", "httpClient 按身份域选择刷新路径"]],
  ["POST /auth/logout", ["BACKWARD_COMPATIBILITY_ALIAS", "同一 Controller 同时保留旧 logout 与当前 session/logout"]],
  ["POST /customers/logout", ["BACKWARD_COMPATIBILITY_ALIAS", "同一 Controller 同时保留旧 logout 与当前 session/logout"]],
  ["GET /customers/wechat/callback", ["EXTERNAL_CALLBACK", "由微信 OAuth 回调消费，不应要求前端静态 API 调用"]],
  ["POST /payments/notify/:provider", ["EXTERNAL_CALLBACK", "由支付网关异步通知消费"]],
  ["POST /refunds/notify/:provider", ["EXTERNAL_CALLBACK", "由退款网关异步通知消费"]],
  ["GET /health", ["INFRASTRUCTURE_PROBE", "容器与负载均衡健康探针"]],
  ["GET /ready", ["INFRASTRUCTURE_PROBE", "容器与负载均衡就绪探针"]],
  ["GET /payments/:id/proof", ["INDIRECT_RESOURCE_URL", "SecureImage 以受控资源 URL 加载员工付款凭证"]],
  ["GET /upload/payment-proofs/:orderId", ["INDIRECT_RESOURCE_URL", "SecureImage 支持客户付款凭证资源 URL"]],
  ["GET /products/catalog/:productId/media/:imageId", ["INDIRECT_RESOURCE_URL", "商品 API 返回 mediaUrl 后由图片组件加载"]],
  ["GET /products/public/:productId/media/:imageId", ["INDIRECT_RESOURCE_URL", "公开商品 API 返回 mediaUrl 后由图片组件加载"]],
]);

function classifyRouteWithoutStaticClientCall(route) {
  const ownership = indirectRouteOwnership.get(`${route.method} ${route.path}`);
  if (ownership) {
    return {
      ...route,
      classification: ownership[0],
      reason: ownership[1],
    };
  }
  return {
    ...route,
    classification: "NO_CURRENT_STATIC_CLIENT_CONSUMER_REVIEW_REQUIRED",
    reason: "当前生产 Client 消费图未找到直接或已登记的间接消费者；外部兼容与运营用途仍需负责人确认",
  };
}

function extractPrismaModels(serverFiles, reachable) {
  const schemaPath = resolve(projectRoot, "server/prisma/schema.prisma");
  const schema = readFileSync(schemaPath, "utf8");
  const sources = serverFiles
    .filter((path) => reachable.has(path) && !/\.(?:spec|test)\.ts$/.test(path))
    .map((path) => ({ path, content: readFileSync(path, "utf8") }));
  const modelBlocks = [...schema.matchAll(/^model\s+(\w+)\s*\{([\s\S]*?)^\}/gm)]
    .map((match) => ({ model: match[1], body: match[2] }));
  return modelBlocks
    .map(({ model }) => {
      const delegate = `${model[0].toLowerCase()}${model.slice(1)}`;
      const pattern = new RegExp(
        `\\b(?:(?:this\\.)?prisma|tx|transaction|database|db)\\.${delegate}\\b`,
        "g",
      );
      const references = sources.flatMap((source) => {
        const rows = [];
        for (const match of source.content.matchAll(pattern)) {
          rows.push({
            source: projectRelative(source.path),
            line: source.content.slice(0, match.index).split("\n").length,
          });
        }
        return rows;
      });
      const relationPattern = new RegExp(
        `^\\s*(\\w+)\\s+${model}(?:\\[\\])?\\??(?:\\s|@)`,
        "gm",
      );
      const schemaRelationFields = modelBlocks.flatMap((owner) =>
        [...owner.body.matchAll(relationPattern)].map((entry) => ({
          ownerModel: owner.model,
          field: entry[1],
        })),
      );
      return {
        model,
        delegate,
        directDelegateReferences: references,
        schemaRelationFields,
        classification:
          references.length > 0
            ? "DIRECT_RUNTIME_DELEGATE_REFERENCE"
            : schemaRelationFields.length > 0
              ? "SCHEMA_RELATION_OR_NESTED_WRITE_REVIEW_REQUIRED"
              : "NO_DIRECT_DELEGATE_OR_SCHEMA_RELATION_REVIEW_REQUIRED",
      };
    })
    .sort((left, right) => compareStable(left.model, right.model));
}

function collectAudit() {
  const clientSourceFiles = walk(resolve(projectRoot, "client/src")).filter(isCodeFile);
  const clientTestFiles = walk(resolve(projectRoot, "client/tests")).filter(isCodeFile);
  const clientGraph = buildGraph([...clientSourceFiles, ...clientTestFiles], "client");
  const clientMain = resolve(projectRoot, "client/src/main.tsx");
  const clientRuntimeReachable = reachableFrom(clientGraph.graph, [clientMain]);
  const clientTestReachable = reachableFrom(
    clientGraph.graph,
    clientTestFiles,
  );
  const pageFiles = clientSourceFiles
    .filter((path) => normalizePath(path).includes("/client/src/pages/") && path.endsWith(".tsx"))
    .map((path) => {
      const runtime = clientRuntimeReachable.has(path);
      const test = clientTestReachable.has(path);
      return {
        path: projectRelative(path),
        bytes: lstatSync(path).size,
        sha256: sha256(readFileSync(path)),
        runtimeImporters: reverseImporters(
          clientGraph.graph,
          path,
          clientRuntimeReachable,
        ),
        testImporters: reverseImporters(clientGraph.graph, path, clientTestReachable),
        classification: runtime
          ? "PRODUCTION_REACHABLE"
          : test
            ? "TEST_ONLY_REACHABLE"
            : "SOURCE_UNREACHABLE_REVIEW_REQUIRED",
      };
    })
    .sort((left, right) => compareStable(left.path, right.path));
  const unreachableClientSourceFiles = clientSourceFiles
    .filter((path) => !clientRuntimeReachable.has(path))
    .map((path) => ({
      path: projectRelative(path),
      classification: path.endsWith(".d.ts")
        ? "AMBIENT_TYPE_DECLARATION"
        : clientTestReachable.has(path)
          ? "TEST_ONLY_REACHABLE"
          : "SOURCE_UNREACHABLE_REVIEW_REQUIRED",
    }))
    .sort((left, right) => compareStable(left.path, right.path));

  const serverFiles = walk(resolve(projectRoot, "server/src")).filter(isCodeFile);
  const serverGraph = buildGraph(serverFiles, "server");
  const serverMain = resolve(projectRoot, "server/src/main.ts");
  const serverRuntimeReachable = reachableFrom(serverGraph.graph, [serverMain]);
  const controllerFiles = serverFiles.filter((path) => path.endsWith(".controller.ts"));
  const controllers = controllerFiles.map((path) => ({
    path: projectRelative(path),
    runtimeReachable: serverRuntimeReachable.has(path),
  }));
  const serverRoutes = extractServerRoutes(
    controllerFiles.filter((path) => serverRuntimeReachable.has(path)),
  );
  const clientCalls = extractClientCalls(clientGraph.parsed, clientRuntimeReachable);
  const unmatchedClientCalls = clientCalls.filter(
    (call) => !serverRoutes.some((route) => routeMatches(route, call)),
  );
  const serverRoutesWithoutStaticClientCall = serverRoutes
    .filter((route) => !clientCalls.some((call) => routeMatches(route, call)))
    .map(classifyRouteWithoutStaticClientCall);
  const prismaModels = extractPrismaModels(serverFiles, serverRuntimeReachable);

  return {
    schemaVersion: 1,
    evidenceKind: "LOCAL_RUNTIME_OWNERSHIP_STATIC_AUDIT",
    generatedAt: new Date().toISOString(),
    destructiveActionsAuthorized: false,
    summary: {
      clientSourceFiles: clientSourceFiles.length,
      clientRuntimeReachableFiles: clientRuntimeReachable.size,
      unreachableClientSourceFiles: unreachableClientSourceFiles.length,
      pageFiles: pageFiles.length,
      unreachablePageFiles: pageFiles.filter(
        (entry) => entry.classification === "SOURCE_UNREACHABLE_REVIEW_REQUIRED",
      ).length,
      testOnlyPageFiles: pageFiles.filter(
        (entry) => entry.classification === "TEST_ONLY_REACHABLE",
      ).length,
      unresolvedClientImports: clientGraph.unresolved.length,
      serverSourceFiles: serverFiles.length,
      serverRuntimeReachableFiles: serverRuntimeReachable.size,
      controllers: controllers.length,
      unreachableControllers: controllers.filter((entry) => !entry.runtimeReachable).length,
      serverRoutes: serverRoutes.length,
      clientStaticApiCalls: clientCalls.length,
      unmatchedClientStaticApiCalls: unmatchedClientCalls.length,
      serverRoutesWithoutStaticClientCall: serverRoutesWithoutStaticClientCall.length,
      serverRoutesRequiringConsumerReview: serverRoutesWithoutStaticClientCall.filter(
        (entry) => entry.classification === "NO_CURRENT_STATIC_CLIENT_CONSUMER_REVIEW_REQUIRED",
      ).length,
      prismaModels: prismaModels.length,
      prismaModelsWithoutDirectDelegateReference: prismaModels.filter(
        (entry) => entry.directDelegateReferences.length === 0,
      ).length,
      prismaModelsWithoutDelegateOrSchemaRelation: prismaModels.filter(
        (entry) =>
          entry.directDelegateReferences.length === 0 &&
          entry.schemaRelationFields.length === 0,
      ).length,
      unresolvedServerImports: serverGraph.unresolved.length,
    },
    client: {
      productionEntry: projectRelative(clientMain),
      productionEntrySha256: sha256(readFileSync(clientMain)),
      appRouterSha256: sha256(readFileSync(resolve(projectRoot, "client/src/App.tsx"))),
      pageFiles,
      unreachableSourceFiles: unreachableClientSourceFiles,
      unreachablePageFiles: pageFiles.filter(
        (entry) => entry.classification !== "PRODUCTION_REACHABLE",
      ),
      staticApiCalls: clientCalls,
      unmatchedStaticApiCalls: unmatchedClientCalls,
      unresolvedImports: clientGraph.unresolved,
    },
    server: {
      productionEntry: projectRelative(serverMain),
      productionEntrySha256: sha256(readFileSync(serverMain)),
      controllers,
      routes: serverRoutes,
      routesWithoutStaticClientCall: serverRoutesWithoutStaticClientCall,
      prismaModels,
      unresolvedImports: serverGraph.unresolved,
    },
    limitations: [
      "STATIC_REACHABILITY_DOES_NOT_PROVE_RUNTIME_EXECUTION_OR_BUSINESS_CLOSURE",
      "NO_STATIC_CLIENT_CALL_DOES_NOT_PROVE_SERVER_ROUTE_IS_ORPHAN_EXTERNAL_CALLBACKS_AND_OPERATIONS_MAY_CONSUME_IT",
      "NO_DIRECT_PRISMA_DELEGATE_REFERENCE_DOES_NOT_PROVE_MODEL_IS_UNUSED_RELATIONS_RAW_SQL_AND_MIGRATIONS_REQUIRE_REVIEW",
      "SOURCE_UNREACHABLE_FILES_REQUIRE_OWNER_APPROVAL_BEFORE_DELETE_MOVE_OR_ARCHIVE",
      "DYNAMICALLY_COMPUTED_IMPORTS_AND_API_PATHS_MAY_REQUIRE_MANUAL_REVIEW",
      "LOCAL_WORKTREE_EVIDENCE_DOES_NOT_PROVE_TARGET_ENVIRONMENT_USAGE",
    ],
  };
}

function stableAudit(audit) {
  const clone = structuredClone(audit);
  delete clone.generatedAt;
  return clone;
}

function outputPathFromArguments(argumentsList) {
  const positional = argumentsList.find((argument) => !argument.startsWith("--"));
  return resolve(projectRoot, positional ?? defaultOutput);
}

const argumentsList = process.argv.slice(2);
const check = argumentsList.includes("--check");
const verify = argumentsList.includes("--verify");
if (check && verify) fail("AUDIT_MODE_CONFLICT");
const outputPath = outputPathFromArguments(argumentsList);
projectRelative(outputPath);
const audit = collectAudit();

if (check) {
  if (!existsSync(outputPath)) fail(`AUDIT_OUTPUT_MISSING:${projectRelative(outputPath)}`);
  const existing = JSON.parse(readFileSync(outputPath, "utf8"));
  if (JSON.stringify(stableAudit(existing)) !== JSON.stringify(stableAudit(audit))) {
    fail(`RUNTIME_OWNERSHIP_AUDIT_STALE:${projectRelative(outputPath)}`);
  }
} else if (!verify) {
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify(audit, null, 2)}\n`, "utf8");
}
if (verify) {
  const violations = [
    ["UNRESOLVED_CLIENT_IMPORTS", audit.summary.unresolvedClientImports],
    ["UNRESOLVED_SERVER_IMPORTS", audit.summary.unresolvedServerImports],
    ["UNMATCHED_CLIENT_STATIC_API_CALLS", audit.summary.unmatchedClientStaticApiCalls],
    ["UNREACHABLE_CONTROLLERS", audit.summary.unreachableControllers],
    [
      "PRISMA_MODELS_WITHOUT_DELEGATE_OR_SCHEMA_RELATION",
      audit.summary.prismaModelsWithoutDelegateOrSchemaRelation,
    ],
  ].filter(([, count]) => count !== 0);
  if (violations.length > 0) {
    fail(
      `RUNTIME_OWNERSHIP_INVARIANTS_FAILED:${violations
        .map(([code, count]) => `${code}=${count}`)
        .join(",")}`,
    );
  }
}

console.log(JSON.stringify({
  ok: true,
  mode: check ? "check" : verify ? "verify" : "write",
  output: projectRelative(outputPath),
  summary: audit.summary,
  limitations: audit.limitations,
}, null, 2));
