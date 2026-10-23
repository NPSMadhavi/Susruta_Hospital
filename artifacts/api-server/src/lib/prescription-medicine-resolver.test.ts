import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeMedicineName,
  withMedicineLock,
  resolveMedicinesPayload,
  resolvePrescriptionMedicines,
} from "./prescription-medicine-resolver";

describe("Prescription Medicine Resolver & Auto-Creation Unit Tests", () => {
  // ── 1. Name Normalization Tests ──────────────────────────────
  describe("normalizeMedicineName", () => {
    test("trims leading and trailing whitespace", () => {
      assert.equal(normalizeMedicineName("  Dolo 650  "), "Dolo 650");
      assert.equal(normalizeMedicineName("\t\nHaritaki Churna \n"), "Haritaki Churna");
    });

    test("collapses multiple consecutive internal spaces into a single space", () => {
      assert.equal(normalizeMedicineName("Dolo    650"), "Dolo 650");
      assert.equal(normalizeMedicineName("Talishadya   Churna   Special"), "Talishadya Churna Special");
    });

    test("preserves casing of entered medicine name", () => {
      assert.equal(normalizeMedicineName("dolo 650"), "dolo 650");
      assert.equal(normalizeMedicineName("Dolo 650"), "Dolo 650");
      assert.equal(normalizeMedicineName("DOLO 650"), "DOLO 650");
    });

    test("handles empty and non-string values safely", () => {
      assert.equal(normalizeMedicineName(""), "");
      assert.equal(normalizeMedicineName("   "), "");
      assert.equal(normalizeMedicineName(null as any), "");
      assert.equal(normalizeMedicineName(undefined as any), "");
    });
  });

  // ── 2. Concurrency Lock Tests ────────────────────────────────
  describe("withMedicineLock", () => {
    test("runs operations with the same key sequentially to prevent duplicate creation race conditions", async () => {
      const order: number[] = [];
      const key = "dolo 650";

      const p1 = withMedicineLock(key, async () => {
        await new Promise((r) => setTimeout(r, 40));
        order.push(1);
        return "first";
      });

      const p2 = withMedicineLock(key, async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
        return "second";
      });

      const [r1, r2] = await Promise.all([p1, p2]);
      assert.equal(r1, "first");
      assert.equal(r2, "second");
      assert.deepEqual(order, [1, 2], "Second operation must wait for the first operation holding the lock");
    });

    test("runs operations with different keys independently without blocking", async () => {
      const order: string[] = [];

      const p1 = withMedicineLock("med-a", async () => {
        await new Promise((r) => setTimeout(r, 50));
        order.push("med-a");
      });

      const p2 = withMedicineLock("med-b", async () => {
        await new Promise((r) => setTimeout(r, 10));
        order.push("med-b");
      });

      await Promise.all([p1, p2]);
      assert.deepEqual(order, ["med-b", "med-a"], "med-b finished first because it had a separate lock");
    });
  });

  // ── 3. Medicine Resolution & Auto-Creation Core Logic ────────
  describe("resolveMedicinesPayload", () => {
    // In-memory mock database store for deterministic testing
    const createMockStore = () => {
      let idCounter = 100;
      let medNumCounter = 101;
      const store: Array<{
        id: number;
        medicineId: string;
        medicineName: string;
        dosage: string | null;
        deleteColumn: number;
      }> = [
        {
          id: 1,
          medicineId: "AY-MED-0101",
          medicineName: "Haritaki Churna",
          dosage: "3g twice daily",
          deleteColumn: 0,
        },
        {
          id: 2,
          medicineId: "AY-MED-0102",
          medicineName: "Talishadya Churna",
          dosage: "2g with honey",
          deleteColumn: 0,
        },
      ];

      const finder = async (name: string) => {
        const clean = normalizeMedicineName(name).toLowerCase();
        const found = store.find(
          (m) => m.deleteColumn === 0 && normalizeMedicineName(m.medicineName).toLowerCase() === clean
        );
        return found ? { id: found.id, medicineId: found.medicineId, medicineName: found.medicineName, dosage: found.dosage } : null;
      };

      const creator = async (name: string, dosage?: string | null) => {
        idCounter++;
        let maxNum = 100;
        for (const item of store) {
          const match = item.medicineId.match(/(?:AY-MED-|MED-)(\d+)/i);
          if (match && match[1]) {
            const parsed = parseInt(match[1], 10);
            if (parsed > maxNum) maxNum = parsed;
          }
        }
        const nextId = `AY-MED-${String(maxNum + 1).padStart(4, "0")}`;
        const newRecord = {
          id: idCounter,
          medicineId: nextId,
          medicineName: normalizeMedicineName(name),
          dosage: dosage || "-",
          deleteColumn: 0,
        };
        store.push(newRecord);
        return { id: newRecord.id, medicineId: newRecord.medicineId, medicineName: newRecord.medicineName };
      };

      return { store, finder, creator };
    };

    test("matches existing medicines case-insensitively and attaches medicineId and medicineDbId", async () => {
      const { finder, creator, store } = createMockStore();

      const rx = {
        digitalPrescription: true,
        diagnosis: "Digestive issues",
        notes: "",
        formulationRows: [
          {
            id: "row_1",
            medicines: [
              {
                id: "sub_1",
                name: "haritaki churna", // lowercase
                dosage: "3g",
              },
            ],
            toBeTaken: "After food",
            timing: {
              morning: { count: "1", mealRelation: "after" },
              afternoon: { count: "0", mealRelation: "" },
              night: { count: "1", mealRelation: "after" },
            },
            duration: "7 days",
          },
        ],
      };

      const { modified, payload } = await resolveMedicinesPayload(rx, finder, creator);

      assert.equal(modified, true);
      assert.equal(payload.formulationRows[0].medicines[0].medicineId, "AY-MED-0101");
      assert.equal(payload.formulationRows[0].medicines[0].medicineDbId, 1);
      assert.equal(store.length, 2, "No new medicine should be created when medicine already exists");
    });

    test("matches existing medicines with whitespace variations and does not create duplicate", async () => {
      const { finder, creator, store } = createMockStore();

      const rx = {
        digitalPrescription: true,
        formulationRows: [
          {
            id: "row_1",
            medicines: [
              {
                id: "sub_1",
                name: "   Talishadya     Churna   ", // extra leading, trailing, and internal spaces
                dosage: "2g",
              },
            ],
          },
        ],
      };

      const { modified, payload } = await resolveMedicinesPayload(rx, finder, creator);

      assert.equal(modified, true);
      assert.equal(payload.formulationRows[0].medicines[0].medicineId, "AY-MED-0102");
      assert.equal(payload.formulationRows[0].medicines[0].medicineDbId, 2);
      assert.equal(store.length, 2, "Duplicate medicine must NOT be created");
    });

    test("CRITICAL DATA SEPARATION RULE: Editing dosage on prescription NEVER modifies master medicine record", async () => {
      const { finder, creator, store } = createMockStore();

      const rx = {
        digitalPrescription: true,
        formulationRows: [
          {
            id: "row_1",
            medicines: [
              {
                id: "sub_1",
                name: "Haritaki Churna",
                dosage: "10g SPECIAL CUSTOM DOSAGE", // Doctor customized the prescription dosage
              },
            ],
            timing: {
              morning: { count: "2", mealRelation: "before" },
            },
            duration: "14 days",
          },
        ],
      };

      const { payload } = await resolveMedicinesPayload(rx, finder, creator);

      // 1. Prescription retains the custom dosage and timing
      assert.equal(payload.formulationRows[0].medicines[0].dosage, "10g SPECIAL CUSTOM DOSAGE");
      assert.equal(payload.formulationRows[0].timing.morning.count, "2");

      // 2. Master database record remains untouched with its original dosage
      const masterRecord = store.find((m) => m.medicineId === "AY-MED-0101");
      assert.equal(masterRecord?.dosage, "3g twice daily", "Master medicine database record must NEVER be mutated!");
    });

    test("automatically creates newly entered custom medicine and assigns generated ID", async () => {
      const { finder, creator, store } = createMockStore();

      const rx = {
        digitalPrescription: true,
        formulationRows: [
          {
            id: "row_1",
            medicines: [
              {
                id: "sub_1",
                name: "Dolo 650",
                dosage: "650",
              },
            ],
            toBeTaken: "After meals",
            timing: {
              morning: { count: "1", mealRelation: "after" },
              afternoon: { count: "0", mealRelation: "" },
              night: { count: "1", mealRelation: "after" },
            },
            duration: "5 days",
          },
        ],
      };

      const { modified, payload } = await resolveMedicinesPayload(rx, finder, creator);

      assert.equal(modified, true);
      const med = payload.formulationRows[0].medicines[0];
      assert.ok(med.medicineId && med.medicineId.startsWith("AY-MED-"), "Must have generated AY-MED-XXXX ID");
      assert.ok(med.medicineDbId > 0, "Must have valid database ID");

      // Verify created in master store
      assert.equal(store.length, 3);
      const createdRecord = store.find((m) => m.medicineId === med.medicineId);
      assert.ok(createdRecord);
      assert.equal(createdRecord.medicineName, "Dolo 650");
      assert.equal(createdRecord.dosage, "650");
      assert.equal(createdRecord.deleteColumn, 0, "New medicine must be active (deleteColumn: 0)");
    });

    test("supports Combined Set with both existing medicines and new custom medicines", async () => {
      const { finder, creator, store } = createMockStore();

      // Combined Set containing 2 existing medicines and 1 new custom medicine
      const rx = {
        digitalPrescription: true,
        formulationRows: [
          {
            id: "combined_set_1",
            medicines: [
              { id: "sub_1", name: "Haritaki Churna", dosage: "3g" },
              { id: "sub_2", name: "Talishadya Churna", dosage: "2g" },
              { id: "sub_3", name: "Dolo 650", dosage: "650" }, // New medicine
            ],
            toBeTaken: "Warm water",
            duration: "10 days",
          },
        ],
      };

      const { modified, payload } = await resolveMedicinesPayload(rx, finder, creator);

      assert.equal(modified, true);
      const meds = payload.formulationRows[0].medicines;
      assert.equal(meds.length, 3, "Combined set must preserve all 3 medicines");

      // Existing 1
      assert.equal(meds[0].name, "Haritaki Churna");
      assert.equal(meds[0].medicineId, "AY-MED-0101");
      assert.equal(meds[0].medicineDbId, 1);

      // Existing 2
      assert.equal(meds[1].name, "Talishadya Churna");
      assert.equal(meds[1].medicineId, "AY-MED-0102");
      assert.equal(meds[1].medicineDbId, 2);

      // New 3
      assert.equal(meds[2].name, "Dolo 650");
      assert.ok(meds[2].medicineId.startsWith("AY-MED-"));
      assert.notEqual(meds[2].medicineId, "AY-MED-0101");
      assert.notEqual(meds[2].medicineId, "AY-MED-0102");

      // Store should now have 3 items (1 new created)
      assert.equal(store.length, 3);
    });

    test("handles multiple new medicines and duplicate entries in the same prescription correctly", async () => {
      const { finder, creator, store } = createMockStore();

      const rx = {
        digitalPrescription: true,
        formulationRows: [
          {
            id: "row_1",
            medicines: [{ id: "m1", name: "Haritaki Churna", dosage: "3g" }],
          },
          {
            id: "row_2",
            medicines: [{ id: "m2", name: "Dolo 650", dosage: "650" }], // New 1
          },
          {
            id: "row_3",
            medicines: [{ id: "m3", name: "New Medicine ABC", dosage: "1 tab" }], // New 2
          },
          {
            id: "row_4",
            medicines: [{ id: "m4", name: "dolo 650", dosage: "650" }], // Duplicate of New 1 in different row (lowercase)
          },
        ],
      };

      const { modified, payload } = await resolveMedicinesPayload(rx, finder, creator);

      assert.equal(modified, true);
      const rows = payload.formulationRows;

      // Existing
      assert.equal(rows[0].medicines[0].medicineId, "AY-MED-0101");

      // New 1
      const doloId = rows[1].medicines[0].medicineId;
      assert.ok(doloId.startsWith("AY-MED-"));

      // New 2
      const abcId = rows[2].medicines[0].medicineId;
      assert.ok(abcId.startsWith("AY-MED-"));
      assert.notEqual(doloId, abcId, "Different new medicines must receive distinct IDs");

      // Duplicate of New 1
      const doloDupId = rows[3].medicines[0].medicineId;
      assert.equal(doloDupId, doloId, "Duplicate entry of new medicine in same prescription must reuse the same ID");

      // Exactly 2 new medicines added to store (Dolo 650 and New Medicine ABC)
      assert.equal(store.length, 4, "Store must have 2 existing + 2 new = 4 total medicines");
    });
  });

  // ── 4. JSON Notes String Passthrough Tests ───────────────────
  describe("resolvePrescriptionMedicines String Passthrough", () => {
    test("returns null/undefined/empty string as-is", async () => {
      assert.equal(await resolvePrescriptionMedicines(null), "");
      assert.equal(await resolvePrescriptionMedicines(undefined), "");
      assert.equal(await resolvePrescriptionMedicines(""), "");
    });

    test("returns non-JSON doctor notes string as-is without modification", async () => {
      const plainText = "Patient complains of headache and mild fever. Advised bed rest.";
      const res = await resolvePrescriptionMedicines(plainText);
      assert.equal(res, plainText);
    });

    test("returns invalid JSON notes string as-is without crashing", async () => {
      const invalidJson = "{ patient: bad json format without quotes";
      const res = await resolvePrescriptionMedicines(invalidJson);
      assert.equal(res, invalidJson);
    });

    test("returns JSON without formulationRows as-is", async () => {
      const nonRxJson = JSON.stringify({ message: "Hello world" });
      const res = await resolvePrescriptionMedicines(nonRxJson);
      assert.equal(res, nonRxJson);
    });
  });
});
