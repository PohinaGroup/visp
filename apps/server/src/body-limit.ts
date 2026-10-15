/**
 * Reads a request body into memory, giving up as soon as it would exceed
 * `maxBytes`. Caddy caps bodies at the edge too; this keeps a direct or
 * misrouted request from buffering an unbounded body in the API process.
 * Returns null when the body is too large.
 */
export async function readBodyWithLimit(
	request: Request,
	maxBytes: number,
): Promise<Uint8Array | null> {
	const declared = request.headers.get("content-length");
	if (declared !== null && Number(declared) > maxBytes) return null;
	if (!request.body) return new Uint8Array();

	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		total += value.byteLength;
		if (total > maxBytes) {
			await reader.cancel().catch(() => {});
			return null;
		}
		chunks.push(value);
	}
	const body = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		body.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return body;
}
