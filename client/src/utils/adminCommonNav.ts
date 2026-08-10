import { navigationConfig } from "@/config/navigationConfig";

const STORAGE_PREFIX = "haichuan-admin-common-nav";
const WINDOW_MS = 28 * 24 * 60 * 60 * 1000;
const MAX_COMMON_ITEMS = 5;
const MAX_PINNED_ITEMS = 2;

export interface CommonNavItem {
  key: string;
  label: string;
  route: string;
  pinned: boolean;
}

interface StoredCommonNav {
  pins: string[];
  visits: Record<string, number[]>;
}

interface EligibleDestination {
  key: string;
  label: string;
  route: string;
}

function getStorageKey(userId: number | undefined) {
  return `${STORAGE_PREFIX}:${userId ?? "anonymous"}`;
}

function getEligibleDestinations(): EligibleDestination[] {
  const destinations = new Map<string, EligibleDestination>();

  navigationConfig
    .filter((domain) => domain.key !== "common" && !domain.disabled)
    .forEach((domain) => {
      domain.groups.forEach((group) => {
        group.items.forEach((item) => {
          if (!item.route || item.route.includes("?") || item.disabled || item.featureFlag || destinations.has(item.route)) {
            return;
          }
          destinations.set(item.route, {
            key: item.key,
            label: item.label,
            route: item.route,
          });
        });
      });
    });

  return [...destinations.values()];
}

function getFallbackDestinations(destinations: EligibleDestination[]) {
  const fallbackRoutes = navigationConfig
    .find((domain) => domain.key === "common")
    ?.groups.flatMap((group) => group.items)
    .map((item) => item.route) ?? [];

  return fallbackRoutes
    .map((route) => destinations.find((destination) => destination.route === route))
    .filter((destination): destination is EligibleDestination => Boolean(destination));
}

function readStoredCommonNav(userId: number | undefined): StoredCommonNav {
  if (typeof window === "undefined") return { pins: [], visits: {} };

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId));
    if (!raw) return { pins: [], visits: {} };
    const data = JSON.parse(raw) as Partial<StoredCommonNav>;
    return {
      pins: Array.isArray(data.pins) ? data.pins.filter((route) => typeof route === "string") : [],
      visits: data.visits && typeof data.visits === "object" ? data.visits : {},
    };
  } catch {
    return { pins: [], visits: {} };
  }
}

function writeStoredCommonNav(userId: number | undefined, data: StoredCommonNav) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(getStorageKey(userId), JSON.stringify(data));
}

function getRecentVisits(visits: number[], now: number) {
  return visits.filter((timestamp) => Number.isFinite(timestamp) && timestamp > now - WINDOW_MS);
}

function getVisitScore(visits: number[], now: number) {
  return visits.reduce((score, timestamp) => {
    const ageRatio = Math.min(1, Math.max(0, (now - timestamp) / WINDOW_MS));
    return score + 1 + (1 - ageRatio);
  }, 0);
}

export function getCommonNavItems(userId: number | undefined): CommonNavItem[] {
  const destinations = getEligibleDestinations();
  const fallback = getFallbackDestinations(destinations);
  const stored = readStoredCommonNav(userId);
  const now = Date.now();
  const validRoutes = new Set(destinations.map((destination) => destination.route));
  const pins = [...new Set(stored.pins)].filter((route) => validRoutes.has(route)).slice(0, MAX_PINNED_ITEMS);

  const visitRecords = new Map(
    destinations.map((destination) => [
      destination.route,
      getRecentVisits(stored.visits[destination.route] ?? [], now),
    ]),
  );
  const hasVisitHistory = [...visitRecords.values()].some((visits) => visits.length > 0);
  const pinnedDestinations = pins
    .map((route) => destinations.find((destination) => destination.route === route))
    .filter((destination): destination is EligibleDestination => Boolean(destination));
  const automaticDestinations = destinations
    .filter((destination) => !pins.includes(destination.route))
    .filter((destination) => !hasVisitHistory || (visitRecords.get(destination.route)?.length ?? 0) > 0)
    .sort((a, b) => {
      const scoreDifference = getVisitScore(visitRecords.get(b.route) ?? [], now) - getVisitScore(visitRecords.get(a.route) ?? [], now);
      return scoreDifference || a.label.localeCompare(b.label, "zh-CN");
    });
  const selected = hasVisitHistory || pinnedDestinations.length > 0
    ? [...pinnedDestinations, ...automaticDestinations]
    : fallback;

  return selected.slice(0, MAX_COMMON_ITEMS).map((destination) => ({
    ...destination,
    pinned: pins.includes(destination.route),
  }));
}

export function recordCommonNavVisit(pathname: string, userId: number | undefined) {
  const destination = getEligibleDestinations()
    .sort((a, b) => b.route.length - a.route.length)
    .find(({ route }) => pathname === route || pathname.startsWith(`${route}/`));
  if (!destination) return;

  const now = Date.now();
  const stored = readStoredCommonNav(userId);
  const visits = getRecentVisits(stored.visits[destination.route] ?? [], now);
  stored.visits[destination.route] = [...visits, now].slice(-50);
  writeStoredCommonNav(userId, stored);
}

export function toggleCommonNavPin(route: string, userId: number | undefined) {
  const stored = readStoredCommonNav(userId);
  const pins = [...new Set(stored.pins)];
  const pinIndex = pins.indexOf(route);

  if (pinIndex >= 0) {
    pins.splice(pinIndex, 1);
  } else if (pins.length < MAX_PINNED_ITEMS) {
    pins.push(route);
  }

  writeStoredCommonNav(userId, { ...stored, pins });
}
