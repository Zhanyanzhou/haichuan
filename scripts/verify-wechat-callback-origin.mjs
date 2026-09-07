// 微信扫码回调跨窗口通信 —— TypeScript AST 静态合同
// 运行：node scripts/verify-wechat-callback-origin.mjs
// 运行语义由 server/src/modules/wechat-auth/wechat-auth.security.spec.ts 负责。

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let ts;
try {
  ts = createRequire(path.join(root, "server/package.json"))("typescript");
} catch {
  console.error("TypeScript Compiler API 不可用；请先安装项目 server 依赖。");
  process.exit(1);
}

const sourcePaths = {
  controller: "server/src/modules/wechat-auth/wechat-auth.controller.ts",
  service: "server/src/modules/wechat-auth/wechat-auth.service.ts",
  sessionSecurity: "server/src/common/security/session-security.ts",
  api: "client/src/services/api.ts",
  account: "client/src/pages/public/CustomerCenter/AccountExperience.tsx",
};
const rawSources = Object.fromEntries(
  await Promise.all(
    Object.entries(sourcePaths).map(async ([key, relativePath]) => [
      key,
      await readFile(path.join(root, relativePath), "utf8"),
    ]),
  ),
);

function parseSources(sources) {
  return Object.fromEntries(
    Object.entries(sources).map(([key, source]) => {
      const kind = key === "account" ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const file = ts.createSourceFile(`${key}.${kind === ts.ScriptKind.TSX ? "tsx" : "ts"}`, source, ts.ScriptTarget.Latest, true, kind);
      assert.equal(file.parseDiagnostics.length, 0, `${key} 夹具必须通过 TypeScript 语法解析`);
      return [key, file];
    }),
  );
}

function nodes(rootNode, predicate) {
  const found = [];
  const visit = (node) => {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, visit);
  };
  visit(rootNode);
  return found;
}

function unwrap(expression) {
  let current = expression;
  while (
    ts.isParenthesizedExpression(current) ||
    ts.isAsExpression(current) ||
    ts.isTypeAssertionExpression(current) ||
    ts.isNonNullExpression(current) ||
    ts.isSatisfiesExpression?.(current)
  ) {
    current = current.expression;
  }
  return current;
}

function propertyPath(expression) {
  const current = unwrap(expression);
  if (ts.isIdentifier(current)) return [current.text];
  if (ts.isPropertyAccessExpression(current)) {
    return [...propertyPath(current.expression), current.name.text];
  }
  if (ts.isElementAccessExpression(current) && current.argumentExpression) {
    const key = stringValue(current.argumentExpression);
    return key === null ? [] : [...propertyPath(current.expression), key];
  }
  return [];
}

function stringValue(node) {
  const current = unwrap(node);
  return ts.isStringLiteralLike(current) ? current.text : null;
}

function callName(call) {
  return propertyPath(call.expression).at(-1) ?? null;
}

function findMethod(file, name) {
  return nodes(file, (node) =>
    ts.isMethodDeclaration(node) && node.name?.getText(file) === name,
  )[0] ?? null;
}

function findFunction(file, name) {
  return nodes(file, (node) =>
    ts.isFunctionDeclaration(node) && node.name?.text === name,
  )[0] ?? null;
}

function callsWithin(node, name) {
  return nodes(node, (candidate) =>
    ts.isCallExpression(candidate) && (!name || callName(candidate) === name),
  );
}

function variableMap(node) {
  const result = new Map();
  for (const declaration of nodes(node, ts.isVariableDeclaration)) {
    if (ts.isIdentifier(declaration.name) && declaration.initializer) {
      result.set(declaration.name.text, declaration.initializer);
    }
  }
  return result;
}

function decoratorsOf(node) {
  return ts.canHaveDecorators(node) ? (ts.getDecorators(node) ?? []) : [];
}

function parameterWithDecorator(method, decoratorName, argument) {
  return method.parameters.find((parameter) =>
    decoratorsOf(parameter).some((decorator) => {
      const expression = decorator.expression;
      return (
        ts.isCallExpression(expression) &&
        callName(expression) === decoratorName &&
        (argument === undefined || stringValue(expression.arguments[0]) === argument)
      );
    }),
  ) ?? null;
}

