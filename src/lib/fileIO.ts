// Import / export of car configs as .fcar files (just JSON with a versioned
// schema). Pure browser APIs — no deps.

import type { CarConfig } from "@/config/car";
import { parseCarConfig } from "@/config/schema";

export function downloadCar(car: CarConfig): void {
  const json = JSON.stringify(car, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const safeName = car.name.replace(/[^a-z0-9-_]+/gi, "_") || "car";
  a.download = `${safeName}.fcar`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function readCarFile(file: File): Promise<CarConfig> {
  const text = await file.text();
  const raw = JSON.parse(text);
  return parseCarConfig(raw);
}
