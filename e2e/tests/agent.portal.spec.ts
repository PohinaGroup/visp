import { expect, test } from "@playwright/test";

test("agent approval preserves login return, selection, and handles failed decisions", async ({ page }) => {
	let signedIn = false;
	let failDecision = true;
	const decisions: unknown[] = [];
	const errors: string[] = [];
	page.on("pageerror", (error) => errors.push(error.message));
	const session = { session: { id: "test-session", userId: "test-owner", expiresAt: "2099-01-01T00:00:00.000Z", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, user: { id: "test-owner", name: "Test owner", email: "agent@example.test", emailVerified: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() } };
	const agent = { agent_id: "test-agent", host_id: "test-host", host_name: "My laptop", name: "Status reader", status: "pending", mode: "delegated", agent_capability_grants: [{ capability: "streams:read", status: "pending" }] };
	await page.route("**/api/auth/**", async (route) => {
		const path = new URL(route.request().url()).pathname;
		let json: unknown = null;
		let status = 200;
		if (path.endsWith("/get-session")) json = signedIn ? session : null;
		else if (path.endsWith("/sign-in/email")) { signedIn = true; json = { user: session.user, token: "test-session", redirect: false }; }
		else if (path.endsWith("/agent/get")) json = agent;
		else if (path.endsWith("/agent/list")) json = { agents: [agent] };
		else if (path.endsWith("/capability/list")) json = { capabilities: [{ name: "streams:read", description: "Read stream status", approval_strength: "session" }] };
		else if (path.endsWith("/agent/approve-capability")) {
			decisions.push(route.request().postDataJSON());
			status = failDecision ? 403 : 200;
			json = failDecision ? { code: "APPROVAL_EXPIRED", message: "Approval expired" } : { success: true };
		}
		await route.fulfill({ status, json });
	});
	const approval = "/auth/agent-approval?agent_id=test-agent&code=TEST-CODE";
	await page.goto(approval);
	await expect(page).toHaveURL(/\/login\?/);
	expect(new URL(page.url()).searchParams.get("redirect")).toBe(approval);
	await page.getByLabel("Email", { exact: true }).fill("agent@example.test");
	await page.getByLabel("Password", { exact: true }).fill("test-password-for-agent");
	await page.getByRole("button", { name: "Sign in", exact: true }).click();
	await expect(page).toHaveURL(new RegExp("/auth/agent-approval\\?"));
	await expect(page.getByText("Status reader", { exact: true })).toBeVisible();
	await expect(page.getByText("My laptop", { exact: true })).toBeVisible();
	const capability = page.getByRole("checkbox");
	await capability.uncheck();
	await expect(page.getByRole("button", { name: "Allow selected" })).toBeDisabled();
	await capability.check();
	await page.getByRole("button", { name: "Allow selected" }).click();
	await expect(page.getByRole("alert")).toContainText("could not update");
	failDecision = false;
	await page.getByRole("button", { name: "Allow selected" }).click();
	await expect(page.getByRole("heading", { name: "Access approved" })).toBeVisible();
	expect(decisions.at(-1)).toMatchObject({ agent_id: "test-agent", user_code: "TEST-CODE", action: "approve", capabilities: ["streams:read"] });
	expect(errors).toEqual([]);
	await page.screenshot({ path: "/tmp/visp-agent-approval.png" });
});
