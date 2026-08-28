type PipelineProcess = ReturnType<typeof Bun.spawn>;

async function stopProcess(process: PipelineProcess | undefined) {
	if (!process) return;
	process.kill();
	await process.exited;
}

export class CompositorPipeline {
	private publisher: PipelineProcess | undefined;
	private renderer: PipelineProcess | undefined;
	private relay: PipelineProcess | undefined;
	private transition: PipelineProcess | undefined;

	get publisherPid() {
		return this.publisher?.pid;
	}

	get publisherRunning() {
		return this.publisher?.exitCode === null;
	}

	get publisherExitCode() {
		return this.publisher?.exitCode;
	}

	get rendererExitCode() {
		return this.renderer?.exitCode;
	}

	get outputExitCode() {
		return this.relay?.exitCode;
	}

	async startPublisher(args: string[]) {
		if (this.publisherRunning) return;
		if (this.publisher) await this.publisher.exited;
		this.publisher = Bun.spawn(args, { stdout: "ignore", stderr: "inherit" });
	}

	async applyRenderer(input: {
		rendererArgs: string[];
		relayArgs: string[];
		transitionArgs?: string[];
		transitionMs?: number;
	}) {
		const previousRenderer = this.renderer;
		const nextRenderer = Bun.spawn(input.rendererArgs, {
			stdout: "ignore",
			stderr: "inherit",
		});
		await Bun.sleep(50);
		if (nextRenderer.exitCode !== null) {
			await nextRenderer.exited;
			throw new Error("Studio renderer exited during startup");
		}

		if (input.transitionArgs && previousRenderer) {
			await stopProcess(this.relay);
			this.relay = undefined;
			this.transition = Bun.spawn(input.transitionArgs, {
				stdout: "ignore",
				stderr: "inherit",
			});
			await Bun.sleep(input.transitionMs ?? 500);
			await stopProcess(this.transition);
			this.transition = undefined;
		}

		await stopProcess(this.relay);
		this.relay = Bun.spawn(input.relayArgs, {
			stdout: "ignore",
			stderr: "inherit",
		});
		await stopProcess(previousRenderer);
		this.renderer = nextRenderer;
	}

	async stop() {
		await Promise.all([
			stopProcess(this.transition),
			stopProcess(this.relay),
			stopProcess(this.renderer),
			stopProcess(this.publisher),
		]);
		this.transition = undefined;
		this.relay = undefined;
		this.renderer = undefined;
		this.publisher = undefined;
	}
}
