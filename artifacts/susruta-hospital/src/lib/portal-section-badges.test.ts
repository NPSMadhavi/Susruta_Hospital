import assert from "node:assert/strict";
import test from "node:test";
import {
  countUnseenPortalItems,
  emptyPortalSectionSeen,
  markPortalSectionSeen,
  portalSectionStorageKey,
  readPortalSectionSeen,
  savePortalSectionSeen,
  type PortalBadgeStorage,
  type PortalSectionItems,
} from "./portal-section-badges.ts";

const items: PortalSectionItems = {
  appointments: ["appointment:1"],
  prescriptions: ["prescription:1", "prescription:2"],
  docs: ["document:1", "document:2", "document:3"],
};

function memoryStorage() {
  const values = new Map<string, string>();
  let writes = 0;
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); writes += 1; },
    get writes() { return writes; },
  };
}

test("opening one section clears only its unread badge and revisiting does not mutate state", () => {
  const initial = emptyPortalSectionSeen();
  assert.deepEqual(countUnseenPortalItems(initial, items), { appointments: 1, prescriptions: 2, docs: 3 });

  const opened = markPortalSectionSeen(initial, "docs", items);
  assert.deepEqual(countUnseenPortalItems(opened, items), { appointments: 1, prescriptions: 2, docs: 0 });
  assert.strictEqual(markPortalSectionSeen(opened, "dashboard", items), opened);
  assert.strictEqual(markPortalSectionSeen(opened, "docs", items), opened);
  assert.deepEqual(initial.docs, []);
});

test("new items become unread while inactive, and are seen when their section opens", () => {
  const seen = markPortalSectionSeen(emptyPortalSectionSeen(), "docs", items);
  const updated = { ...items, docs: [...items.docs, "document:4"] };
  assert.equal(countUnseenPortalItems(seen, updated).docs, 1);
  const stillInactive = markPortalSectionSeen(seen, "appointments", updated);
  assert.equal(countUnseenPortalItems(stillInactive, updated).docs, 1);
  const opened = markPortalSectionSeen(stillInactive, "docs", updated);
  assert.equal(countUnseenPortalItems(opened, updated).docs, 0);

  const arrivingWhileOpen = { ...updated, docs: [...updated.docs, "document:5"] };
  assert.equal(countUnseenPortalItems(markPortalSectionSeen(opened, "docs", arrivingWhileOpen), arrivingWhileOpen).docs, 0);
});

test("seen keys survive reloads and are isolated by patient", () => {
  const storage = memoryStorage();
  const seen = markPortalSectionSeen(emptyPortalSectionSeen(), "prescriptions", items);
  assert.equal(savePortalSectionSeen(storage, 11, seen), true);
  assert.deepEqual(countUnseenPortalItems(readPortalSectionSeen(storage, 11), items), { appointments: 1, prescriptions: 0, docs: 3 });
  assert.deepEqual(readPortalSectionSeen(storage, 22), emptyPortalSectionSeen());

  savePortalSectionSeen(storage, 22, markPortalSectionSeen(emptyPortalSectionSeen(), "docs", items));
  assert.deepEqual(readPortalSectionSeen(storage, 11), seen);
  assert.equal(countUnseenPortalItems(readPortalSectionSeen(storage, 22), items).prescriptions, 2);
  assert.equal(storage.writes, 2);
  savePortalSectionSeen(storage, 11, seen);
  assert.equal(storage.writes, 2, "unchanged state is not written again");
});

test("removed, reordered, duplicate, and empty keys do not inflate badges", () => {
  const seen = markPortalSectionSeen(emptyPortalSectionSeen(), "docs", items);
  const changed = { ...items, docs: ["document:3", "document:4", "document:4", ""] };
  assert.equal(countUnseenPortalItems(seen, changed).docs, 1);
  const opened = markPortalSectionSeen(seen, "docs", changed);
  assert.equal(countUnseenPortalItems(opened, items).docs, 0, "previously seen items stay seen if they return");
  assert.strictEqual(markPortalSectionSeen(opened, "docs", { ...changed, docs: [...changed.docs].reverse() }), opened);
});

test("missing or corrupt storage safely starts with unseen items", () => {
  const storage = memoryStorage();
  assert.deepEqual(readPortalSectionSeen(storage, 11), emptyPortalSectionSeen());
  for (const invalid of ["not json", "null", "[]", "{}", '{"appointments":[],"prescriptions":[],"docs":[3]}']) {
    storage.setItem(portalSectionStorageKey(11), invalid);
    assert.deepEqual(readPortalSectionSeen(storage, 11), emptyPortalSectionSeen(), invalid);
  }
  storage.setItem(portalSectionStorageKey(11), JSON.stringify({ ...items, docs: ["document:1", "document:1", ""] }));
  assert.deepEqual(readPortalSectionSeen(storage, 11).docs, ["document:1"]);
});

test("unavailable storage never prevents sections being marked seen in memory", () => {
  const blocked: PortalBadgeStorage = {
    getItem: () => { throw new Error("Storage blocked"); },
    setItem: () => { throw new Error("Storage blocked"); },
  };
  for (const storage of [undefined, blocked]) {
    const seen = markPortalSectionSeen(readPortalSectionSeen(storage, 11), "docs", items);
    assert.equal(savePortalSectionSeen(storage, 11, seen), false);
    assert.equal(countUnseenPortalItems(seen, items).docs, 0);
  }
  const full: PortalBadgeStorage = { getItem: () => null, setItem: () => { throw new Error("Quota exceeded"); } };
  assert.equal(savePortalSectionSeen(full, 11, items), false);
});