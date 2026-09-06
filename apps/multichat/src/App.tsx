import { useEffect, useMemo, useState } from "react";
import { authClient, serverUrl, trpc } from "./lib";
import "./App.css";

const PROVIDERS = ["twitch", "kick", "tiktok"] as const;
type Provider = (typeof PROVIDERS)[number];
type Source = { provider: Provider; enabled: boolean; channelLogin: string };
type Message = {
	id: string;
	provider: Provider;
	sender: string;
	color?: string;
	text: string;
};

const providerName: Record<Provider, string> = {
	twitch: "Twitch",
	kick: "Kick",
	tiktok: "TikTok LIVE",
};

function appPath(path = "") {
	return `${import.meta.env.BASE_URL.replace(/\/$/, "")}${path}` || "/";
}

function Login() {
	const [pending, setPending] = useState<"twitch" | "kick" | "google">();
	const signIn = async (provider: "twitch" | "kick" | "google") => {
		setPending(provider);
		const callbackURL = window.location.href;
		const result =
			provider === "kick"
				? await authClient.signIn.oauth2({ providerId: "kick", callbackURL })
				: await authClient.signIn.social({ provider, callbackURL });
		if (result.error) {
			alert(result.error.message ?? "Sign in failed");
			setPending(undefined);
		}
	};
	return (
		<main className="login">
			<section className="panel">
				<p className="eyebrow">VISP</p>
				<h1>Multi-chat</h1>
				<p>
					Combine public Twitch, Kick, and TikTok LIVE chats in one OBS browser
					source.
				</p>
				{(["twitch", "kick", "google"] as const).map((provider) => (
					<button
						disabled={Boolean(pending)}
						key={provider}
						onClick={() => void signIn(provider)}
						type="button"
					>
						{pending === provider
							? "Opening sign-in…"
							: `Continue with ${provider === "google" ? "Google" : provider[0].toUpperCase() + provider.slice(1)}`}
					</button>
				))}
			</section>
		</main>
	);
}

function Overlay() {
	const token = useMemo(
		() =>
			new URLSearchParams(window.location.hash.slice(1)).get("t") ?? undefined,
		[],
	);
	const [messages, setMessages] = useState<Message[]>([]);
	const [state, setState] = useState("Connecting");

	useEffect(() => {
		if (!token) {
			setState("Missing browser-source credential");
			return;
		}
		let closed = false;
		let socket: WebSocket | undefined;
		let retry: ReturnType<typeof setTimeout> | undefined;
		const connect = async () => {
			try {
				const response = await fetch(
					`${serverUrl}/api/multichat/overlay/ticket`,
					{
						method: "POST",
						headers: { "content-type": "application/json" },
						body: JSON.stringify({ token }),
					},
				);
				if (response.status === 401) {
					setState("Browser-source credential was revoked");
					return;
				}
				if (!response.ok) throw new Error("Ticket unavailable");
				const { ticket } = (await response.json()) as { ticket: string };
				const url = new URL("/api/multichat/live", serverUrl);
				url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
				url.searchParams.set("ticket", ticket);
				socket = new WebSocket(url);
				socket.onopen = () => setState("Live");
				socket.onerror = () => socket?.close();
				socket.onclose = () => {
					if (!closed) retry = setTimeout(() => void connect(), 2_000);
				};
				socket.onmessage = ({ data }) => {
					if (typeof data !== "string") return;
					try {
						const event = JSON.parse(data) as
							| { type: "message"; message: Message }
							| {
									type: "status";
									status: {
										provider: Provider;
										state: string;
										error?: string;
									};
							  };
						if (event.type === "message") {
							setMessages((current) => [event.message, ...current].slice(0, 8));
						} else if (event.status.state === "error")
							setState(
								event.status.error
									? `${providerName[event.status.provider]}: ${event.status.error}`
									: `${providerName[event.status.provider]} chat connection problem`,
							);
					} catch {
						// Ignore a malformed frame and keep the overlay connected.
					}
				};
			} catch {
				if (!closed) retry = setTimeout(() => void connect(), 2_000);
			}
		};
		void connect();
		return () => {
			closed = true;
			clearTimeout(retry);
			socket?.close();
		};
	}, [token]);

	return (
		<main className="overlay" aria-live="polite">
			{messages.length === 0 ? <p className="overlay-status">{state}</p> : null}
			{messages.map((message) => (
				<p className="message" key={`${message.provider}:${message.id}`}>
					<span className={`platform ${message.provider}`}>
						{providerName[message.provider]}
					</span>
					<strong style={{ color: message.color }}>{message.sender}</strong>
					<span>{message.text}</span>
				</p>
			))}
		</main>
	);
}

