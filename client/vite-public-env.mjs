const PUBLIC_CLIENT_ENV_KEYS = Object.freeze([
  "VITE_API_BASE_URL",
  "VITE_PUBLIC_SITE_ORIGIN",
  "VITE_ANALYTICS_ENABLED",
]);

export function createPublicClientEnvDefinitions(env) {
  return Object.fromEntries(
    PUBLIC_CLIENT_ENV_KEYS.map((key) => [
      `import.meta.env.${key}`,
      JSON.stringify(env[key] ?? ""),
    ]),
  );
}

export { PUBLIC_CLIENT_ENV_KEYS };
