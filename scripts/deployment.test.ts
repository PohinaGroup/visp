import { expect, test } from "bun:test";

test("staging relay deployment declares SSH variables in its own step", async () => {
	const workflow = Bun.YAML.parse(
		await Bun.file(".github/workflows/staging.yml").text(),
	) as {
		jobs: {
			deploy: {
				steps: Array<{
					name?: string;
					if?: string;
					env?: Record<string, string>;
				}>;
			};
		};
	};
	const step = workflow.jobs.deploy.steps.find(
		(step) => step.name === "Deploy changed relay components",
	)!;
	expect(step.if).toBe("needs.check.outputs.relay_components != ''");
	expect(step.env?.DEPLOY_USER).toBe("${{ vars.DEPLOY_USER }}");
	expect(step.env?.DEPLOY_HOST).toBe("${{ vars.DEPLOY_HOST }}");
});