function Dashboard() {
	const [sources, setSources] = useState<Source[]>(
		PROVIDERS.map((provider) => ({
			provider,
			enabled: false,
			channelLogin: "",
		})),
	);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string>();
	const [overlayUrl, setOverlayUrl] = useState<string>();

	useEffect(() => {
		void trpc.multichat.get.query().then(
			(settings) => {
				setSources(settings.sources as Source[]);
				setLoading(false);
			},
			() => {
				setError("Could not load multi-chat settings");
				setLoading(false);
			},
		);
	}, []);

	const update = (
		provider: Provider,
		field: "enabled" | "channelLogin",
		value: boolean | string,
	) => {
		setSources((current) =>
			current.map((source) =>
				source.provider === provider ? { ...source, [field]: value } : source,
			),
		);
	};
	const save = async () => {
		setSaving(true);
		setError(undefined);
		try {
			const settings = await trpc.multichat.save.mutate(sources);
			setSources(settings.sources as Source[]);
		} catch (cause) {
			setError(
				cause instanceof Error ? cause.message : "Could not save settings",
			);
		} finally {
			setSaving(false);
		}
	};
	const issueOverlay = async () => {
		try {
			const { token } = await trpc.multichat.overlay.issue.mutate();
			setOverlayUrl(
				`${window.location.origin}${appPath("/overlay")}#t=${token}`,
			);
		} catch {
			setError("Could not create browser-source URL");
		}
	};
	const copyOverlayUrl = async () => {
		if (!overlayUrl) return;
		try {
			await navigator.clipboard.writeText(overlayUrl);
		} catch {
			setError("Copy the browser-source URL from the field below");
		}
	};
	return (
		<main className="dashboard">
			<header>
				<div>
					<p className="eyebrow">VISP</p>
					<h1>Multi-chat</h1>
				</div>
				<button
					className="quiet"
					onClick={() =>
						void authClient.signOut().then(() => window.location.reload())
					}
					type="button"
				>
					Sign out
				</button>
			</header>
			<section className="panel">
				<h2>Channels</h2>
				<p>
					Enter public channel nicknames. VISP reads messages with its platform
					bots. Your accounts stay unlinked.
				</p>
				{loading ? (
					<p>Loading…</p>
				) : (
					sources.map((source) => (
						<label className="source" key={source.provider}>
							<input
								checked={source.enabled}
								onChange={(event) =>
									update(source.provider, "enabled", event.target.checked)
								}
								type="checkbox"
							/>
							<span>{providerName[source.provider]}</span>
							<input
								aria-label={`${providerName[source.provider]} channel nickname`}
								onChange={(event) =>
									update(source.provider, "channelLogin", event.target.value)
								}
								placeholder="channel nickname"
								value={source.channelLogin}
							/>
						</label>
					))
				)}
				<button
					disabled={loading || saving}
					onClick={() => void save()}
					type="button"
				>
					{saving ? "Saving…" : "Save channels"}
				</button>
				{error ? <p className="error">{error}</p> : null}
			</section>
			<section className="panel">
				<h2>OBS browser source</h2>
				<p>
					Generate a private URL, paste it into an OBS Browser Source, then keep
					the URL private.
				</p>
				<button onClick={() => void issueOverlay()} type="button">
					{overlayUrl
						? "Rotate browser-source URL"
						: "Generate browser-source URL"}
				</button>
				{overlayUrl ? (
					<button
						className="copy"
						onClick={() => void copyOverlayUrl()}
						type="button"
					>
						Copy URL
					</button>
				) : null}
				{overlayUrl ? (
					<textarea
						aria-label="Browser source URL"
						readOnly
						value={overlayUrl}
					/>
				) : null}
			</section>
		</main>
	);
}

function App() {
	const { data: session, isPending } = authClient.useSession();
	if (window.location.pathname.endsWith("/overlay")) return <Overlay />;
	if (isPending) return <main className="login">Loading…</main>;
	return session ? <Dashboard /> : <Login />;
}

export default App;
