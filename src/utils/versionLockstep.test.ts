import { describe, expect, it } from "vitest";
import pkg from "../../package.json";
import tauriConf from "../../src-tauri/tauri.conf.json";
import cargoTomlRaw from "../../src-tauri/Cargo.toml?raw";
import changelogRaw from "../../CHANGELOG.md?raw";
import { APP_VERSION, APP_VERSION_LABEL } from "../version";

const tsxFiles = import.meta.glob<string>("../**/*.tsx", {
  query: "?raw",
  import: "default",
  eager: true,
});

describe("Disiplin Manajemen Versi & Rilis (SemVer Lockstep)", () => {
  it("memastikan format SemVer (MAJOR.MINOR.PATCH) valid pada package.json dan src/version.ts", () => {
    expect(APP_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION_LABEL).toBe(`v${pkg.version}`);
  });

  it("menjaga sinkronisasi 100% identik antara package.json, src-tauri/Cargo.toml, dan src-tauri/tauri.conf.json", () => {
    const cargoVersionMatch = cargoTomlRaw.match(
      /^\[package\][\s\S]*?^version\s*=\s*"([^"]+)"/m,
    );
    const cargoVersion = cargoVersionMatch?.[1];

    expect(cargoVersion).toBe(pkg.version);
    expect(tauriConf.version).toBe(pkg.version);
  });

  it("memastikan CHANGELOG.md memiliki catatan rilis untuk versi aplikasi saat ini", () => {
    const expectedHeading = `## [${pkg.version}]`;
    expect(changelogRaw).toContain(expectedHeading);
  });

  it("mencegah penulisan versi hardcoded (Mudita Mart / Kassio vX.Y.Z) di dalam komponen React (.tsx)", () => {
    const entries = Object.entries(tsxFiles);
    expect(entries.length).toBeGreaterThan(0);

    for (const [filePath, source] of entries) {
      expect(
        source,
        `Ditemukan string versi hardcoded di ${filePath}. Gunakan APP_VERSION_LABEL dari src/version.ts.`,
      ).not.toMatch(/(?:POS-Kasir|Kassio|Mudita(?:\s+Mart)?)(?:\s+Desktop)?\s+v\d+\.\d+\.\d+/i);
    }
  });
});
