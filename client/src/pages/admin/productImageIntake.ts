const imageAngleRanks: Record<string, number> = {
  主图: 0, 正面: 1, FRONT: 1, 佩戴: 2, 侧面: 3, SIDE: 3,
  背面: 4, BACK: 4, 顶部: 5, 细节: 6, DETAIL: 6,
};

export function productImageAngle(name: string): string {
  const stem = name.replace(/\.[^.]+$/, "").replace(/\s*[-–—]?\s*副本(?:\s*\(\d+\))?$/u, "");
  return /(主图|正面|佩戴|侧面|背面|顶部|细节)$/u.exec(stem)?.[1]
    ?? /(?:^|[_ -])(FRONT|SIDE|BACK|DETAIL)(?=$|[_ -])/i.exec(stem)?.[1].toUpperCase()
    ?? "其他";
}

export function productImageRank(angle: string): number {
  return imageAngleRanks[angle] ?? 7;
}

const fingerprints = new WeakMap<File, Promise<string>>();

export function productImageFingerprint(file: File): Promise<string> {
  const existing = fingerprints.get(file);
  if (existing) return existing;
  const pending = (async () => {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  })();
  fingerprints.set(file, pending);
  return pending;
}
