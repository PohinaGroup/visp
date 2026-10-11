import { createFileRoute, redirect } from "@tanstack/react-router";
import { type FormEvent, useState } from "react";
import { z } from "zod";

import { EYEBROW, PageHeader } from "@/components/page-header";
import { authApiURL, authClient } from "@/lib/auth-client";
import {
	formatDeviceCode,
	isDeviceCode,
	normalizeDeviceCode,
	OBS_CLIENT_ID,
} from "@/lib/device-code";
import { useLocale } from "@/lib/i18n";

export const Route = createFileRoute("/device")({
	ssr: false,
	validateSearch: z.object({
		// Older OBS plugins open the link with the code attached. It is never
		// used: anyone can mint a code and send that link, so the person
		// approving must type the code their own OBS shows.
		user_code: z.string().max(256).optional(),
		lang: z.literal("fi").optional(),
	}),
	head: () => ({
		meta: [
			{ name: "robots", content: "noindex, nofollow" },
			{ name: "referrer", content: "no-referrer" },
		],
	}),
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		// ponytail: ssr:false means the server shipped this route's pending fallback;
		// a soft redirect would hydrate /login over it and blow up hydration.
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
				reloadDocument: true,
			});
		}
	},
	component: DeviceApproval,
});

type State = "entry" | "checking" | "ready" | "approved" | "denied" | "error";

// Auth-scale CTA, same idiom as the lander's TryCta and the login screen.
const AUTH_BUTTON =
	"inline-flex h-12 items-center justify-center rounded-[var(--radius)] px-8 font-medium text-base transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 disabled:opacity-50";

const CODE_FIELD =
	"h-14 w-full max-w-[16rem] rounded-[var(--radius)] border border-border bg-transparent px-4 font-mono text-2xl text-foreground uppercase tracking-[0.2em] focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

// Signal-state colour, reserved strictly for state (tally red = refused/broken).
const stateDot: Record<State, { dot: string; pulse: boolean }> = {
	entry: { dot: "bg-muted-foreground", pulse: false },
	checking: { dot: "bg-caution", pulse: false },
	ready: { dot: "bg-muted-foreground", pulse: false },
	approved: { dot: "bg-signal", pulse: false },
	denied: { dot: "bg-tally", pulse: false },
	error: { dot: "bg-tally", pulse: true },
};

async function deviceRequest(path: string, init?: RequestInit) {
	return fetch(authApiURL(path), {
		...init,
		credentials: "include",
		headers: {
			...(init?.body ? { "content-type": "application/json" } : {}),
			...init?.headers,
		},
	});
}

async function errorMessage(response: Response) {
	const error = (await response.json().catch(() => null)) as {
		error_description?: string;
		message?: string;
	} | null;
	return error?.error_description ?? error?.message;
}

