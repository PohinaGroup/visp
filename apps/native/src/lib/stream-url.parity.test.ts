import { expect, test } from "bun:test";

// The web bundle silently resolves stream-url.web.ts, so an export that exists
// only on the native side becomes `undefined` at runtime instead of a build
// error. Compared from source because importing the native module pulls in
// react-native, which bun cannot parse.
function exportedNames(source: string): string[] {
	const names = [
		...source.matchAll(
			/export\s+(?:async\s+)?(?:function|const|type)\s+(\w+)/g,
		),
		...[...source.matchAll(/export\s*\{([^}]*)\}/g)].flatMap((block) =>
			block[1].split(",").flatMap((entry) => {
				const name = entry
					.trim()
					.split(/\s+as\s+/)
					.pop()
					?.trim();
				return name ? [{ 1: name }] : [];
			}),
		),
	].map((match) => match[1]);
	return [...new Set(names)].sort();
}

test("web stream-url exports everything the native module does", async () => {
	const [native, web] = await Promise.all([
		Bun.file(`${import.meta.dir}/stream-url.ts`).text(),
		Bun.file(`${import.meta.dir}/stream-url.web.ts`).text(),
	]);
	expect(exportedNames(web)).toEqual(exportedNames(native));
});
