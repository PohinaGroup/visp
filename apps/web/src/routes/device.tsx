import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";

import { EYEBROW, PageHeader } from "@/components/page-header";
import { authApiURL, authClient } from "@/lib/auth-client";
import { useLocale } from "@/lib/i18n";

export const Route = createFileRoute("/device")({
	ssr: false,
	validateSearch: z.object({
		user_code: z.string().optional(),
		lang: z.literal("fi").optional(),
	}),
	beforeLoad: async ({ location }) => {
		const session = await authClient.getSession();
		if (!session.data) {
			throw redirect({
				to: "/login",
				search: { redirect: location.href },
			});
		}
	},
	component: DeviceApproval,
});

type State = "checking" | "ready" | "approved" | "denied" | "error";

// Auth-scale CTA, same idiom as the lander's TryCta and the login screen.
const AUTH_BUTTON =
	"inline-flex h-12 items-center justify-center rounded-[var(--radius)] px-8 font-medium text-base transition-colors focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

// Signal-state colour, reserved strictly for state (tally red = refused/broken).
const stateDot: Record<State, { dot: string; pulse: boolean }> = {
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

function DeviceApproval() {
	const { user_code: userCode } = Route.useSearch();
	const fi = useLocale() === "fi";
	const [state, setState] = useState<State>("checking");
	const [message, setMessage] = useState("");

	useEffect(() => {
		if (!userCode) {
			setMessage(
				fi
					? "OBS-valtuutuskoodi puuttuu."
					: "The OBS authorization code is missing.",
			);
			setState("error");
			return;
		}
		void deviceRequest(
			`/device?user_code=${encodeURIComponent(userCode)}`,
		).then(async (response) => {
			if (response.ok) {
				setState("ready");
				return;
			}
			const error = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			setMessage(
				error?.message ??
					(fi
						? "Tämä OBS-valtuutus on vanhentunut."
						: "This OBS authorization has expired."),
			);
			setState("error");
		});
	}, [fi, userCode]);

	const decide = async (decision: "approve" | "deny") => {
		if (!userCode) return;
		setState("checking");
		const response = await deviceRequest(`/device/${decision}`, {
			method: "POST",
			body: JSON.stringify({ userCode }),
		});
		if (!response.ok) {
			const error = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			setMessage(
				error?.message ??
					(fi
						? "Valtuutusta ei voitu päivittää."
						: "Could not update this authorization."),
			);
			setState("error");
			return;
		}
		setState(decision === "approve" ? "approved" : "denied");
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
		state === "checking"
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

	const dot = stateDot[state];
	return (
		<main className="mx-auto w-full max-w-[720px] overflow-y-auto px-6 py-14">
			<div className="lander-rise flex flex-col gap-8">
				<PageHeader
					eyebrow={fi ? "OBS · Laitevaltuutus" : "OBS · Device authorization"}
					title={fi ? "Yhdistä OBS" : "Connect OBS"}
					subtitle={
						fi
							? "Hyväksy tietokoneellasi toimiva OBS-lisäosa."
							: "Approve the OBS plugin running on your computer."
					}
				/>

				{state === "ready" ? (
					<div className="flex flex-col gap-4">
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
			</div>
		</main>
	);
}
