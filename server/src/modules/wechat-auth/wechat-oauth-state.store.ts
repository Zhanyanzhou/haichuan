import { ServiceUnavailableException } from "@nestjs/common";

export const WECHAT_OAUTH_STATE_TTL_MS = 5 * 60 * 1000;

const MAX_RECENTLY_CONSUMED_STATES = 5_000;

/**
 * 同一进程内的重复回调短路缓存。
 *
 * 签名 state、浏览器绑定及微信 code 的一次性兑换才是跨请求安全边界；此缓存
 * 不冒充多实例共享存储。请求跨实例或服务重启时，仍由微信拒绝重复 code。
 */
export class WechatOAuthStateStore {
  private readonly consumedStates = new Map<string, number>();

  claim(state: string, expiresAt: number, now = Date.now()): boolean {
    this.prune(now);
    if (this.consumedStates.has(state)) return false;
    if (this.consumedStates.size >= MAX_RECENTLY_CONSUMED_STATES) {
      throw new ServiceUnavailableException("微信登录请求过多，请稍后重试");
    }
    this.consumedStates.set(state, expiresAt);
    return true;
  }

  private prune(now: number): void {
    for (const [state, expiresAt] of this.consumedStates) {
      if (expiresAt <= now) this.consumedStates.delete(state);
    }
  }
}


