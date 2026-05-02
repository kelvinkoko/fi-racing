// Car configuration schema. Versioned for forward-compatible imports.

export type TireCompound = "soft" | "medium" | "hard";

export interface EngineConfig {
  /** Peak power in Watts (kW * 1000). */
  peakPower: number;
  /** RPM at peak power. */
  peakPowerRPM: number;
  /** Idle RPM. */
  idleRPM: number;
  /** Hard rev limit. */
  redlineRPM: number;
}

export interface GearboxConfig {
  /** Forward gear ratios (gear 1..N). */
  ratios: number[];
  finalDrive: number;
  /** Drivetrain efficiency, 0..1. */
  efficiency: number;
  /** Upshift / downshift RPM thresholds. */
  upshiftRPM: number;
  downshiftRPM: number;
}

export interface TireConfig {
  compound: TireCompound;
  /** Hot pressure, kPa. */
  pressure: number;
}

export interface AeroConfig {
  /** Drag coefficient * frontal area, m^2. */
  dragArea: number;
  /** Downforce coefficient * area, m^2. Negative lift. */
  downforceArea: number;
  /** Aero balance, 0..1. Fraction of downforce on the front axle. */
  frontBalance: number;
}

export interface BrakesConfig {
  /** Maximum total brake force at wheels, N. */
  maxForce: number;
  /** Brake bias, 0..1. Fraction to front. */
  frontBias: number;
}

export interface ChassisConfig {
  /** Total mass, kg. */
  mass: number;
  /** Yaw moment of inertia about CoG, kg*m^2. */
  inertiaZ: number;
  /** Wheelbase, m. */
  wheelbase: number;
  /** Longitudinal CoG fraction from front axle, 0..1.
   *  0.5 = balanced, lower = nose-heavy. */
  weightDistribution: number;
  /** CoG height, m (for weight transfer). */
  cogHeight: number;
  /** Maximum steering angle at the wheel, radians. */
  maxSteerAngle: number;
}

export type DriverPreset = "aggressive" | "safe" | "overtaker";

export interface DriverWeights {
  /** 0..1, how close to grip limit when cornering (1 = at the limit). */
  corneringMargin: number;
  /** 0..1, how late to brake (1 = latest possible). */
  brakingMargin: number;
  /** 0..1, gain for steering corrections. */
  steeringGain: number;
  /** Std dev of input noise (mistake rate). */
  mistakeRate: number;
}

export interface DriverConfig {
  preset: DriverPreset;
  /** Optional override of preset weights. v1 UI doesn't expose this. */
  weights?: Partial<DriverWeights>;
}

export interface CarConfig {
  schema: 1;
  name: string;
  /** Optional, for UI. Hex color. */
  color?: string;
  chassis: ChassisConfig;
  engine: EngineConfig;
  gearbox: GearboxConfig;
  tires: TireConfig;
  aero: AeroConfig;
  brakes: BrakesConfig;
  driver: DriverConfig;
}
