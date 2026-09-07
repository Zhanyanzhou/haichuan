type ExpressProxySettings = {
  set: (setting: string, value: unknown) => unknown;
};

/**
 * server 只信任直接相连的 client nginx 一跳。
 * client nginx 必须先把可信边缘元数据规范化成单值；不得在这里按公网链路猜测更多 hop。
 */
export function configureProxyTrust(instance: ExpressProxySettings): void {
  instance.set("trust proxy", 1);
}
