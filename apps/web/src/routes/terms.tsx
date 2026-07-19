import { createFileRoute, Link } from "@tanstack/react-router";

import { LegalDoc } from "@/components/legal-doc";
import { legalEntity } from "@/lib/legal";

export const Route = createFileRoute("/terms")({
	head: () => ({
		meta: [
			{ title: "Terms of Service — VISP" },
			{
				name: "description",
				content:
					"Terms governing use of VISP, operated by Pöhinä Group Oy.",
			},
		],
	}),
	component: TermsPage,
});

function TermsPage() {
	return (
		<LegalDoc
			eyebrow="Legal"
			title="Terms of Service"
			description="These terms govern access to and use of VISP, including the website, dashboard, apps, and streaming relay services."
			updated="19 July 2026"
		>
			<section className="flex flex-col gap-3">
				<h2>1. Operator</h2>
				<p>
					VISP is operated by <strong>{legalEntity.companyName}</strong>{" "}
					(Business ID {legalEntity.businessId}),{" "}
					{legalEntity.addressLines.join(", ")} (“we”, “us”). Contact:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>2. The service</h2>
				<p>
					VISP provides tools to relay live SRT/RTMP streams and related control
					features for remote production workflows. The service is offered in
					beta and may change, be limited, or be interrupted without notice.
					Unless we state otherwise, use during beta is free of charge and does
					not require a credit card.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>3. Eligibility and accounts</h2>
				<p>
					You must be able to form a binding contract and comply with Twitch,
					Kick, and any other platform rules that apply to your broadcasts. You
					are responsible for activity under your VISP account and for keeping
					credentials and devices secure. Sign-in uses Twitch and/or Kick OAuth.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>4. Acceptable use</h2>
				<p>You agree not to:</p>
				<ul>
					<li>use VISP for unlawful, harmful, or infringing content;</li>
					<li>attempt to disrupt, probe, or overload the service;</li>
					<li>bypass access controls or reverse engineer except as allowed by law;</li>
					<li>
						misrepresent identity or interfere with other users’ streams or
						accounts;
					</li>
					<li>
						use VISP in ways that violate platform, copyright, or privacy laws
						applicable to your broadcast.
					</li>
				</ul>
				<p>
					You remain solely responsible for your stream content, destinations,
					and compliance with third-party platform terms.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>5. Stream keys and media</h2>
				<p>
					Your broadcast/stream keys are not intended to be uploaded to VISP.
					Live media is relayed according to your configuration. VISP may store
					short-lived private dashboard snapshots as described in the{" "}
					<Link to="/privacy">Privacy Policy</Link>. Continuous recordings are
					not provided as a storage product.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>6. Intellectual property and open source</h2>
				<p>
					VISP is open source under the {legalEntity.license} license. The
					source code is publicly available at{" "}
					<a
						href={legalEntity.sourceUrl}
						rel="noreferrer"
						target="_blank"
					>
						{legalEntity.sourceUrl}
					</a>
					. That license governs the licensed code; third-party components
					retain their own notices. VISP branding and site materials remain
					owned by us or our licensors except where otherwise stated. Your
					content remains yours.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>7. Beta disclaimer</h2>
				<p>
					THE SERVICE IS PROVIDED “AS IS” AND “AS AVAILABLE.” To the fullest
					extent permitted by law, we disclaim warranties of merchantability,
					fitness for a particular purpose, and non-infringement. We do not
					guarantee uninterrupted, error-free, or latency-free streaming.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>8. Liability</h2>
				<p>
					To the fullest extent permitted by Finnish and EU law, we are not
					liable for indirect, incidental, special, consequential, or lost
					profits damages, or for lost streams, audiences, or revenue. Nothing in
					these terms limits liability that cannot be limited under mandatory
					law (including liability for death or personal injury caused by
					negligence, or for fraud).
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>9. Suspension and termination</h2>
				<p>
					We may suspend or terminate access for abuse, legal risk, or service
					integrity. You may stop using VISP and delete your account at any time
					via <Link to="/request-delete">account deletion</Link>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>10. Privacy</h2>
				<p>
					Personal data is processed as described in the{" "}
					<Link to="/privacy">Privacy Policy</Link> and{" "}
					<Link to="/cookies">Cookie Policy</Link>.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>11. Changes</h2>
				<p>
					We may update these terms. Continued use after the updated date
					constitutes acceptance of the revised terms, except where mandatory
					law requires otherwise.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>12. Governing law</h2>
				<p>
					These terms are governed by the laws of {legalEntity.governingLaw},
					without regard to conflict-of-law rules. Courts of Finland have
					jurisdiction, subject to any mandatory consumer protections that apply
					in your country of residence.
				</p>
			</section>

			<section className="flex flex-col gap-3">
				<h2>13. Contact</h2>
				<p>
					Questions:{" "}
					<a href={`mailto:${legalEntity.email}`}>{legalEntity.email}</a>. See
					also <Link to="/contact">Contact</Link>.
				</p>
			</section>
		</LegalDoc>
	);
}
