import { env } from "@VISP/env/web";
import { Bubble, BubbleContent } from "@VISP/ui/components/bubble";
import {
	InputGroup,
	InputGroupAddon,
	InputGroupButton,
	InputGroupTextarea,
} from "@VISP/ui/components/input-group";
import { Message, MessageContent } from "@VISP/ui/components/message";
import {
	MessageScroller,
	MessageScrollerButton,
	MessageScrollerContent,
	MessageScrollerItem,
	MessageScrollerProvider,
	MessageScrollerViewport,
} from "@VISP/ui/components/message-scroller";
import { cn } from "@VISP/ui/lib/utils";
import { useChat } from "@ai-sdk/react";
import { Banner } from "@astryxdesign/core/Banner";
import { Button } from "@astryxdesign/core/Button";
import { Icon } from "@astryxdesign/core/Icon";
import { IconButton } from "@astryxdesign/core/IconButton";
import { HStack, VStack } from "@astryxdesign/core/Layout";
import { StatusDot } from "@astryxdesign/core/StatusDot";
import { Text } from "@astryxdesign/core/Text";
import {
	DefaultChatTransport,
	lastAssistantMessageIsCompleteWithToolCalls,
	type UIMessage,
} from "ai";
import {
	CheckIcon,
	MessageCircleIcon,
	RotateCcwIcon,
	SendIcon,
	SquareIcon,
	XIcon,
} from "lucide-react";
import { type SyntheticEvent, useEffect, useRef, useState } from "react";
import { Streamdown } from "streamdown";
import { MeterMark } from "@/components/meter-mark";

export type SeppoContext = "landing" | "setup" | "dashboard";

export type SeppoClientToolCall = {
	dynamic?: boolean;
	input: unknown;
	toolCallId: string;
	toolName: string;
};

type ToolPart = { input?: unknown; type: string };

const api = import.meta.env.PROD
	? "/api/seppo"
	: new URL("/api/seppo", env.VITE_SERVER_URL).toString();

const transports: Record<SeppoContext, DefaultChatTransport<UIMessage>> = {
	landing: new DefaultChatTransport({ api, body: { context: "landing" } }),
	setup: new DefaultChatTransport({
		api,
		body: { context: "setup" },
		credentials: "include",
	}),
	dashboard: new DefaultChatTransport({
		api,
		body: { context: "dashboard" },
		credentials: "include",
	}),
};

