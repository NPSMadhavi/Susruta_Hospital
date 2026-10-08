export const PORTAL_BADGE_SECTIONS = ["appointments", "prescriptions", "docs"] as const;

export type PortalBadgeSection = (typeof PORTAL_BADGE_SECTIONS)[number];
export type PortalSectionItems = Record<PortalBadgeSection, string[]>;
export type PortalSectionCounts = Record<PortalBadgeSection, number>;
export type PortalBadgeStorage = Pick<Storage, "getItem" | "setItem">;

export function emptyPortalSectionSeen(): PortalSectionItems {
  return { appointments: [], prescriptions: [], docs: [] };
}

export function portalSectionStorageKey(patientId: number): string {
  return `susruta:portal:section-seen:v1:${patientId}`;
}

export function readPortalSectionSeen(
  storage: PortalBadgeStorage | undefined,
  patientId: number,
): PortalSectionItems {
  try {
    const saved: unknown = JSON.parse(storage?.getItem(portalSectionStorageKey(patientId)) ?? "null");
    if (!saved || typeof saved !== "object") return emptyPortalSectionSeen();

    const result = emptyPortalSectionSeen();
    for (const section of PORTAL_BADGE_SECTIONS) {
      const keys = (saved as Record<string, unknown>)[section];
      if (!Array.isArray(keys) || !keys.every((key) => typeof key === "string")) {
        return emptyPortalSectionSeen();
      }
      result[section] = [...new Set(keys.filter(Boolean))];
    }
    return result;
  } catch {
    return emptyPortalSectionSeen();
  }
}

export function savePortalSectionSeen(
  storage: PortalBadgeStorage | undefined,
  patientId: number,
  seen: PortalSectionItems,
): boolean {
  if (!storage) return false;
  try {
    const key = portalSectionStorageKey(patientId);
    const serialized = JSON.stringify(seen);
    if (storage.getItem(key) !== serialized) storage.setItem(key, serialized);
    return true;
  } catch {
    // The current visit still remembers seen items when browser storage is unavailable.
    return false;
  }
}

export function markPortalSectionSeen(
  seen: PortalSectionItems,
  activeSection: string,
  items: PortalSectionItems,
): PortalSectionItems {
  const section = PORTAL_BADGE_SECTIONS.find((section) => section === activeSection);
  if (!section) return seen;

  const keys = new Set(seen[section]);
  const initialSize = keys.size;
  for (const key of items[section]) if (key) keys.add(key);
  if (keys.size === initialSize) return seen;
  return { ...seen, [section]: [...keys] };
}

export function countUnseenPortalItems(
  seen: PortalSectionItems,
  items: PortalSectionItems,
): PortalSectionCounts {
  const counts: PortalSectionCounts = { appointments: 0, prescriptions: 0, docs: 0 };
  for (const section of PORTAL_BADGE_SECTIONS) {
    const seenKeys = new Set(seen[section]);
    counts[section] = [...new Set(items[section])].filter((key) => key && !seenKeys.has(key)).length;
  }
  return counts;
}