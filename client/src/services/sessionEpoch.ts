export type SessionDomain = "admin" | "customer";

const sessionEpochs: Record<SessionDomain, number> = {
  admin: 0,
  customer: 0,
};

export function currentSessionEpoch(domain: SessionDomain): number {
  return sessionEpochs[domain];
}

export function advanceSessionEpoch(domain: SessionDomain): number {
  sessionEpochs[domain] += 1;
  return sessionEpochs[domain];
}

export function isCurrentSessionEpoch(
  domain: SessionDomain,
  epoch: number,
): boolean {
  return currentSessionEpoch(domain) === epoch;
}

export class StaleSessionResponseError extends Error {
  readonly domain: SessionDomain;

  constructor(domain: SessionDomain) {
    super("会话身份已变更，已忽略旧请求结果");
    this.name = "StaleSessionResponseError";
    this.domain = domain;
  }
}

export function isStaleSessionResponseError(
  error: unknown,
): error is StaleSessionResponseError {
  return error instanceof StaleSessionResponseError;
}
