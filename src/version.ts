import pkg from "../package.json";

/**
 * Single Source of Truth untuk versi aplikasi Kassio POS di seluruh tampilan UI.
 * Diambil langsung dari `package.json` yang dijaga sinkron (SemVer Lockstep)
 * dengan `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, dan `CHANGELOG.md`.
 */
export const APP_VERSION: string = pkg.version;
export const APP_VERSION_LABEL = `v${APP_VERSION}`;
