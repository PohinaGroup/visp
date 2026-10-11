import { describe, expect, test } from "bun:test";
import { join } from "node:path";
import {
	isObsPairingToken,
	OBS_PAIRING_TOKEN_PREFIX,
	presentsObsPairingToken,
} from "./obs-pairing";

const pairing = `${OBS_PAIRING_TOKEN_PREFIX}abcDEF123`;

describe("OBS pairing tokens", () => {
	test("recognises the marker in raw, signed and encoded forms", () => {
		expect(isObsPairingToken(pairing)).toBe(true);
		expect(isObsPairingToken(`${pairing}.signature=`)).toBe(true);
		expect(isObsPairingToken(encodeURIComponent(`${pairing}.sig/+=`))).toBe(
			true,
		);
		expect(isObsPairingToken("%6Fbspair_abc")).toBe(true);
		expect(isObsPairingToken("browserSessionToken")).toBe(false);
		expect(isObsPairingToken(undefined)).toBe(false);
	});

	test("finds the token in a bearer header or any cookie", () => {
		expect(
			presentsObsPairingToken(
				new Headers({ authorization: `bearer  ${pairing}` }),
			),
		).toBe(true);
		expect(
			presentsObsPairingToken(
				new Headers({
					cookie: `theme=dark; __Secure-better-auth.session_token="${encodeURIComponent(`${pairing}.sig`)}"`,
				}),
			),
		).toBe(true);
		expect(
			presentsObsPairingToken(
				undefined,
				new Headers({ authorization: "Bearer browserSessionToken" }),
				new Headers({ cookie: `better-auth.session_token=${pairing}.sig` }),
			),
		).toBe(true);
		expect(
			presentsObsPairingToken(
				new Headers({
					authorization: "Bearer browserSessionToken",
					cookie: "better-auth.session_token=browserSessionToken.sig",
				}),
			),
		).toBe(false);
		expect(
			presentsObsPairingToken(
				new Headers({ authorization: `Basic ${pairing}` }),
			),
		).toBe(false);
	});

	// auth.api.getSession returns OBS pairing sessions so /api/obs/connect can
	// read them; every other route must go through getUserSession.
	test("only the OBS connect route reads sessions without getUserSession", async () => {
		const root = join(import.meta.dir, "../../..");
		const direct: string[] = [];
		for (const directory of ["apps/server/src", "packages/api/src"]) {
			for await (const file of new Bun.Glob("**/*.ts").scan(
				join(root, directory),
			)) {
				if (file.endsWith(".test.ts")) continue;
				const source = await Bun.file(join(root, directory, file)).text();
				if (/\bapi\s*\.\s*getSession\b/.test(source)) {
					direct.push(`${directory}/${file}`);
				}
			}
		}
		expect(direct).toEqual(["apps/server/src/machine.ts"]);
	});
});
