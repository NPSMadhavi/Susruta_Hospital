// In-memory permission status store — tracks camera/mic state per participant per appointment

export type PermStatus = {
  name: string;
  role: "patient" | "guest";
  camera: boolean | null; // null = unknown (browser didn't expose)
  mic: boolean | null;
  updatedAt: number;
};

const store = new Map<number, Map<string, PermStatus>>();

export function setPermission(apptId: number, key: string, status: PermStatus) {
  if (!store.has(apptId)) store.set(apptId, new Map());
  store.get(apptId)!.set(key, { ...status, updatedAt: Date.now() });
}

export function getPermissions(apptId: number): PermStatus[] {
  const map = store.get(apptId);
  if (!map) return [];
  return Array.from(map.values()).sort((a, b) => {
    // patient first, then guests by name
    if (a.role !== b.role) return a.role === "patient" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export function clearPermissions(apptId: number) {
  store.delete(apptId);
}
