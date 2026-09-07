import type { IncomingMessage, ServerResponse } from "node:http";
import type { Options as PinoHttpOptions } from "pino-http";
import { sanitizeLogArguments } from "./log-redaction";
import { requestLogPath, requestPathOnly } from "./request-path";
import { resolveRequestId } from "./request-id";

export function createPinoHttpOptions(
  environment: NodeJS.ProcessEnv = process.env,
): PinoHttpOptions {
  return {
    genReqId: (req: IncomingMessage, res: ServerResponse) => {
      const requestId = resolveRequestId(req.headers["x-request-id"]);
      res.setHeader("X-Request-Id", requestId);
      return requestId;
    },
    transport:
      environment.NODE_ENV !== "production"
        ? {
            target: "pino-pretty",
            options: { colorize: true, translateTime: "SYS:HH:MM:ss.l" },
          }
        : undefined,
    autoLogging: {
      ignore: (req) => {
        const path = requestPathOnly((req as { url?: string }).url);
        return ["/api/health", "/api/ready", "/api/startup"].includes(path);
      },
    },
    redact: {
      paths: [
        "req.headers",
        "request.headers",
        "headers.authorization",
        "headers.cookie",
        "authorization",
        "cookie",
        "password",
        "token",
        "secret",
        "rawBody",
        "body",
      ],
      censor: "[REDACTED]",
    },
    hooks: {
      logMethod(args, method) {
        method.apply(
          this,
          sanitizeLogArguments(args) as [unknown, string?, ...unknown[]],
        );
      },
    },
    serializers: {
      req: (req: {
        id?: string;
        method: string;
        url: string;
        remoteAddress?: string;
      }) => ({
        requestId: req.id,
        method: req.method,
        path: requestLogPath(req.url),
      }),
      res: () => undefined,
    },
  };
}

