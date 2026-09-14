import { stdin, stdout } from "node:process";
import { createInterface } from "node:readline/promises";
import { AgentAuthClient } from "@auth/agent";

const provider = process.env.VISP_URL?.replace(/\/$/, "");
const enrollmentToken = process.env.VISP_ENROLLMENT_TOKEN;

if (!provider || !enrollmentToken) {
	throw new Error(
		"Set VISP_URL and VISP_ENROLLMENT_TOKEN before running this script.",
	);
}

const client = new AgentAuthClient({
	onApprovalRequired: ({ verification_uri_complete: approvalUrl }) => {
		if (!approvalUrl) throw new Error("VISP did not provide an approval URL.");
		console.log(`Open this URL to approve the agent: ${approvalUrl}`);
	},
});

try {
	await client.enrollHost({
		provider,
		enrollmentToken,
		name: "VISP smoke-test host",
	});
	await client.listCapabilities({ provider });
	const agent = await client.connectAgent({
		provider,
		capabilities: ["streams:read"],
		name: "VISP smoke-test agent",
	});

	console.log(
		JSON.stringify(
			await client.executeCapability({
				agentId: agent.agentId,
				capability: "streams:read",
			}),
			null,
			2,
		),
	);

	const prompt = createInterface({ input: stdin, output: stdout });
	await prompt.question(
		"Revoke streams:read in VISP Settings → Agent access, then press Enter. ",
	);
	prompt.close();

	try {
		await client.executeCapability({
			agentId: agent.agentId,
			capability: "streams:read",
		});
		throw new Error("Revocation did not block streams:read.");
	} catch (error) {
		if (
			error instanceof Error &&
			error.message === "Revocation did not block streams:read."
		) {
			throw error;
		}
		console.log("Revocation blocked streams:read.");
	}
} finally {
	client.destroy();
}
