import "./test-env";
import { expect, test } from "bun:test";
import { forwarderSessionLockKeys } from "./forwarder-sessions";

test("path lock keys are distinct, ascending, and never the global gate", () => {
	expect(forwarderSessionLockKeys([42, 7, 42, 9])).toEqual([7, 9, 42]);
	// Bigint path ids fold into int4; one that lands on 0 moves off the gate.
	expect(forwarderSessionLockKeys([2_147_483_647, 2_147_483_648])).toEqual([1]);
	expect(forwarderSessionLockKeys([3_000_000_000])).toEqual([852_516_353]);
});

test("path lock keys refuse anything that is not a path id", () => {
	// Keys are inlined into the statement, so only plain integers get through.
	expect(() => forwarderSessionLockKeys([1.5])).toThrow();
	expect(() => forwarderSessionLockKeys([Number.NaN])).toThrow();
	expect(() => forwarderSessionLockKeys([-1])).toThrow();
});