function parameterName(parameter) {
  return parameter && ts.isIdentifier(parameter.name) ? parameter.name.text : null;
}

function acceptsOptionalString(parameter) {
  if (!parameter?.type) return false;
  if (parameter.questionToken && parameter.type.kind === ts.SyntaxKind.StringKeyword) return true;
  if (!ts.isUnionTypeNode(parameter.type)) return false;
  const kinds = new Set(parameter.type.types.map((type) => type.kind));
  return kinds.has(ts.SyntaxKind.StringKeyword) && kinds.has(ts.SyntaxKind.UndefinedKeyword);
}

function containsCall(node, name) {
  return callsWithin(node, name).length > 0;
}

function expressionDependsOnPath(expression, expectedPath, variables, visited = new Set()) {
  const current = unwrap(expression);
  if (propertyPath(current).join(".") === expectedPath.join(".")) return true;
  if (ts.isIdentifier(current)) {
    if (visited.has(current.text)) return false;
    visited.add(current.text);
    const initializer = variables.get(current.text);
    return initializer
      ? expressionDependsOnPath(initializer, expectedPath, variables, visited)
      : false;
  }
  return false;
}

function importedNames(file, moduleSuffix) {
  const result = new Map();
  for (const declaration of file.statements) {
    if (
      !ts.isImportDeclaration(declaration) ||
      stringValue(declaration.moduleSpecifier)?.endsWith(moduleSuffix) !== true ||
      !declaration.importClause?.namedBindings ||
      !ts.isNamedImports(declaration.importClause.namedBindings)
    ) continue;
    for (const element of declaration.importClause.namedBindings.elements) {
      result.set(element.name.text, element.propertyName?.text ?? element.name.text);
    }
  }
  return result;
}

function secretDerived(expression, scope, file, visited = new Set()) {
  const current = unwrap(expression);
  const pathParts = propertyPath(current);
  if (
    pathParts[0] === "process" &&
    pathParts[1] === "env" &&
    /SECRET/.test(pathParts.at(-1) ?? "")
  ) return true;
  if (ts.isStringLiteralLike(current)) return false;
  if (ts.isIdentifier(current)) {
    const key = `value:${current.text}`;
    if (visited.has(key)) return false;
    visited.add(key);
    const initializer = variableMap(scope).get(current.text) ?? variableMap(file).get(current.text);
    return initializer ? secretDerived(initializer, scope, file, visited) : false;
  }
  if (ts.isCallExpression(current) && ts.isIdentifier(unwrap(current.expression))) {
    const helperName = unwrap(current.expression).text;
    const key = `call:${helperName}`;
    if (!visited.has(key)) {
      visited.add(key);
      const helper = findFunction(file, helperName);
      if (helper) {
        for (const returned of nodes(helper, ts.isReturnStatement)) {
          if (returned.expression && secretDerived(returned.expression, helper, file, visited)) {
            return true;
          }
        }
      }
    }
  }
  return nodes(current, (child) => child !== current).some((child) =>
    ts.isExpressionNode(child) && secretDerived(child, scope, file, visited),
  );
}

function templateStaticText(expression) {
  const current = unwrap(expression);
  if (ts.isNoSubstitutionTemplateLiteral(current)) return current.text;
  if (!ts.isTemplateExpression(current)) return stringValue(current) ?? "";
  return current.head.text + current.templateSpans.map((span) => span.literal.text).join("");
}

function templateExpressions(expression) {
  const current = unwrap(expression);
  return ts.isTemplateExpression(current)
    ? current.templateSpans.map((span) => span.expression)
    : [];
}

