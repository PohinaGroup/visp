import { describe, expect, test } from "bun:test";

import "../test-env";

const { fetchYoutubeChatPage, findActiveYoutubeChat, youtubePageMessages } =
	await import("./youtube");

const token = async () => ({ accessToken: "youtube-token" });

describe("YouTube chat", () => {
	test("discovers the authenticated user's active live chat", async () => {
		let request: { headers: Headers; url: string } | undefined;
		const chatId = await findActiveYoutubeChat("user", {
			fetch: (async (input, init) => {
				request = { headers: new Headers(init?.headers), url: String(input) };
				return Response.json({
					items: [{ id: "broadcast", snippet: { liveChatId: "chat-1" } }],
				});
			}) as typeof fetch,
			getAccessToken: token,
		});

		expect(chatId).toBe("chat-1");
		expect(request?.url).toContain("broadcastStatus=active");
		expect(request?.url).toContain("mine=true");
		expect(request?.headers.get("Authorization")).toBe("Bearer youtube-token");
	});

	test("uses YouTube's cursor and polling interval without replaying history", async () => {
		let requestedUrl = "";
		const page = await fetchYoutubeChatPage("user", "chat-1", "cursor-1", {
			fetch: (async (input) => {
				requestedUrl = String(input);
				return Response.json({
					nextPageToken: "cursor-2",
					pollingIntervalMillis: 4321,
					items: [
						{
							id: "message-1",
							snippet: {
								type: "textMessageEvent",
								hasDisplayContent: true,
								displayMessage: "Hello",
							},
							authorDetails: {
								channelId: "viewer-1",
								displayName: "Viewer",
							},
						},
					],
				});
			}) as typeof fetch,
			getAccessToken: token,
		});

		expect(requestedUrl).toContain("liveChatId=chat-1");
		expect(requestedUrl).toContain("pageToken=cursor-1");
		expect(page.nextPageToken).toBe("cursor-2");
		expect(page.pollingIntervalMillis).toBe(4321);
		expect(youtubePageMessages(page, true)).toEqual([]);
		expect(youtubePageMessages(page, false)).toMatchObject([
			{ id: "message-1", provider: "youtube" },
		]);
	});

	test("surfaces ended and permission failures", async () => {
		const response = (reason: string, status: number) =>
			Response.json(
				{ error: { errors: [{ reason }], message: reason } },
				{ status },
			);
		await expect(
			fetchYoutubeChatPage("user", "ended", undefined, {
				fetch: (async () =>
					response("liveChatEnded", 403)) as unknown as typeof fetch,
				getAccessToken: token,
			}),
		).rejects.toThrow("liveChatEnded");
		await expect(
			findActiveYoutubeChat("user", {
				fetch: (async () =>
					response("forbidden", 403)) as unknown as typeof fetch,
				getAccessToken: token,
			}),
		).rejects.toThrow("forbidden");
	});
});
