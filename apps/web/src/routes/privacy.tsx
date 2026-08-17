import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { localizedHead } from "@/lib/i18n";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/privacy")({
	head: () => ({
		meta: [
			{ title: "Privacy Policy — VISP" },
			{
				name: "description",
				content:
					"How VISP and Pöhinä Group Oy collect, use, and protect your personal data.",
			},
		],
		links: localizedHead("en", "/privacy"),
	}),
	component: PrivacyPage,
});

function PrivacyPage() {
	return (
		<LegalDoc
			eyebrow="Legal"
			title="Privacy Policy"
			description="This policy explains how VISP processes personal data when you use the website, dashboard, mobile apps, and related streaming relay services."
			updated="14 August 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Controller</h2>
				<p>
					The data controller is <strong>{legalEntity.companyName}</strong>{" "}
					(Business ID {legalEntity.businessId}),{" "}
					{legalEntity.addressLines.join(", ")}. Contact:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>2. What VISP is</h2>
				<p>
					VISP is a self-hosted SRT/RTMP relay and control plane for remote live
					streaming. You are never asked to paste a broadcast/stream key. If you
					turn on VISP Direct for a device, VISP retrieves that platform's
					stream destination from Twitch, Kick, or YouTube using permission you
					grant in their OAuth screen, uses it only to run the forwarding
					process while that device is live, and does not store a stream key as
					a separate value or return it to any client app. YouTube Direct
					creates a public broadcast with automatic start and stop. VISP relays
					live media and provides account, dashboard, and device features around
					that relay.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>3. Data we process</h2>
				<ul>
					<li>
						<strong>Account data</strong> from Twitch, Kick, Google, or Apple
						(iOS) sign-in: name, email address (including Apple private relay
						addresses when chosen), profile image, and linked provider account
						identifiers.
					</li>
					<li>
						<strong>Authentication data</strong>: OAuth access/refresh tokens
						(stored securely), sessions, IP address, and user agent.
					</li>
					<li>
						<strong>Service configuration</strong>: relay publishing paths,
						labels, hashed/encrypted publish secrets, native installation IDs,
						and setup preferences.
					</li>
					<li>
						<strong>Operational measurements</strong>: connection and latency
						(RTT) samples associated with your account, plus relay session
						start/end times, publishing device, source type, and calculated
						duration. VISP does not store the streamed audio or video.
					</li>
					<li>
						<strong>Dashboard snapshots</strong>: one private low-resolution
						(~640px) still image per publishing path while live, refreshed about
						once a minute and expired within about one day after updates stop.
					</li>
					<li>
						<strong>Chat connection metadata</strong> needed to connect chat
						integrations (for example subscription IDs). Chat message content is
						not retained by VISP as a content archive. If you enable hosted
						text-to-speech, the text selected for speech is sent to the hosted
						speech provider to create the requested audio.
					</li>
					<li>
						<strong>Optional speech-processing data</strong>: if your account
						has hosted captions or hosted audio isolation enabled and you turn
						the feature on, live microphone audio is sent to ElevenLabs to
						produce caption text or isolated audio. The normal on-device speech
						and audio options do not send microphone audio to ElevenLabs.
					</li>
					<li>
						<strong>Assistant conversations</strong>: messages sent to Seppo
						and, when you use it on the dashboard, a sanitized service-status
						summary. These are sent through the configured AI gateway to the
						selected model provider to generate a reply. Secrets and snapshot
						contents are not included in that summary.
					</li>
					<li>
						<strong>Founding creator application data</strong>: your name, email
						address, YouTube channel and relevant-content URLs, description of
						your audience and setup, and disclosure acknowledgement when you
						apply to the creator program. Applications are also forwarded to our
						internal team chat so we can review and reply to them.
					</li>
					<li>
						<strong>Security and service logs</strong> for reliability, abuse
						prevention, and debugging.
					</li>
				</ul>
				<p>
					VISP does not process payment card data. The service is currently free
					in beta and does not bill users.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>4. Purposes and legal bases</h2>
				<ul>
					<li>
						<strong>Providing the service</strong> (contract / steps prior to
						contract): account creation, authentication, relay configuration,
						dashboard, optional speech processing and assistant features.
					</li>
					<li>
						<strong>Founding creator applications</strong> (steps prior to
						contract / contract): reviewing applications, responding to
						applicants, and administering accepted creator relationships.
					</li>
					<li>
						<strong>Security and integrity</strong> (legitimate interests):
						session security, fraud/abuse prevention, and service reliability.
					</li>
					<li>
						<strong>Legal obligations</strong> when we must retain or disclose
						data under applicable law.
					</li>
					<li>
						<strong>Product analytics</strong> (legitimate interests / privacy
						design): when configured, cookieless Rybbit analytics for
						understanding site usage — see the{" "}
						<Link to="/cookies">Cookie Policy</Link>.
					</li>
					<li>
						<strong>Optional cookies</strong> (consent), if and when enabled —
						see the <Link to="/cookies">Cookie Policy</Link>.
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2>5. Recipients and processors</h2>
				<p>
					We use infrastructure and subprocessors necessary to run VISP (for
					example hosting, database, object storage for snapshots, and OAuth
					identity providers Twitch, Kick, and Google). Optional hosted speech
					features use ElevenLabs. Seppo uses the configured AI gateway and
					model provider (currently Google Gemini). Those providers process only
					the content needed to provide the feature you invoke. When analytics
					is configured, it runs on our own self-hosted Rybbit instance, so
					analytics data is not shared with a third-party analytics provider.
					Stream destinations you choose (OBS, platforms) receive the media you
					publish; VISP does not take ownership of your stream keys, and
					retrieves them only for the duration of a VISP Direct session you have
					enabled.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>6. International transfers</h2>
				<p>
					Service infrastructure may process data in the EU/EEA or in other
					countries. Where data is transferred outside the EEA, we use
					appropriate safeguards required by GDPR (such as standard contractual
					clauses) where applicable.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>7. Retention</h2>
				<ul>
					<li>
						Account and configuration data: kept while your account is active;
						deleted from active systems when you delete the account.
					</li>
					<li>
						Relay session metadata and usage totals: kept while your account is
						active and deleted with the account.
					</li>
					<li>
						Snapshots: replaced while live; expire within about one day after
						updates stop.
					</li>
					<li>
						Unsuccessful founding creator applications: deleted within 12 months
						of the decision. Accepted partner data is retained for the
						relationship and any longer accounting or legal period that applies.
					</li>
					<li>
						Encrypted backups: up to 30 days before overwrite after deletion.
					</li>
					<li>
						Security and service logs: up to 90 days, unless law requires
						longer.
					</li>
					<li>
						Optional speech and assistant inputs: VISP does not retain them as a
						content archive; the external provider's processing and retention
						are also governed by its applicable service terms and
						data-processing arrangements.
					</li>
				</ul>
				<p>
					Continuous stream recordings and chat content archives are not kept by
					VISP.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>8. Your rights</h2>
				<p>
					Under GDPR you may have the right to access, rectify, erase, restrict,
					or object to processing, and to data portability, as applicable. You
					may withdraw consent where processing is based on consent. To exercise
					rights, email{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a> or use{" "}
					<Link to="/request-delete">account deletion</Link>.
				</p>
				<p>
					You may lodge a complaint with the{" "}
					<a
						href={legalEntity.supervisoryAuthority.url}
						rel="noreferrer"
						target="_blank"
					>
						{legalEntity.supervisoryAuthority.name}
					</a>{" "}
					or another competent supervisory authority.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>9. Cookies</h2>
				<p>
					Essential cookies are used for authentication and session security.
					Optional cookies are used only with your consent. Details:{" "}
					<Link to="/cookies">Cookie Policy</Link>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>10. Changes</h2>
				<p>
					We may update this policy when the service or law changes. The “Last
					updated” date at the top will change when we do. Material changes may
					also be communicated in the product or by email when appropriate.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>11. Contact</h2>
				<p>
					Privacy questions:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>. Full
					company details: <Link to="/contact">Contact</Link>.
				</p>
			</section>
		</LegalDoc>
	);
}
