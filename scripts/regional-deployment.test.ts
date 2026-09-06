import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("release matrix supports legacy and regional targets and rejects malformed configuration", async () => {
	const workflow = Bun.YAML.parse(
		await Bun.file(".github/workflows/release.yml").text(),
	) as {
		jobs: {
			verify: { steps: { id?: string; run?: string }[] };
			deploy_relay: {
				strategy: {
					"fail-fast": boolean;
					"max-parallel": number;
					matrix: { relay: string };
				};
			};
		};
	};
	const script = workflow.jobs.verify.steps.find(
		(step) => step.id === "relay_targets",
	)?.run;
	if (!script) throw new Error("missing relay target configuration");
	expect(workflow.jobs.deploy_relay.strategy).toMatchObject({
		"fail-fast": false,
		"max-parallel": 1,
	});
	const directory = await mkdtemp(join(tmpdir(), "visp-relays-"));
	try {
		for (const [index, targets] of [
			"",
			'[{"host":"fi.tailnet","url":"https://fi.test"},{"host":"us.tailnet","url":"https://us.test"}]',
			"[]",
			'[{"host":"-bad","url":"http://bad"}]',
		].entries()) {
			const output = join(directory, `${index}.txt`);
			const child = spawnSync("bash", ["-c", script], {
				env: {
					...process.env,
					RELAY_TARGETS: targets,
					DEFAULT_HOST: "fi.tailnet",
					DEFAULT_URL: "https://fi.test",
					GITHUB_OUTPUT: output,
				},
				stdio: "ignore",
			});
			if (child.error) throw child.error;
			const code = child.status;
			expect(code === 0).toBe(index < 2);
			if (code === 0) {
				const actual = JSON.parse(
					(await readFile(output, "utf8")).trim().slice("targets=".length),
				);
				expect(actual).toHaveLength(index === 0 ? 1 : 2);
			}
		}
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
});
