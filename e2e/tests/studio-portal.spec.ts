import { expect, test } from "@playwright/test";

// All API writes stay in this test. No account or running compositor is needed.
test("Studio edits the draft visually, keeps failed saves, and supports small screens", async ({
	page,
}) => {
	test.setTimeout(120_000);
	await page.setViewportSize({ width: 1440, height: 1000 });
	let graph = {
		activeSceneId: "scene-a",
		scenes: [
			{
				id: "scene-a",
				name: "Main",
				order: 0,
				transition: "cut",
				layers: [
					{
						id: "text-a",
						type: "text",
						name: "Title",
						text: "Live from Helsinki",
						visible: true,
						x: 100,
						y: 100,
						width: 640,
						height: 120,
						zIndex: 0,
					},
				],
			},
		],
	};
	let version = 1;
	let rejectSave = true;
	let receivedVersion: number | undefined;
	let saveCount = 0;
	await page.route("**/api/auth/**", (route) =>
		route.fulfill({
			json: {
				user: {
					id: "studio-test",
					name: "Test creator",
					email: "creator@example.test",
				},
				session: { id: "test", expiresAt: "2099-01-01T00:00:00Z" },
			},
		}),
	);
	await page.route("**/trpc/**", async (route) => {
		const url = new URL(route.request().url());
		const procedures = (url.pathname.split("/trpc/")[1] ?? "").split(",");
		const body = route.request().postDataJSON();
		const result = procedures.map((procedure, index) => {
			if (procedure === "studio.save") {
				saveCount++;
				receivedVersion = body[String(index)].expectedVersion;
				if (rejectSave)
					return {
						error: {
							message: "Studio changed elsewhere",
							code: -32603,
							data: { code: "CONFLICT", httpStatus: 409 },
						},
					};
				graph = body[String(index)].graph;
				version++;
				return { result: { data: graph } };
			}
			const settings = {
				available: true,
				version,
				mode: "cloud_studio",
				compositorHealthy: true,
				passthrough: false,
			};
			const data: Record<string, unknown> = {
				"studio.get": { graph, settings, preview: {} },
				"studio.mode.get": settings,
				"paths.list": [
					{
						publishing: true,
						stale: false,
						publishLastConnectedAt: "2026-09-06T12:00:00Z",
					},
				],
				"direct.list": { destinations: [{ state: "live" }], customOutputs: [] },
				"secrets.status": { onboardedAt: "2026-09-05" },
			};
			return { result: { data: data[procedure] ?? null } };
		});
		await route.fulfill({ json: result });
	});
	await page.goto("/studio");
	const canvas = page.getByRole("region", { name: "Composition preview" });
	await expect(canvas).toBeVisible();
	await expect(
		page.getByText("Overlays are being applied", { exact: true }),
	).toBeVisible();
	await page
		.getByRole("button", { name: "Necessary only", exact: true })
		.click();
	await expect(page.locator('video[aria-label="Program"]')).toHaveCount(0);
	const layer = page.locator('[data-layer-id="text-a"]');
	const move = page.getByRole("button", {
		name: "Edit source Title",
		exact: true,
	});
	await move.click();
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toHaveValue("100");
	await move.press("ArrowRight");
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toHaveValue("101");
	await move.press("Shift+ArrowRight");
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toHaveValue("111");
	const box = await layer.boundingBox();
	if (!box) throw new Error("Layer is not visible");
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(
		box.x + box.width / 2 + 80,
		box.y + box.height / 2 + 20,
		{ steps: 8 },
	);
	await page.mouse.up();
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).not.toHaveValue("111");
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toHaveValue("111");
	const handle = page.getByRole("button", {
		name: "Resize source se",
		exact: true,
	});
	const handleBox = await handle.boundingBox();
	if (!handleBox) throw new Error("Resize handle is not visible");
	await page.mouse.move(
		handleBox.x + handleBox.width / 2,
		handleBox.y + handleBox.height / 2,
	);
	await page.mouse.down();
	await page.mouse.move(handleBox.x + 80, handleBox.y + 30, { steps: 5 });
	await page.mouse.up();
	await expect(
		page.getByRole("spinbutton", { name: "Width", exact: true }),
	).not.toHaveValue("640");
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(
		page.getByRole("spinbutton", { name: "Width", exact: true }),
	).toHaveValue("640");
	await page.getByRole("button", { name: "Lock Title", exact: true }).click();
	await expect(handle).toHaveCount(0);
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toBeDisabled();
	await page.getByRole("button", { name: "Unlock Title", exact: true }).click();
	await page
		.getByRole("button", { name: "Duplicate layer", exact: true })
		.click();
	await expect(page.locator("[data-layer-id]")).toHaveCount(2);
	await page.getByRole("button", { name: "Undo", exact: true }).click();
	await expect(page.locator("[data-layer-id]")).toHaveCount(1);
	await page
		.getByRole("button", { name: "Save and apply", exact: true })
		.click();
	await expect(
		page.getByText("Another tab saved this Studio.", { exact: false }),
	).toBeVisible();
	await expect(
		page.getByText("Unsaved changes", { exact: true }),
	).toBeVisible();
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toHaveValue("111");
	expect(saveCount).toBe(1);
	expect(receivedVersion).toBe(1);
	rejectSave = false;
	await page
		.getByRole("button", { name: "Save and apply", exact: true })
		.click();
	await expect(
		page.getByRole("button", { name: "Save and apply", exact: true }),
	).toBeDisabled();
	expect(graph.scenes[0]?.layers[0]?.x).toBe(111);
	await page
		.getByRole("button", { name: "Clean preview", exact: true })
		.click();
	await expect(move).toHaveCount(0);
	await page
		.getByRole("button", { name: "Clean preview", exact: true })
		.click();
	await page.screenshot({ path: "/tmp/visp-studio-desktop.png" });
	await page.setViewportSize({ width: 390, height: 844 });
	await expect(canvas).toBeVisible();
	await page.getByRole("button", { name: "Layers", exact: true }).click();
	await expect(
		page.getByRole("button", { name: "Add layer", exact: true }),
	).toBeVisible();
	await page.getByRole("button", { name: "Close layers", exact: true }).click();
	await page.getByRole("button", { name: "Inspector", exact: true }).click();
	await expect(
		page.getByRole("spinbutton", { name: "X position" }),
	).toBeVisible();
	await page
		.getByRole("button", { name: "Close inspector", exact: true })
		.click();
	expect(
		await page.evaluate(
			() => document.documentElement.scrollWidth <= window.innerWidth,
		),
	).toBe(true);
	await page.screenshot({ path: "/tmp/visp-studio-mobile.png" });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.getByText("Scene settings", { exact: false }).click();
	await page.getByRole("button", { name: "Add scene", exact: true }).click();
	await expect(canvas).toBeVisible();
	await expect(
		page.getByText("Add a layer to start building your overlay"),
	).toBeVisible();
	expect(graph.activeSceneId).toBe("scene-a");
	await page.getByRole("button", { name: "Add layer", exact: true }).click();
	await page
		.getByRole("button", { name: "VISP alert 0/1", exact: true })
		.click();
	const beforeSample = saveCount;
	await page.getByRole("button", { name: "Test alert", exact: true }).click();
	await expect(page.getByText("Sample alert, preview only")).toBeVisible();
	await page
		.getByRole("button", { name: "Clean preview", exact: true })
		.click();
	await expect(page.getByText("Sample alert, preview only")).toBeVisible();
	expect(saveCount).toBe(beforeSample);
	await expect(page.getByText("Sample alert, preview only")).toHaveCount(0, {
		timeout: 7000,
	});
});
