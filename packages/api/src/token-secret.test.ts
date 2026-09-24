import { expect, test } from "bun:test";
import { createToken, parseToken, tokenMatches } from "./token-secret";

test("issued credentials parse and authenticate without accepting changes", () => {
	const token = createToken();
	const parsed = parseToken(token.value);
	expect(parsed?.id).toBe(token.id);
	expect(tokenMatches(parsed?.secret ?? "", token.hash)).toBe(true);
	expect(tokenMatches("0".repeat(64), token.hash)).toBe(false);
	expect(parseToken(`Bearer ${token.value}`)).toBeNull();
	expect(parseToken(`${token.value}.extra`)).toBeNull();
});
