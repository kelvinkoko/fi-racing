// Schema validation and migration for imported .fcar files. Today only schema
// 1 exists; this layer is here so v2+ can migrate forward without breaking
// shared exports.

import type {
  AeroConfig,
  BrakesConfig,
  CarConfig,
  ChassisConfig,
  DriverConfig,
  DriverPreset,
  EngineConfig,
  GearboxConfig,
  TireCompound,
  TireConfig,
} from "./car";

export class CarSchemaError extends Error {}

const PRESETS: DriverPreset[] = ["safe", "aggressive", "overtaker"];
const COMPOUNDS: TireCompound[] = ["soft", "medium", "hard"];

export function parseCarConfig(raw: unknown): CarConfig {
  if (!isObject(raw)) throw new CarSchemaError("Not an object");
  const schema = (raw as { schema?: unknown }).schema;
  if (schema !== 1) throw new CarSchemaError(`Unsupported schema: ${String(schema)}`);

  const name = stringField(raw, "name");
  const color = optionalString(raw, "color");
  const chassis = parseChassis(raw["chassis"]);
  const engine = parseEngine(raw["engine"]);
  const gearbox = parseGearbox(raw["gearbox"]);
  const tires = parseTires(raw["tires"]);
  const aero = parseAero(raw["aero"]);
  const brakes = parseBrakes(raw["brakes"]);
  const driver = parseDriver(raw["driver"]);

  const car: CarConfig = {
    schema: 1,
    name,
    chassis,
    engine,
    gearbox,
    tires,
    aero,
    brakes,
    driver,
  };
  if (color) car.color = color;
  return car;
}

function parseChassis(v: unknown): ChassisConfig {
  if (!isObject(v)) throw new CarSchemaError("chassis missing");
  return {
    mass: numberField(v, "mass", 200, 3000),
    inertiaZ: numberField(v, "inertiaZ", 100, 10000),
    wheelbase: numberField(v, "wheelbase", 1.5, 5),
    weightDistribution: numberField(v, "weightDistribution", 0.2, 0.8),
    cogHeight: numberField(v, "cogHeight", 0.1, 1.5),
    maxSteerAngle: numberField(v, "maxSteerAngle", 0.1, 1.2),
  };
}
function parseEngine(v: unknown): EngineConfig {
  if (!isObject(v)) throw new CarSchemaError("engine missing");
  return {
    peakPower: numberField(v, "peakPower", 50_000, 1_500_000),
    peakPowerRPM: numberField(v, "peakPowerRPM", 3_000, 18_000),
    idleRPM: numberField(v, "idleRPM", 500, 6_000),
    redlineRPM: numberField(v, "redlineRPM", 4_000, 20_000),
  };
}
function parseGearbox(v: unknown): GearboxConfig {
  if (!isObject(v)) throw new CarSchemaError("gearbox missing");
  const ratios = v["ratios"];
  if (!Array.isArray(ratios) || ratios.length < 1 || ratios.length > 10) {
    throw new CarSchemaError("gearbox.ratios must be array of 1..10");
  }
  for (const r of ratios) {
    if (typeof r !== "number" || r <= 0) throw new CarSchemaError("gearbox.ratios entries");
  }
  return {
    ratios: ratios.slice() as number[],
    finalDrive: numberField(v, "finalDrive", 1, 8),
    efficiency: numberField(v, "efficiency", 0.6, 1),
    upshiftRPM: numberField(v, "upshiftRPM", 3_000, 19_500),
    downshiftRPM: numberField(v, "downshiftRPM", 1_500, 12_000),
  };
}
function parseTires(v: unknown): TireConfig {
  if (!isObject(v)) throw new CarSchemaError("tires missing");
  const compound = v["compound"];
  if (!COMPOUNDS.includes(compound as TireCompound)) {
    throw new CarSchemaError("tires.compound");
  }
  return {
    compound: compound as TireCompound,
    pressure: numberField(v, "pressure", 100, 250),
  };
}
function parseAero(v: unknown): AeroConfig {
  if (!isObject(v)) throw new CarSchemaError("aero missing");
  return {
    dragArea: numberField(v, "dragArea", 0.3, 3.0),
    downforceArea: numberField(v, "downforceArea", 0, 8),
    frontBalance: numberField(v, "frontBalance", 0.2, 0.7),
  };
}
function parseBrakes(v: unknown): BrakesConfig {
  if (!isObject(v)) throw new CarSchemaError("brakes missing");
  return {
    maxForce: numberField(v, "maxForce", 5_000, 80_000),
    frontBias: numberField(v, "frontBias", 0.3, 0.85),
  };
}
function parseDriver(v: unknown): DriverConfig {
  if (!isObject(v)) throw new CarSchemaError("driver missing");
  const preset = v["preset"];
  if (!PRESETS.includes(preset as DriverPreset)) throw new CarSchemaError("driver.preset");
  return { preset: preset as DriverPreset };
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function stringField(v: Record<string, unknown>, k: string): string {
  const x = v[k];
  if (typeof x !== "string" || !x) throw new CarSchemaError(`${k} required`);
  return x;
}
function optionalString(v: Record<string, unknown>, k: string): string | undefined {
  const x = v[k];
  return typeof x === "string" ? x : undefined;
}
function numberField(v: Record<string, unknown>, k: string, lo: number, hi: number): number {
  const x = v[k];
  if (typeof x !== "number" || !Number.isFinite(x)) {
    throw new CarSchemaError(`${k} must be number`);
  }
  if (x < lo || x > hi) throw new CarSchemaError(`${k} out of range [${lo}, ${hi}]`);
  return x;
}
