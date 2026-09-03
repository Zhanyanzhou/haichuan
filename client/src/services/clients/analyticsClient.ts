import api from "../httpClient";

export interface AnalyticsOverview {
  collection: {
    ingestionEnabled: boolean;
    geoHeadersEnabled: boolean;
    dataset: "PRODUCTION" | "TEST" | null;
    retentionDays: number;
    consentRequired: true;
  };
  period: { days: number; startDate: string; endDate: string };
  totals: {
    pageViews: number;
    visitors: number;
    sessions: number;
    newVisitors: number;
    returningVisitors: number;
    returnRate: number;
    pagesPerSession: number;
  };
  trend: Array<{
    date: string;
    pageViews: number;
    visitors: number;
    sessions: number;
  }>;
  topPages: Array<{ pagePath: string; pageViews: number; visitors: number }>;
  devices: Array<{ deviceType: string; pageViews: number; visitors: number }>;
  sources: Array<{ source: string; pageViews: number; visitors: number }>;
  regions: Array<{
    countryCode: string;
    region: string;
    city: string;
    pageViews: number;
    visitors: number;
  }>;
}

export interface AnalyticsVisitor {
  visitorKey: string;
  firstSeen: string;
  lastSeen: string;
  activeDays: number;
  sessions: number;
  pageViews: number;
  returning: boolean;
  countryCode?: string | null;
  region?: string | null;
  city?: string | null;
  deviceType?: string | null;
}

export interface AnalyticsEventRow {
  id: number;
  occurredAt: string;
  eventName: string;
  pagePath?: string | null;
  productId?: number | null;
  searchTerm?: string | null;
  source?: string | null;
  deviceType?: string | null;
  sessionId?: string | null;
  visitorKey?: string | null;
}

export const analyticsApi = {
  getOverview: (days: number) =>
    api.get("/analytics/overview", { params: { days } }),
  getVisitors: (days: number) =>
    api.get("/analytics/visitors", { params: { days } }),
  getEvents: (params: { eventName?: string; hours: number; pageSize?: number }) =>
    api.get("/analytics/events", { params }),
};
