// localStorage-backed garage. Cars are keyed by a stable id so the user can
// rename without losing references in the grid. Factory presets are seeded on
// first run so visitors have something to race immediately.

import type { CarConfig } from "@/config/car";
import { balancedCar, gripCar, powerCar } from "@/config/presets";

const KEY = "fi-racing/garage/v1";

export interface GarageEntry {
  id: string;
  /** True for cars seeded by the app (the user can still edit them). */
  factory?: boolean;
  car: CarConfig;
}

interface GarageFile {
  version: 1;
  entries: GarageEntry[];
}

export function loadGarage(): GarageEntry[] {
  if (typeof localStorage === "undefined") return seedFactory();
  const raw = localStorage.getItem(KEY);
  if (!raw) {
    const seeded = seedFactory();
    saveGarage(seeded);
    return seeded;
  }
  try {
    const parsed = JSON.parse(raw) as GarageFile;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) throw new Error("bad");
    return parsed.entries;
  } catch {
    const seeded = seedFactory();
    saveGarage(seeded);
    return seeded;
  }
}

export function saveGarage(entries: GarageEntry[]): void {
  if (typeof localStorage === "undefined") return;
  const payload: GarageFile = { version: 1, entries };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function seedFactory(): GarageEntry[] {
  return [
    { id: newId(), factory: true, car: balancedCar("Balanced") },
    { id: newId(), factory: true, car: powerCar("Power") },
    { id: newId(), factory: true, car: gripCar("Grip") },
  ];
}
