import { describe, it, expect } from "vitest";
import { CarSchemaError, parseCarConfig } from "@/config/schema";
import { balancedCar } from "@/config/presets";

describe("car schema", () => {
  it("round-trips a known-good car", () => {
    const car = balancedCar("Test");
    const json = JSON.parse(JSON.stringify(car));
    const back = parseCarConfig(json);
    expect(back.name).toBe("Test");
    expect(back.chassis.mass).toBe(car.chassis.mass);
    expect(back.driver.preset).toBe("safe");
  });

  it("rejects wrong schema version", () => {
    const car = JSON.parse(JSON.stringify(balancedCar()));
    car.schema = 99;
    expect(() => parseCarConfig(car)).toThrow(CarSchemaError);
  });

  it("rejects out-of-range numeric fields", () => {
    const car = JSON.parse(JSON.stringify(balancedCar()));
    car.chassis.mass = 50; // below allowed
    expect(() => parseCarConfig(car)).toThrow(CarSchemaError);
  });

  it("rejects unknown driver preset", () => {
    const car = JSON.parse(JSON.stringify(balancedCar()));
    car.driver.preset = "wreckless";
    expect(() => parseCarConfig(car)).toThrow(CarSchemaError);
  });

  it("rejects garbage input", () => {
    expect(() => parseCarConfig(null as unknown)).toThrow(CarSchemaError);
    expect(() => parseCarConfig("hi" as unknown)).toThrow(CarSchemaError);
    expect(() => parseCarConfig({} as unknown)).toThrow(CarSchemaError);
  });
});
