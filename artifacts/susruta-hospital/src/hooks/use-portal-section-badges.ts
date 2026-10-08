import { useEffect, useMemo, useState } from "react";
import {
  countUnseenPortalItems,
  emptyPortalSectionSeen,
  markPortalSectionSeen,
  readPortalSectionSeen,
  savePortalSectionSeen,
  type PortalBadgeStorage,
  type PortalSectionItems,
} from "@/lib/portal-section-badges";

function browserStorage(): PortalBadgeStorage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}

export function usePortalSectionBadges(
  patientId: number | undefined,
  activeSection: string,
  items: PortalSectionItems,
  ready: boolean,
) {
  const storedSeen = useMemo(
    () => patientId === undefined ? emptyPortalSectionSeen() : readPortalSectionSeen(browserStorage(), patientId),
    [patientId],
  );
  const [snapshot, setSnapshot] = useState({ patientId, seen: storedSeen });
  // Never reuse another account's state, even during the render before the effect runs.
  const seen = snapshot.patientId === patientId ? snapshot.seen : storedSeen;

  // Callers may create arrays each render; effects depend on their contents, not identity/order.
  const itemSignature = JSON.stringify({
    appointments: [...new Set(items.appointments)].sort(),
    prescriptions: [...new Set(items.prescriptions)].sort(),
    docs: [...new Set(items.docs)].sort(),
  });
  const currentItems = useMemo(() => JSON.parse(itemSignature) as PortalSectionItems, [itemSignature]);

  useEffect(() => {
    if (patientId === undefined || !ready) return;
    const nextSeen = markPortalSectionSeen(seen, activeSection, currentItems);
    if (nextSeen !== seen) savePortalSectionSeen(browserStorage(), patientId, nextSeen);
    if (snapshot.patientId !== patientId || nextSeen !== seen) {
      setSnapshot({ patientId, seen: nextSeen });
    }
  }, [patientId, activeSection, currentItems, ready, seen, snapshot.patientId]);

  if (patientId === undefined || !ready) return { appointments: 0, prescriptions: 0, docs: 0 };
  // Clear the open section immediately, including new items arriving while it is open.
  return countUnseenPortalItems(markPortalSectionSeen(seen, activeSection, currentItems), currentItems);
}