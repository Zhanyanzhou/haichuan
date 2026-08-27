export type AnalyticsDataset = "PRODUCTION" | "TEST";

export function getConfiguredAnalyticsDataset(): AnalyticsDataset | null {
  const configured =
    process.env.ANALYTICS_DATASET?.trim().toLowerCase() || "test";
  const dataset =
    configured === "production"
      ? "PRODUCTION"
      : configured === "test"
        ? "TEST"
        : null;

  if (process.env.NODE_ENV === "production" && dataset !== "PRODUCTION") {
    return null;
  }
  return dataset;
}
