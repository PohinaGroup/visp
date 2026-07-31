import type { BondingMode } from "../../modules/visp-srt";
import { booleanPreference } from "./preference";
import { storage } from "./storage";

const BONDING_MODE_KEY = "visp.network.bonding-mode";
const bondingWarning = booleanPreference("visp.network.bonding-warning-seen");

export function parseBondingMode(value: string | null): BondingMode {
	return value === "broadcast" || value === "backup" ? value : "off";
}

export async function loadBondingMode(): Promise<BondingMode> {
	return parseBondingMode(await storage.getItem(BONDING_MODE_KEY));
}

export async function saveBondingMode(mode: BondingMode): Promise<void> {
	await storage.setItem(BONDING_MODE_KEY, mode);
}

export function hasSeenBondingWarning(): Promise<boolean> {
	return bondingWarning.load();
}

export function markBondingWarningSeen(): Promise<void> {
	return bondingWarning.save(true);
}
