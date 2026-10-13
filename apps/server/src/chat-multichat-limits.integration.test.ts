import "./test-env";
import {
	BotCommandLimitError,
	listBotCommands,
	MAX_BOT_COMMANDS,
	upsertBotCommand,
} from "@VISP/api/chat/bot";
import { resetConnectionChangeLimitForTests } from "@VISP/api/chat/connection-limit";
import { multiChatRouter } from "@VISP/api/routers/multichat";
import { db } from "@VISP/db";
import { appUser, chatBotCommand, user } from "@VISP/db/schema/index";
import {
	afterAll,
	beforeAll,
	test as bunTest,
	describe,
	expect,
} from "bun:test";
import { eq, like } from "drizzle-orm";

const integration = process.env.TEST_DATABASE_URL ? describe : describe.skip;
const test = bunTest.serial;

const PREFIX = "chat-limits-test-";

async function addUser(id: string) {
	await db.insert(user).values({ id, name: id, email: `${id}@limits.test` });
	await db.insert(appUser).values({ id, handle: id });
}

function command(name: string) {
	return {
		name,
		response: `reply ${name}`,
		modOnly: false,
		cooldownSeconds: 0,
	};
}

integration("chat and multichat limits", () => {
	beforeAll(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
	});

	afterAll(async () => {
		await db.delete(user).where(like(user.id, `${PREFIX}%`));
	});

	test("caps custom commands per user, also under concurrent creates", async () => {
		const id = `${PREFIX}commands`;
		await addUser(id);
		await db.insert(chatBotCommand).values(
			Array.from({ length: MAX_BOT_COMMANDS - 1 }, (_, index) => ({
				userId: id,
				...command(`cmd${index}`),
			})),
		);
		const results = await Promise.allSettled([
			upsertBotCommand(id, command("race-a")),
			upsertBotCommand(id, command("race-b")),
		]);
		expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
		const rejected = results.find((r) => r.status === "rejected");
		expect((rejected as PromiseRejectedResult).reason).toBeInstanceOf(
			BotCommandLimitError,
		);
		await expect(upsertBotCommand(id, command("one-more"))).rejects.toThrow(
			BotCommandLimitError,
		);
		// Editing an existing command at the cap still works, and `enabled` sticks.
		const updated = await upsertBotCommand(id, {
			...command("cmd0"),
			enabled: false,
		});
		expect(updated?.enabled).toBe(false);
		const rows = await db
			.select({ id: chatBotCommand.id })
			.from(chatBotCommand)
			.where(eq(chatBotCommand.userId, id));
		expect(rows).toHaveLength(MAX_BOT_COMMANDS);
		expect(await listBotCommands(id)).toHaveLength(MAX_BOT_COMMANDS);
	});

	test("rate-limits multichat saves per user", async () => {
		resetConnectionChangeLimitForTests();
		const id = `${PREFIX}multichat`;
		await addUser(id);
		const caller = multiChatRouter.createCaller({
			auth: null,
			headers: new Headers(),
			session: {
				user: { id, role: "user", banned: false, banExpires: null },
				session: { id: `session-${id}`, userId: id },
			} as never,
		});
		const save = () =>
			caller.save([
				{ provider: "tiktok", enabled: false, channelLogin: "visp" },
			]);
		for (let index = 0; index < 10; index += 1) await save();
		await expect(save()).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
		resetConnectionChangeLimitForTests();
		await expect(save()).resolves.toBeDefined();
	});
});
