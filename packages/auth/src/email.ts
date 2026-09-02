const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendAuthEmail(
	apiKey: string,
	message: { subject: string; text: string; to: string },
	request: (input: string, init: RequestInit) => Promise<Response> = fetch,
) {
	const response = await request(RESEND_ENDPOINT, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiKey}`,
			"Content-Type": "application/json",
			"User-Agent": "VISP/1.0",
		},
		body: JSON.stringify({
			from: "visp@info.pohina.group",
			to: message.to,
			subject: message.subject,
			text: message.text,
		}),
	});

	if (!response.ok) {
		throw new Error(
			`Resend rejected auth email with status ${response.status}`,
		);
	}
}
