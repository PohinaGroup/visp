import { legalEntity } from "./legal";

/** Streamer-facing docs paths on docs.visp-stream.com */
export const docs = {
	getStarted: `${legalEntity.docsUrl}/docs/get-started`,
	videoSource: `${legalEntity.docsUrl}/docs/video-source`,
	phoneApp: `${legalEntity.docsUrl}/docs/phone-app`,
	directOutput: `${legalEntity.docsUrl}/docs/direct-output`,
	chatBot: `${legalEntity.docsUrl}/docs/chat-bot`,
	obsRemoteControl: `${legalEntity.docsUrl}/docs/obs-remote-control`,
	broadcasterSetup: `${legalEntity.docsUrl}/docs/broadcaster-setup`,
	selfHosting: `${legalEntity.docsUrl}/docs/self-hosting`,
} as const;
