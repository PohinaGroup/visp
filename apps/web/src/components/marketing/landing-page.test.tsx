import { expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRootRoute,
	createRouter,
	RouterContextProvider,
} from "@tanstack/react-router";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import { renderToStaticMarkup } from "react-dom/server";
import { landingCopy } from "@/lib/landing-copy";

// The shell's header, TryCta, and Seppo read VITE_SERVER_URL at import time.
// A default URL (no module mock, so nothing leaks to other files).
process.env.VITE_SERVER_URL ??= "http://localhost:3000";
const { TRPCProvider } = await import("@/utils/trpc");
const { LandingPage } = await import("./landing-page");

const esc = (s: string) => renderToStaticMarkup(s);

test("the shell wraps the sections with the hero CTA and the closing CTA", () => {
	const queryClient = new QueryClient();
	const trpcClient = createTRPCClient({
		links: [httpBatchLink({ url: "http://localhost:3000/trpc" })],
	});
	const router = createRouter({
		routeTree: createRootRoute(),
		history: createMemoryHistory(),
	});
	const closing = { title: "Closing title", body: "Closing & body" };
	const html = renderToStaticMarkup(
		<QueryClientProvider client={queryClient}>
			{/* biome-ignore lint/suspicious/noExplicitAny: test client for an untyped router */}
			<TRPCProvider trpcClient={trpcClient as any} queryClient={queryClient}>
				<RouterContextProvider router={router}>
					<LandingPage
						locale="en"
						hero={{ title: "Hero title", body: "Hero body" }}
						media={<img alt="" src="/x.jpg" />}
						topNote={<p>Top note</p>}
						closing={closing}
					>
						<section>Page sections</section>
					</LandingPage>
				</RouterContextProvider>
			</TRPCProvider>
		</QueryClientProvider>,
	);

	expect(html.match(/<h1[ >]/g)).toHaveLength(1);
	expect(html.match(/id="hero-cta"/g)).toHaveLength(1);
	expect(html.match(/id="closing"/g)).toHaveLength(1);
	const order = [
		"Top note",
		"Hero title",
		'id="hero-cta"',
		"Page sections",
		'id="closing"',
		esc(closing.title),
		esc(closing.body),
	].map((s) => html.indexOf(s));
	expect(order.every((at) => at > -1)).toBe(true);
	expect(order).toEqual([...order].sort((a, b) => a - b));
	// The closing section repeats the try-free CTA.
	const start = html.indexOf('id="closing"');
	const closingHtml = html.slice(start, html.indexOf("</section>", start));
	expect(closingHtml).toContain("Start free");
	// After main: the footer, then the sticky CTA bar and the Seppo launcher.
	const footer = html.indexOf("<footer", html.indexOf("</main>"));
	expect(footer).toBeGreaterThan(-1);
	for (const link of landingCopy.en.shared.footer)
		expect(html.slice(footer)).toContain(esc(link.label));
	expect(html.slice(footer)).toContain('aria-label="Open Seppo chat"');
});