function parseEmbeddedCallbackScript(controllerFile) {
  const renderer = findFunction(controllerFile, "renderCallbackPage");
  assert.ok(renderer, "缺少 callback HTML renderer");
  const returned = nodes(renderer, ts.isReturnStatement).find((statement) => statement.expression);
  const template = returned?.expression && unwrap(returned.expression);
  assert.ok(template && ts.isTemplateExpression(template), "callback renderer 必须返回模板页面");
  let html = template.head.text;
  for (const span of template.templateSpans) {
    const name = ts.isIdentifier(span.expression) ? span.expression.text : "";
    html += name === "payload" ? "null" : name === "allowedOrigin" ? '""' : "placeholder";
    html += span.literal.text;
  }
  const scriptStart = html.indexOf(">", html.indexOf("<script")) + 1;
  const scriptEnd = html.indexOf("</script>", scriptStart);
  assert.ok(scriptStart > 0 && scriptEnd > scriptStart, "callback 页面必须包含脚本");
  const embedded = ts.createSourceFile("callback-embedded.js", html.slice(scriptStart, scriptEnd), ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  assert.equal(embedded.parseDiagnostics.length, 0, "callback 内嵌脚本必须通过语法解析");
  return embedded;
}

function hasHeaderCall(method, responseName, header, value) {
  return callsWithin(method, "setHeader").some((call) => {
    const target = propertyPath(call.expression);
    return (
      target[0] === responseName &&
      stringValue(call.arguments[0]) === header &&
      stringValue(call.arguments[1]) === value
    );
  });
}

function contractChecks(files) {
  return [
    ["回调脚本精确 postMessage target，并由 CSP 限制 frame ancestor", () => {
      const callback = findMethod(files.controller, "callback");
      assert.ok(callback, "缺少 callback controller 方法");
      const responseName = parameterName(parameterWithDecorator(callback, "Res"));
      const cspCall = callsWithin(callback, "setHeader").find((call) =>
        propertyPath(call.expression)[0] === responseName &&
        stringValue(call.arguments[0]) === "Content-Security-Policy",
      );
      assert.ok(cspCall?.arguments[1], "callback 必须设置 CSP");
      assert.ok(templateStaticText(cspCall.arguments[1]).includes("frame-ancestors "), "CSP 必须声明 frame-ancestors");
      const cspExpressions = templateExpressions(cspCall.arguments[1]).flatMap(propertyPath);
      assert.ok(cspExpressions.includes("frameAncestor"), "frame-ancestors 必须使用已验证来源变量");
      const frameInitializer = variableMap(callback).get("frameAncestor");
      assert.ok(frameInitializer && propertyPath(frameInitializer.left ?? frameInitializer).slice(-2).join(".") === "outcome.parentOrigin", "frame ancestor 必须来自 callback outcome.parentOrigin");

      const embedded = parseEmbeddedCallbackScript(files.controller);
      const postMessages = callsWithin(embedded, "postMessage");
      assert.equal(postMessages.length, 1, "callback 内嵌脚本必须只有一个 postMessage 调用");
      const postMessage = postMessages[0];
      assert.deepEqual(propertyPath(postMessage.expression), ["target", "postMessage"]);
      assert.deepEqual(propertyPath(postMessage.arguments[1]), ["allowedOrigin"]);
      assert.notEqual(stringValue(postMessage.arguments[1]), "*");
      const payload = unwrap(postMessage.arguments[0]);
      assert.ok(ts.isObjectLiteralExpression(payload), "postMessage 必须发送结构化结果");
      const typeProperty = payload.properties.find((property) => property.name?.getText(embedded) === "type");
      assert.equal(stringValue(typeProperty?.initializer), "wechat-login-result");
    }],
    ["config 将 origin Query 与当前请求 Cookie 绑定传给二维码服务", () => {
      const config = findMethod(files.controller, "config");
      assert.ok(config, "缺少 config controller 方法");
      const originParameter = parameterWithDecorator(config, "Query", "origin");
      const requestParameter = parameterWithDecorator(config, "Req");
      const originName = parameterName(originParameter);
      const requestName = parameterName(requestParameter);
      assert.ok(originName && acceptsOptionalString(originParameter), "origin Query 必须是可选字符串等价类型");
      assert.ok(requestName, "config 必须接收当前 HTTP request");
      const qrCall = callsWithin(config, "buildQrConnectUrl")[0];
      assert.ok(qrCall && qrCall.arguments.length >= 2, "config 必须向二维码服务传 origin 与浏览器绑定");
      assert.deepEqual(propertyPath(qrCall.arguments[0]), [originName]);
      const variables = variableMap(config);
      let bindingExpression = unwrap(qrCall.arguments[1]);
      if (ts.isIdentifier(bindingExpression) && variables.has(bindingExpression.text)) {
        bindingExpression = unwrap(variables.get(bindingExpression.text));
      }
      assert.ok(ts.isCallExpression(bindingExpression), "浏览器绑定必须由安全提取调用产生");
      const imports = importedNames(files.controller, "common/security/session-security");
      const localExtractor = propertyPath(bindingExpression.expression).at(-1);
      assert.equal(imports.get(localExtractor), "extractWechatOAuthBindingCookie");
      assert.ok(findFunction(files.sessionSecurity, "extractWechatOAuthBindingCookie"), "session-security 必须导出浏览器绑定 Cookie 提取器");
      assert.ok(
        bindingExpression.arguments.some((argument) =>
          expressionDependsOnPath(argument, [requestName, "headers", "cookie"], variables),
        ),
        "浏览器绑定必须从当前请求 Cookie 提取",
      );
    }],
    ["state 外层 HMAC 密钥来源于服务端 secret", () => {
      const builderMethod = findMethod(files.service, "buildQrConnectUrl");
      assert.ok(builderMethod, "缺少 buildQrConnectUrl service 方法");
      const stateDeclaration = nodes(builderMethod, ts.isVariableDeclaration).find((declaration) =>
        ts.isIdentifier(declaration.name) && declaration.name.text === "state" && declaration.initializer && ts.isCallExpression(unwrap(declaration.initializer)),
      );
      const stateCall = stateDeclaration?.initializer && unwrap(stateDeclaration.initializer);
      const stateBuilderName = stateCall && ts.isCallExpression(stateCall) ? propertyPath(stateCall.expression).at(-1) : null;
      const stateBuilder = stateBuilderName ? findFunction(files.service, stateBuilderName) : null;
      assert.ok(stateBuilder, "state 必须由可追踪的辅助函数生成");
      const bodyDeclaration = nodes(stateBuilder, ts.isVariableDeclaration).find((declaration) =>
        declaration.initializer && containsCall(declaration.initializer, "join"),
      );
      const bodyName = bodyDeclaration && ts.isIdentifier(bodyDeclaration.name) ? bodyDeclaration.name.text : null;
      const returned = nodes(stateBuilder, ts.isReturnStatement).find((statement) => statement.expression);
      const signerCall = returned?.expression && callsWithin(returned.expression).find((call) =>
        bodyName && propertyPath(call.arguments[0] ?? {}).join(".") === bodyName &&
        findFunction(files.service, propertyPath(call.expression).at(-1) ?? ""),
      );
      const signer = signerCall ? findFunction(files.service, propertyPath(signerCall.expression).at(-1)) : null;
      const hmac = signer && callsWithin(signer, "createHmac")[0];
      assert.equal(stringValue(hmac?.arguments[0]), "sha256");
      assert.ok(hmac?.arguments[1] && secretDerived(hmac.arguments[1], signer, files.service), "state HMAC key 必须实际派生自服务端 secret");
    }],
    ["callback 设置禁止缓存与 Referrer 响应头", () => {
      const callback = findMethod(files.controller, "callback");
      assert.ok(callback, "缺少 callback controller 方法");
      const responseName = parameterName(parameterWithDecorator(callback, "Res"));
      assert.ok(responseName, "callback 必须接收 Response");
      assert.ok(hasHeaderCall(callback, responseName, "Cache-Control", "no-store, private, max-age=0"));
      assert.ok(hasHeaderCall(callback, responseName, "Referrer-Policy", "no-referrer"));
    }],
    ["callback 验证 state 与浏览器绑定，并在微信换码前 claim", () => {
      const callback = findMethod(files.service, "handleCallback");
      assert.ok(callback, "缺少 handleCallback service 方法");
      const stateName = parameterName(callback.parameters[1]);
      const bindingName = parameterName(callback.parameters[2]);
      const variables = variableMap(callback);
      const verifiedDeclaration = nodes(callback, ts.isVariableDeclaration).find((declaration) => {
        const initializer = declaration.initializer && unwrap(declaration.initializer);
        return (
          ts.isIdentifier(declaration.name) &&
          initializer && ts.isCallExpression(initializer) &&
          propertyPath(initializer.arguments[0] ?? {}).join(".") === stateName &&
          initializer.arguments.some((argument) => propertyPath(argument).join(".") === bindingName) &&
          containsCall(initializer, "resolveCorsOrigins")
        );
      });
      assert.ok(verifiedDeclaration && ts.isIdentifier(verifiedDeclaration.name), "callback 必须验证 state、白名单与浏览器绑定");
      const verifiedName = verifiedDeclaration.name.text;
      const verifyCall = unwrap(verifiedDeclaration.initializer);
      assert.ok(findFunction(files.service, propertyPath(verifyCall.expression).at(-1)), "state verifier 必须存在");
      const claim = callsWithin(callback, "claim").find((call) =>
        propertyPath(call.arguments[0] ?? {}).join(".") === stateName &&
        propertyPath(call.arguments[1] ?? {}).join(".") === `${verifiedName}.expiresAt`,
      );
      const exchange = callsWithin(callback, "exchangeCode")[0];
      assert.ok(claim, "callback 必须 claim 当前 state 与验证后的 expiresAt");
      assert.ok(exchange, "callback 必须调用微信换码");
      assert.ok(claim.getStart(files.service) < exchange.getStart(files.service), "state claim 必须发生在微信换码前");
      const parentDeclaration = [...variables.entries()].find(([, initializer]) =>
        propertyPath(initializer).join(".") === `${verifiedName}.parentOrigin`,
      );
      assert.ok(parentDeclaration, "callback 必须读取验证后的 parentOrigin");
      const parentName = parentDeclaration[0];
      const returnsParent = nodes(callback, ts.isObjectLiteralExpression).some((object) =>
        object.properties.some((property) =>
          (ts.isShorthandPropertyAssignment(property) && property.name.text === parentName) ||
          (ts.isPropertyAssignment(property) && property.name.getText(files.service) === "parentOrigin" && propertyPath(property.initializer).join(".") === parentName),
        ),
      );
      assert.ok(returnsParent, "callback outcome 必须回传验证后的 parentOrigin");
    }],
    ["前端仅接受匹配 origin 且来自自身 iframe 的消息", () => {
      const comparisons = nodes(files.account, (node) =>
        ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.ExclamationEqualsEqualsToken,
      );
      assert.ok(comparisons.some((node) =>
        propertyPath(node.left).join(".") === "event.origin" && propertyPath(node.right).join(".") === "callbackOrigin",
      ));
      assert.ok(comparisons.some((node) =>
        propertyPath(node.left).join(".") === "event.source" && propertyPath(node.right).join(".") === "iframeRef.current.contentWindow",
      ));
      assert.ok(nodes(files.account, ts.isJsxAttribute).some((attribute) =>
        attribute.name.getText(files.account) === "ref" &&
        attribute.initializer && ts.isJsxExpression(attribute.initializer) &&
        propertyPath(attribute.initializer.expression).join(".") === "iframeRef",
      ));
    }],
    ["前端请求二维码时传递当前页面 origin", () => {
      const configCall = callsWithin(files.account, "wechatConfig").find((call) =>
        propertyPath(call.arguments[0] ?? {}).join(".") === "window.location.origin",
      );
      assert.ok(configCall, "前端必须将 window.location.origin 传给微信配置接口");
      const apiProperty = nodes(files.api, (node) =>
        ts.isPropertyAssignment(node) && node.name.getText(files.api) === "wechatConfig",
      )[0];
      assert.ok(apiProperty && ts.isArrowFunction(unwrap(apiProperty.initializer)), "API 必须暴露 wechatConfig");
      assert.ok(acceptsOptionalString(unwrap(apiProperty.initializer).parameters[0]), "wechatConfig origin 参数必须为可选字符串");
    }],
  ];
}

function evaluate(sources, print = false) {
  const checks = contractChecks(parseSources(sources));
  const failed = [];
  for (const [name, run] of checks) {
    try {
      run();
      if (print) console.log(`  ✓ ${name}`);
    } catch (error) {
      failed.push({ name, message: error.message });
      if (print) {
        console.error(`  ✗ ${name}`);
        console.error(`    ${error.message}`);
      }
    }
  }
  return { count: checks.length, failed };
}

function requiredReplace(source, search, replacement, label) {
  const changed = source.replace(search, replacement);
  assert.notEqual(changed, source, `${label}: fixtureChanged=false`);
  return changed;
}

function inRegion(source, start, end, mutate, label) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `${label}: fixture region missing`);
  const region = source.slice(from, to);
  const changed = mutate(region);
  assert.notEqual(changed, region, `${label}: fixtureChanged=false`);
  return source.slice(0, from) + changed + source.slice(to);
}

