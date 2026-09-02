import { describe, expect, it } from "bun:test";
import { sendAuthEmail } from "./email";

describe("sendAuthEmail", () => {
	it("sends auth mail from the VISP address", async () => {
		let request: Request | undefined;
		await sendAuthEmail(
			"re_test",
			{ subject: "Verify", text: "Open link", to: "user@example.com" },
			async (input, init) => {
				request = new Request(input, init);
				return new Response(null, { status: 200 });
			},
		);

		expect(request?.headers.get("authorization")).toBe("Bearer re_test");
		expect(await request?.json()).toEqual({
			from: "visp@info.pohina.group",
			to: "user@example.com",
			subject: "Verify",
			text: "Open link",
		});

		await expect(
			sendAuthEmail(
				"re_test",
				{ subject: "Verify", text: "Open link", to: "user@example.com" },
				async () => new Response(null, { status: 422 }),
			),
		).rejects.toThrow("status 422");
	});
});
