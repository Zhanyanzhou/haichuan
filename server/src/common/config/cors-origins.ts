const DEFAULT_DEVELOPMENT_CORS_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:5175",
  "http://localhost:5176",
  "http://localhost:5177",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "http://127.0.0.1:5175",
  "http://127.0.0.1:5176",
  "http://127.0.0.1:5177",
  "http://localhost:3000",
];

function parseConfiguredOrigins(configuredOrigins: string): string[] {
  const origins = configuredOrigins.split(",").map((origin) => origin.trim());
  if (origins.some((origin) => !origin)) {
    throw new Error("CORS_ORIGIN 不能包含空白来源。");
  }

  for (const origin of origins) {
    try {
      const url = new URL(origin);
      if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
        throw new Error();
      }
    } catch {
      throw new Error(
        "CORS_ORIGIN 必须为一个或多个以逗号分隔的 HTTP(S) 来源（不含路径、查询参数或尾随斜杠）。",
      );
    }
  }

  return [...new Set(origins)];
}

export function resolveCorsOrigins(
  nodeEnv: string | undefined,
  configuredOrigins: string | undefined,
): string[] {
  const isProduction = nodeEnv === "production";
  if (!configuredOrigins?.trim()) {
    if (isProduction) {
      throw new Error(
        "CORS_ORIGIN 在生产环境为必填项；请配置已确认的正式前端来源。",
      );
    }
    return [...DEFAULT_DEVELOPMENT_CORS_ORIGINS];
  }

  const origins = parseConfiguredOrigins(configuredOrigins);
  if (isProduction) {
    if (origins.some((origin) => new URL(origin).protocol !== "https:")) {
      throw new Error("CORS_ORIGIN 在生产环境只允许 HTTPS 来源。");
    }
  } else {
    for (const origin of origins) {
      const hostname = new URL(origin).hostname;
      if (!["localhost", "127.0.0.1", "[::1]"].includes(hostname)) {
        throw new Error(
          "开发环境 CORS_ORIGIN 只允许 localhost、127.0.0.1 或 [::1] 的精确来源。",
        );
      }
    }
  }

  return origins;
}