function insertBeforeLastBrace(region, statement) {
  const index = region.lastIndexOf("}");
  assert.ok(index >= 0, "fixture block must have closing brace");
  return `${region.slice(0, index)}\n  ${statement}\n${region.slice(index)}`;
}

function removeCallbackHeader(source, header, value, decoy = "") {
  return inRegion(source, "async callback(", "/** 扫码后绑定", (region) => {
    const without = requiredReplace(
      region,
      new RegExp(`\\s*res\\.setHeader\\(\\s*["']${header}["']\\s*,\\s*["']${value}["']\\s*\\);`),
      "",
      `remove-${header}`,
    );
    return decoy ? insertBeforeLastBrace(without, decoy) : without;
  }, `remove-${header}`);
}

function serviceCallbackMutation(source, mutate, decoy, label) {
  return inRegion(source, "async handleCallback", "async bindWechat", (region) => {
    const changed = mutate(region);
    assert.notEqual(changed, region, `${label}: fixtureChanged=false`);
    return decoy ? insertBeforeLastBrace(changed, decoy) : changed;
  }, label);
}

function signerMutation(source, decoy, label) {
  return inRegion(source, "function signature", "function safeSignatureEqual", (region) => {
    const changed = requiredReplace(region, "stateSigningKey()", '"public-state-key"', label);
    return decoy ? insertBeforeLastBrace(changed, decoy) : changed;
  }, label);
}