export function SeppoWidget({
	context,
	welcome,
	subtitle,
	placeholder,
	suggestions,
	open,
	onOpenChange,
	onToolCall,
	toolActivityLabel,
}: {
	context: SeppoContext;
	welcome: string;
	subtitle: string;
	placeholder: string;
	suggestions: string[];
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onToolCall?: (toolCall: SeppoClientToolCall) => Promise<string> | string;
	toolActivityLabel?: (part: ToolPart) => string | null;
}) {
	const [input, setInput] = useState("");
	const panelRef = useRef<HTMLDivElement>(null);
	const handlerRef = useRef(onToolCall);
	handlerRef.current = onToolCall;

	const initialMessages: UIMessage[] = [
		{
			id: `seppo-${context}-welcome`,
			role: "assistant",
			parts: [{ type: "text", text: welcome }],
		},
	];

	const {
		addToolOutput,
		clearError,
		error,
		messages,
		regenerate,
		sendMessage,
		status,
		stop,
	} = useChat({
		id: `seppo-${context}`,
		messages: initialMessages,
		transport: transports[context],
		sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
		async onToolCall({ toolCall }) {
			if (toolCall.dynamic || !handlerRef.current) return;
			try {
				const output = await handlerRef.current(toolCall);
				addToolOutput({
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					output,
				});
			} catch (error) {
				addToolOutput({
					tool: toolCall.toolName,
					toolCallId: toolCall.toolCallId,
					state: "output-error",
					errorText:
						error instanceof Error ? error.message : "Dashboard action failed",
				});
			}
		},
	});
	const isPending = status === "submitted" || status === "streaming";

	useEffect(() => {
		if (!open) return;
		const onKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") onOpenChange(false);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [onOpenChange, open]);

	useEffect(() => {
		if (open) panelRef.current?.querySelector("textarea")?.focus();
	}, [open]);

	function send() {
		const text = input.trim();
		if (!text || isPending) return;
		clearError();
		setInput("");
		void sendMessage({ text });
	}

	function submit(event: SyntheticEvent<HTMLFormElement>) {
		event.preventDefault();
		send();
	}

	return (
		<div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-end p-4 sm:p-5">
			<div className="pointer-events-auto relative flex flex-col items-end gap-3">
				<div
					ref={panelRef}
					aria-hidden={!open}
					aria-labelledby={`seppo-${context}-title`}
					aria-live="polite"
					className={cn(
						"flex h-[min(70vh,32rem)] w-[min(100vw-2rem,24rem)] origin-bottom-right flex-col overflow-hidden border border-border bg-background shadow-lg transition duration-200 ease-out",
						open
							? "translate-y-0 scale-100 opacity-100"
							: "pointer-events-none invisible absolute bottom-16 translate-y-2 scale-95 opacity-0",
					)}
					id={`seppo-${context}-panel`}
					inert={!open ? true : undefined}
					role="dialog"
				>
					<div className="flex items-start justify-between gap-3 border-border border-b px-4 py-3">
						<VStack gap={1}>
							<HStack gap={2} vAlign="center">
								<MeterMark className="h-3.5" />
								<span
									className="font-display font-semibold text-lg uppercase leading-none tracking-[0.18em]"
									id={`seppo-${context}-title`}
								>
									Seppo
								</span>
								<StatusDot
									isPulsing={isPending}
									label={isPending ? "Seppo is responding" : "Seppo is online"}
									variant={isPending ? "warning" : "success"}
								/>
							</HStack>
							<Text color="secondary" type="supporting">
								{subtitle}
							</Text>
						</VStack>
						<IconButton
							icon={<Icon color="inherit" icon={XIcon} size="sm" />}
							label="Close Seppo"
							variant="ghost"
							onClick={() => onOpenChange(false)}
						/>
					</div>
					<div className="min-h-0 flex-1 bg-card">
						<MessageScrollerProvider>
							<MessageScroller>
								<MessageScrollerViewport>
									<MessageScrollerContent className="p-4">
										{messages.map((message, messageIndex) => (
											<MessageScrollerItem key={message.id}>
												<Message
													align={message.role === "user" ? "end" : "start"}
												>
													<MessageContent>
														{message.parts.map((part, index) => {
															const key = `${message.id}-${index}`;
															if (part.type === "text") {
																return message.role === "user" ? (
																	<Bubble key={key} align="end">
																		<BubbleContent className="whitespace-pre-wrap">
																			{part.text}
																		</BubbleContent>
																	</Bubble>
																) : (
																	<Bubble key={key} variant="ghost">
																		<BubbleContent>
																			<Streamdown
																				caret="block"
																				className="space-y-2 [&_:is(h1,h2,h3,h4)]:font-semibold [&_:is(h1,h2,h3,h4)]:text-sm"
																				isAnimating={
																					status === "streaming" &&
																					messageIndex === messages.length - 1
																				}
																			>
																				{part.text}
																			</Streamdown>
																		</BubbleContent>
																	</Bubble>
																);
															}
															if (
																part.type.startsWith("tool-") &&
																"state" in part &&
																part.state !== "input-streaming"
															) {
																const label = toolActivityLabel?.(part);
																return label ? (
																	<span
																		key={key}
																		className="flex w-fit items-center gap-1.5 border border-border bg-muted/50 px-2 py-1 font-mono text-[11px] text-muted-foreground uppercase tracking-wide"
																	>
																		<CheckIcon aria-hidden className="size-3" />
																		{label}
																	</span>
																) : null;
															}
															return null;
														})}
													</MessageContent>
												</Message>
											</MessageScrollerItem>
										))}
										{status === "submitted" ? (
											<MessageScrollerItem>
												<Message>
													<MessageContent>
														<Bubble variant="ghost">
															<BubbleContent>
																<span
																	aria-label="Seppo is thinking"
																	className="flex items-center gap-1 py-1"
																	role="status"
																>
																	<span className="size-1.5 animate-pulse bg-muted-foreground" />
																	<span className="size-1.5 animate-pulse bg-muted-foreground [animation-delay:200ms]" />
																	<span className="size-1.5 animate-pulse bg-muted-foreground [animation-delay:400ms]" />
																</span>
															</BubbleContent>
														</Bubble>
													</MessageContent>
												</Message>
											</MessageScrollerItem>
										) : null}
									</MessageScrollerContent>
								</MessageScrollerViewport>
								<MessageScrollerButton />
							</MessageScroller>
						</MessageScrollerProvider>
					</div>
					<div className="border-border border-t p-3">
						{messages.length <= 1 && !isPending ? (
							<div className="flex flex-wrap gap-1.5 pb-2">
								{suggestions.map((suggestion) => (
									<button
										key={suggestion}
										className="border border-border bg-muted/40 px-2 py-1 text-muted-foreground text-xs transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
										type="button"
										onClick={() => {
											clearError();
											void sendMessage({ text: suggestion });
										}}
									>
										{suggestion}
									</button>
								))}
							</div>
						) : null}
						{error ? (
							<VStack gap={2}>
								<Banner
									description="The assistant could not respond. You can retry without losing this conversation."
									status="error"
									title="Seppo is unavailable right now"
								/>
								<Button
									icon={<Icon color="inherit" icon={RotateCcwIcon} size="sm" />}
									label="Retry"
									onClick={() => {
										clearError();
										void regenerate();
									}}
								/>
							</VStack>
						) : null}
						<form onSubmit={submit}>
							<InputGroup>
								<InputGroupTextarea
									aria-label="Message Seppo"
									maxLength={2_000}
									placeholder={placeholder}
									rows={2}
									value={input}
									onChange={(event) => setInput(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter" && !event.shiftKey) {
											event.preventDefault();
											send();
										}
									}}
								/>
								<InputGroupAddon align="inline-end">
									{isPending ? (
										<InputGroupButton
											aria-label="Stop response"
											size="icon-sm"
											type="button"
											onClick={() => void stop()}
										>
											<SquareIcon />
										</InputGroupButton>
									) : (
										<InputGroupButton
											aria-label="Send message"
											disabled={!input.trim()}
											size="icon-sm"
											type="submit"
										>
											<SendIcon />
										</InputGroupButton>
									)}
								</InputGroupAddon>
							</InputGroup>
						</form>
					</div>
				</div>

				<button
					aria-controls={`seppo-${context}-panel`}
					aria-expanded={open}
					aria-label={open ? "Close Seppo chat" : "Open Seppo chat"}
					className={cn(
						"flex size-14 items-center justify-center rounded-[var(--radius)] border border-border bg-primary text-primary-foreground shadow-md transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
						open && "bg-secondary text-secondary-foreground",
					)}
					type="button"
					onClick={() => onOpenChange(!open)}
				>
					<Icon
						color="inherit"
						icon={open ? XIcon : MessageCircleIcon}
						size="md"
					/>
				</button>
			</div>
		</div>
	);
}