function DeviceApproval() {
	const { user_code: linkedCode } = Route.useSearch();
	const fi = useLocale() === "fi";
	const [state, setState] = useState<State>("entry");
	const [input, setInput] = useState("");
	// The code this page checked and will approve: always the typed one.
	const [userCode, setUserCode] = useState("");
	const [message, setMessage] = useState("");

	const fail = (text: string) => {
		setMessage(text);
		setState("error");
	};

	const check = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const code = normalizeDeviceCode(input);
		if (!isDeviceCode(code)) {
			setMessage(
				fi
					? "Koodissa on 8 kirjainta ja numeroa, esimerkiksi ABCD-EFGH."
					: "The code is 8 letters and numbers, like ABCD-EFGH.",
			);
			return;
		}
		setMessage("");
		setState("checking");
		const response = await deviceRequest(
			`/device?user_code=${encodeURIComponent(code)}`,
		);
		if (!response.ok) {
			fail(
				(await errorMessage(response)) ??
					(fi
						? "Koodia ei löytynyt tai se on vanhentunut. Aloita kirjautuminen OBS:ssä uudelleen."
						: "That code was not found or has expired. Start sign-in again in OBS."),
			);
			return;
		}
		const request = (await response.json()) as {
			client_id?: string;
			status?: string;
		};
		if (request.status !== "pending") {
			fail(
				fi
					? "Tämä koodi on jo käytetty. Aloita kirjautuminen OBS:ssä uudelleen."
					: "This code has already been used. Start sign-in again in OBS.",
			);
			return;
		}
		// The client is only revealed once this account holds the request.
		if (request.client_id !== OBS_CLIENT_ID) {
			fail(
				fi
					? "Tätä koodia ei voi hyväksyä tällä sivulla."
					: "This code can't be approved on this page.",
			);
			return;
		}
		setUserCode(code);
		setState("ready");
	};

	const decide = async (decision: "approve" | "deny") => {
		if (!userCode) return;
		setState("checking");
		const response = await deviceRequest(`/device/${decision}`, {
			method: "POST",
			body: JSON.stringify({ userCode }),
		});
		if (!response.ok) {
			fail(
				(await errorMessage(response)) ??
					(fi
						? "Valtuutusta ei voitu päivittää."
						: "Could not update this authorization."),
			);
			return;
		}
		setState(decision === "approve" ? "approved" : "denied");
	};

	const restart = () => {
		setInput("");
		setUserCode("");
		setMessage("");
		setState("entry");
	};

	const scopes = fi
		? [
				{ tag: "DEVICES", body: "Nähdä aktiiviset lähetyslaitteesi." },
				{
					tag: "PUBLISH",
					body: "Luoda lähetyslaitteen tälle OBS-asennukselle.",
				},
				{ tag: "SOURCES", body: "Lisätä välitysvirrat OBS:n medialähteiksi." },
				{ tag: "CONTROL", body: "Vastaanottaa nykyiset etäohjauskomentosi." },
			]
		: [
				{ tag: "DEVICES", body: "See your active publishing devices." },
				{
					tag: "PUBLISH",
					body: "Create a publishing device for this OBS installation.",
				},
				{ tag: "SOURCES", body: "Add your relay feeds as OBS Media Sources." },
				{
					tag: "CONTROL",
					body: "Receive your existing remote-control commands.",
				},
			];

	const statusLabel =
		state === "entry"
			? fi
				? "Syötä koodi"
				: "Enter code"
			: state === "checking"
				? fi
					? "Tarkistetaan"
					: "Checking"
				: state === "ready"
					? fi
						? "Odottaa hyväksyntää"
						: "Awaiting approval"
					: state === "approved"
						? fi
							? "Hyväksytty"
							: "Approved"
						: state === "denied"
							? fi
								? "Estetty"
								: "Denied"
							: fi
								? "Virhe"
								: "Error";

	const statusDetail =
		state === "approved"
			? fi
				? "OBS on hyväksytty. Voit sulkea tämän sivun ja palata OBS:ään."
				: "OBS is approved. You can close this page and return to OBS."
			: state === "denied"
				? fi
					? "OBS:n käyttö estettiin. Voit sulkea tämän sivun."
					: "OBS access was denied. You can close this page."
				: state === "error"
					? message
					: null;

	const warning = fi
		? "Syötä vain koodi, jonka oma OBS näyttää juuri nyt tällä tietokoneella. Älä koskaan syötä koodia, jonka joku on lähettänyt sinulle: hän saisi pääsyn tiliisi."
		: "Only enter a code that your own OBS is showing on your computer right now. Never enter a code someone sent you: it would give them access to your account.";

	const dot = stateDot[state];
	return (
		<main className="mx-auto w-full max-w-[720px] overflow-y-auto px-6 py-14">
			<div className="lander-rise flex flex-col gap-8">
				<PageHeader
					eyebrow={fi ? "OBS · Laitevaltuutus" : "OBS · Device authorization"}
					title={fi ? "Yhdistä OBS" : "Connect OBS"}
					subtitle={
						fi
							? "Hyväksy tietokoneellasi toimiva VISP-lisäosa OBS:lle syöttämällä OBS:n näyttämä koodi."
							: "Approve the VISP plugin for OBS on your computer by typing the code OBS shows."
					}
				/>

				{state === "entry" || state === "checking" ? (
					<form className="flex flex-col gap-4" onSubmit={check}>
						{linkedCode ? (
							<p className="border-caution border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed">
								{fi
									? "Linkin mukana tullutta koodia ei käytetä. Kirjoita alle koodi, jonka OBS näyttää."
									: "The code in this link is not used. Type the code shown in OBS below."}
							</p>
						) : null}
						<label className="flex flex-col gap-2 text-sm" htmlFor="user-code">
							<span className={EYEBROW}>
								{fi ? "OBS:n näyttämä koodi" : "Code shown in OBS"}
							</span>
							<input
								autoCapitalize="characters"
								autoComplete="off"
								autoCorrect="off"
								// biome-ignore lint/a11y/noAutofocus: the code is the only thing to do on this page
								autoFocus
								className={CODE_FIELD}
								disabled={state === "checking"}
								id="user-code"
								maxLength={16}
								name="user-code"
								placeholder="ABCD-EFGH"
								required
								spellCheck={false}
								value={input}
								onChange={(event) => setInput(event.target.value)}
							/>
						</label>
						{message ? (
							<p className="text-sm text-tally leading-relaxed" role="alert">
								{message}
							</p>
						) : null}
						<p className="max-w-[60ch] text-muted-foreground text-sm leading-relaxed">
							{warning}
						</p>
						<div>
							<button
								className={`${AUTH_BUTTON} bg-primary text-primary-foreground hover:opacity-90`}
								disabled={state === "checking"}
								type="submit"
							>
								{fi ? "Jatka" : "Continue"}
							</button>
						</div>
					</form>
				) : null}

				{state === "ready" ? (
					<div className="flex flex-col gap-4">
						<div className="flex flex-col gap-2 border border-border p-6">
							<span className={EYEBROW}>
								{fi ? "Hyväksyttävä pyyntö" : "Request to approve"}
							</span>
							<span className="font-mono text-3xl tracking-[0.2em]">
								{formatDeviceCode(userCode)}
							</span>
							<span className="text-muted-foreground text-sm leading-relaxed">
								{fi
									? "VISP-lisäosa OBS:lle tietokoneella, joka näyttää tämän koodin."
									: "The VISP plugin for OBS on the computer showing this code."}
							</span>
						</div>
						<p className="border-caution border-l-2 bg-card/40 px-4 py-3 text-sm leading-relaxed">
							{fi
								? "Varmista, että OBS näyttää täsmälleen tämän koodin. Jos et itse aloittanut kirjautumista OBS:ssä, valitse Estä."
								: "Check that OBS shows exactly this code. If you didn't just start sign-in in OBS yourself, choose Deny."}
						</p>
						<span className={EYEBROW}>
							{fi ? "OBS saa oikeuden" : "OBS will be able to"}
						</span>
						<ul className="grid gap-px border border-border bg-border sm:grid-cols-2">
							{scopes.map((scope) => (
								<li
									className="flex flex-col gap-2 bg-background p-6"
									key={scope.tag}
								>
									<span className={EYEBROW}>{scope.tag}</span>
									<span className="text-muted-foreground text-sm leading-relaxed">
										{scope.body}
									</span>
								</li>
							))}
						</ul>
						<p className="text-muted-foreground text-sm leading-relaxed">
							{fi
								? "Hyväksyminen korvaa tiliin aiemmin yhdistetyn OBS-lisäosan."
								: "Approving replaces any previously paired OBS plugin for this account."}
						</p>
					</div>
				) : null}

				<div className="flex flex-col gap-3 border-border border-t pt-6">
					<span className="flex items-center gap-2">
						<span
							className={`inline-block size-2 shrink-0 rounded-full ${dot.dot} ${dot.pulse ? "tally-pulse" : ""}`}
						/>
						<span className={EYEBROW}>{statusLabel}</span>
					</span>
					{statusDetail ? (
						<p className="text-muted-foreground text-sm leading-relaxed">
							{statusDetail}
						</p>
					) : null}
				</div>

				{state === "ready" ? (
					<div className="flex flex-col gap-3 sm:flex-row">
						<button
							className={`${AUTH_BUTTON} bg-primary text-primary-foreground hover:opacity-90`}
							onClick={() => void decide("approve")}
							type="button"
						>
							{fi ? "Hyväksy" : "Approve"}
						</button>
						<button
							className={`${AUTH_BUTTON} border border-border text-foreground hover:bg-card`}
							onClick={() => void decide("deny")}
							type="button"
						>
							{fi ? "Estä" : "Deny"}
						</button>
					</div>
				) : null}

				{state === "error" ? (
					<div>
						<button
							className={`${AUTH_BUTTON} border border-border text-foreground hover:bg-card`}
							onClick={restart}
							type="button"
						>
							{fi ? "Syötä koodi uudelleen" : "Enter a code again"}
						</button>
					</div>
				) : null}
			</div>
		</main>
	);
}