function variant(file, mutate, label) {
  const changed = mutate(rawSources[file]);
  assert.notEqual(changed, rawSources[file], `${label}: fixtureChanged=false`);
  return { ...rawSources, [file]: changed };
}

const mutationCases = [
  ["delete-query", "REJECT", "controller", (source) => requiredReplace(source, '@Query("origin")', '@Query("source")', "delete-query")],
  ["pass-origin-constant", "REJECT", "controller", (source) => requiredReplace(source, /buildQrConnectUrl\(\s*origin,/, 'buildQrConnectUrl("https://constant.invalid",', "pass-origin-constant")],
  ["remove-allowlist", "PASS", "service", (source) => requiredReplace(source, "if (!allowedOrigins.includes(url.origin))", "if (false)", "remove-allowlist")],
  ["remove-hmac", "REJECT", "service", (source) => {
    const changed = source.replaceAll("createHmac", "createHash");
    assert.notEqual(changed, source, "remove-hmac: fixtureChanged=false");
    return changed;
  }],
  ["remove-ttl", "PASS", "service", (source) => requiredReplace(source, "now - issuedAt >= WECHAT_OAUTH_STATE_TTL_MS", "false", "remove-ttl")],
  ["weaken-nonce", "PASS", "service", (source) => inRegion(source, "function buildSignedState", "function verifySignedState", (region) => requiredReplace(region, "randomBytes(12)", "randomBytes(8)", "weaken-nonce"), "weaken-nonce")],
  ["store-raw-browser-binding", "PASS", "service", (source) => inRegion(source, "buildQrConnectUrl(", "/** 回调：", (region) => requiredReplace(region, "browserBindingHash(browserBindingToken)", "browserBindingToken", "store-raw-browser-binding"), "store-raw-browser-binding")],
  ["skip-callback-browser-binding", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, /(resolveCorsOrigins\([\s\S]*?\),\s*)browserBindingToken,/, "$1undefined,", "skip-callback-browser-binding"), "", "skip-callback-browser-binding")],
  ["remove-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, ".claim(", ".peek(", "remove-claim"), "", "remove-claim")],
  ["exchange-before-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(requiredReplace(requiredReplace(region, ".claim(", ".__swap__(", "exchange-before-claim"), ".exchangeCode(", ".claim(", "exchange-before-claim"), ".__swap__(", ".exchangeCode(", "exchange-before-claim"), "", "exchange-before-claim")],
  ["drop-parent-origin-return", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, /\bparentOrigin(?=\s*[,}])/g, "parentOrigin: null", "drop-parent-origin-return"), "", "drop-parent-origin-return")],
  ["pass-binding-named-constant", "REJECT", "controller", (source) => inRegion(source, "config(", "/** 微信授权回调", (region) => requiredReplace(region, /extractWechatOAuthBindingCookie\(request\.headers\?\.cookie\)/, '"browser-binding-cookie"', "pass-binding-named-constant"), "pass-binding-named-constant")],
  ["hardcode-state-hmac-key", "REJECT", "service", (source) => signerMutation(source, "", "hardcode-state-hmac-key")],
  ["remove-callback-cache-control", "REJECT", "controller", (source) => removeCallbackHeader(source, "Cache-Control", "no-store, private, max-age=0")],
  ["remove-callback-referrer-policy", "REJECT", "controller", (source) => removeCallbackHeader(source, "Referrer-Policy", "no-referrer")],
  ["comment-spoof-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, ".claim(", ".peek(", "comment-spoof-claim"), "// this.oauthStates.claim(state!, verifiedState.expiresAt);", "comment-spoof-claim")],
  ["comment-spoof-hmac", "REJECT", "service", (source) => signerMutation(source, '// createHmac("sha256", stateSigningKey()); process.env.JWT_SECRET;', "comment-spoof-hmac")],
  ["comment-spoof-cache", "REJECT", "controller", (source) => removeCallbackHeader(source, "Cache-Control", "no-store, private, max-age=0", '// res.setHeader("Cache-Control", "no-store, private, max-age=0");')],
  ["comment-spoof-referrer", "REJECT", "controller", (source) => removeCallbackHeader(source, "Referrer-Policy", "no-referrer", '// res.setHeader("Referrer-Policy", "no-referrer");')],
  ["string-spoof-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, ".claim(", ".peek(", "string-spoof-claim"), 'const __decoy = "this.oauthStates.claim(state!, verifiedState.expiresAt)";', "string-spoof-claim")],
  ["template-spoof-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, ".claim(", ".peek(", "template-spoof-claim"), "const __decoy = `this.oauthStates.claim(state!, verifiedState.expiresAt)`;", "template-spoof-claim")],
  ["regex-spoof-claim", "REJECT", "service", (source) => serviceCallbackMutation(source, (region) => requiredReplace(region, ".claim(", ".peek(", "regex-spoof-claim"), "const __decoy = /this.oauthStates.claim(state)/;", "regex-spoof-claim")],
  ["string-spoof-hmac", "REJECT", "service", (source) => signerMutation(source, 'const __decoy = "createHmac(\\"sha256\\", stateSigningKey()) process.env.JWT_SECRET";', "string-spoof-hmac")],
  ["template-spoof-hmac", "REJECT", "service", (source) => signerMutation(source, "const __decoy = `createHmac(\"sha256\", stateSigningKey()) process.env.JWT_SECRET`;", "template-spoof-hmac")],
  ["regex-spoof-hmac", "REJECT", "service", (source) => signerMutation(source, 'const __decoy = /createHmac("sha256", stateSigningKey()) process.env.JWT_SECRET/;', "regex-spoof-hmac")],
  ["string-spoof-cache", "REJECT", "controller", (source) => removeCallbackHeader(source, "Cache-Control", "no-store, private, max-age=0", 'const __decoy = "res.setHeader(\\"Cache-Control\\", \\"no-store, private, max-age=0\\")";')],
  ["template-spoof-referrer", "REJECT", "controller", (source) => removeCallbackHeader(source, "Referrer-Policy", "no-referrer", "const __decoy = `res.setHeader(\"Referrer-Policy\", \"no-referrer\")`;" )],
];

const positiveCases = [
  ["optional-query-type", "controller", (source) => requiredReplace(source, "origin: string | undefined,", "origin?: string,", "optional-query-type")],
  ["renamed-query-variable", "controller", (source) => inRegion(source, "config(", "/** 微信授权回调", (region) => requiredReplace(requiredReplace(region, '@Query("origin") origin:', '@Query("origin") requestedOrigin:', "renamed-query-variable"), /buildQrConnectUrl\(\s*origin,/, "buildQrConnectUrl(\n      requestedOrigin,", "renamed-query-variable"), "renamed-query-variable")],
  ["binding-intermediate-variable", "controller", (source) => inRegion(source, "config(", "/** 微信授权回调", (region) => requiredReplace(region, "    const prepared = this.wechatAuth.buildQrConnectUrl(\n      origin,\n      extractWechatOAuthBindingCookie(request.headers?.cookie),\n    );", "    const currentBinding = extractWechatOAuthBindingCookie(request.headers?.cookie);\n    const prepared = this.wechatAuth.buildQrConnectUrl(\n      origin,\n      currentBinding,\n    );", "binding-intermediate-variable"), "binding-intermediate-variable")],
  ["security-extractor-import-alias", "controller", (source) => requiredReplace(requiredReplace(source, "  extractWechatOAuthBindingCookie,", "  extractWechatOAuthBindingCookie as readWechatBindingCookie,", "security-extractor-import-alias"), /extractWechatOAuthBindingCookie\(request/g, "readWechatBindingCookie(request", "security-extractor-import-alias")],
  ["renamed-service-helpers", "service", (source) => source.replaceAll("normalizeParentOrigin", "validateAllowedOrigin").replaceAll("buildSignedState", "issueBoundState").replaceAll("verifySignedState", "validateBoundState").replaceAll("stateSigningKey", "deriveStateSecret").replaceAll("signature", "signStatePayload").replaceAll(/\ballowedOrigins\b/g, "corsAllowlist").replaceAll(/\bnormalizedOrigin\b/g, "approvedOrigin").replaceAll(/\bverifiedState\b/g, "acceptedState")],
];

function runSelfTests() {
  const templateProbe = ts.createSourceFile(
    "template-probe.ts",
    'const probe = `decoyCall() ${realCall()}`;',
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  assert.equal(callsWithin(templateProbe, "decoyCall").length, 0, "模板正文不得产生调用证据");
  assert.equal(callsWithin(templateProbe, "realCall").length, 1, "模板插值中的真实表达式必须被遍历");
  const counts = { REJECT: 0, PASS: 0 };
  for (const [name, expected, file, mutate] of mutationCases) {
    const outcome = evaluate(variant(file, mutate, name));
    const actual = outcome.failed.length ? "REJECT" : "PASS";
    assert.equal(actual, expected, `${name}: expected ${expected}, received ${actual}`);
    counts[expected] += 1;
  }
  for (const [name, file, mutate] of positiveCases) {
    const outcome = evaluate(variant(file, mutate, name));
    assert.equal(outcome.failed.length, 0, `${name}: expected PASS, failed ${outcome.failed.map((item) => item.name).join(", ")}`);
  }
  return counts;
}

const main = evaluate(rawSources, true);
if (main.failed.length) process.exit(1);
let selfTestCounts;
try {
  selfTestCounts = runSelfTests();
} catch (error) {
  console.error(`  ✗ verifier 永久自检：${error.message}`);
  process.exit(1);
}
console.log(`\n${main.count} 项 AST 合同通过；永久自检：${selfTestCounts.REJECT} REJECT、${selfTestCounts.PASS} behavior-owned PASS、${positiveCases.length} 等价正例 PASS。`);
