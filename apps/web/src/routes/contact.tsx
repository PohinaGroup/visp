import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { legalEntity } from "@/lib/legal";
import { localizedHead } from "@/lib/i18n";

export const Route = createFileRoute("/contact")({
	head: () => ({
		meta: [
			{ title: "Contact — VISP" },
			{
				name: "description",
				content:
					"Contact Pöhinä Group Oy, the company behind VISP.",
			},
		],
		links: localizedHead("en", "/contact"),
	}),
	component: ContactPage,
});

function ContactPage() {
	return (
		<LegalDoc
			eyebrow="Legal"
			title="Contact"
			description="Company information and how to reach the team behind VISP."
			updated="19 July 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>Company</h2>
				<p>
					<strong>{legalEntity.companyName}</strong>
					<br />
					Business ID (Y-tunnus): {legalEntity.businessId}
					<br />
					{legalEntity.addressLines.map((line) => (
						<span key={line}>
							{line}
							<br />
						</span>
					))}
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>Email</h2>
				<p>
					General, privacy, and support:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>
				</p>
				<p>
					For account deletion requests when you cannot sign in, email the same
					address with subject “VISP account deletion” and your Twitch or Kick
					username. You can also use the{" "}
					<Link to="/request-delete">account deletion page</Link> when signed in.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>Open source</h2>
				<p>
					VISP is open source under the {legalEntity.license} license. The
					source code is available at{" "}
					<a
						href={legalEntity.sourceUrl}
						rel="noreferrer"
						target="_blank"
					>
						{legalEntity.sourceUrl}
					</a>
					.
				</p>
				<p>
					The OBS plugin is live in beta. Download builds from{" "}
					<a
						href={legalEntity.releasesUrl}
						rel="noreferrer"
						target="_blank"
					>
						{legalEntity.releasesUrl}
					</a>
					.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>Product links</h2>
				<ul>
					<li>
						<Link to="/download">Download & beta access</Link>
					</li>
					<li>
						<a href={legalEntity.docsUrl} rel="noreferrer" target="_blank">
							Documentation
						</a>
					</li>
					<li>
						<a href={legalEntity.sourceUrl} rel="noreferrer" target="_blank">
							GitHub
						</a>
					</li>
				</ul>
			</section>

			<section className="flex flex-col gap-3">
				<h2>Legal documents</h2>
				<ul>
					<li>
						<Link to="/privacy">Privacy Policy</Link>
					</li>
					<li>
						<Link to="/terms">Terms of Service</Link>
					</li>
					<li>
						<Link to="/cookies">Cookie Policy</Link>
					</li>
				</ul>
			</section>
		</LegalDoc>
	);
}
