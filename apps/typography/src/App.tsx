import {
	Fragment,
	useEffect,
	useMemo,
	useRef,
	useState,
	type ChangeEvent,
} from "react";
import "./App.css";

type CaptionStyle = "Karaoke" | "Hormozi" | "TikTok Basic" | "Minimal";
type Language = "English" | "Finnish";
type Word = {
	id: number;
	text: string;
	start: number;
	end: number;
	emphasis: number;
	group: number;
};

const apiUrl = import.meta.env.VITE_API_URL ?? "https://visp-stream.com";

const seedWords: Word[] = [
	{ id: 1, text: "I", start: 3.02, end: 3.18, emphasis: 0, group: 0 },
	{ id: 2, text: "think", start: 3.2, end: 3.42, emphasis: 0, group: 0 },
	{ id: 3, text: "the", start: 3.45, end: 3.56, emphasis: 0, group: 0 },
	{ id: 4, text: "biggest", start: 3.59, end: 4.02, emphasis: 96, group: 1 },
	{ id: 5, text: "mistake", start: 4.04, end: 4.45, emphasis: 92, group: 1 },
	{ id: 6, text: "companies", start: 4.62, end: 5.01, emphasis: 10, group: 2 },
	{ id: 7, text: "make", start: 5.03, end: 5.26, emphasis: 8, group: 2 },
	{ id: 8, text: "is", start: 5.3, end: 5.43, emphasis: 0, group: 2 },
	{ id: 9, text: "trying", start: 5.47, end: 5.79, emphasis: 0, group: 2 },
	{ id: 10, text: "to", start: 5.81, end: 5.92, emphasis: 0, group: 2 },
	{ id: 11, text: "automate", start: 5.96, end: 6.47, emphasis: 98, group: 3 },
	{ id: 12, text: "everything.", start: 6.5, end: 7.04, emphasis: 36, group: 3 },
];

const styleDescriptions: Record<CaptionStyle, string> = {
	Karaoke: "Active word highlight",
	Hormozi: "Aggressive phrase emphasis",
	"TikTok Basic": "Clean, high contrast captions",
	Minimal: "Quiet lower-third captions",
};

function classNames(...parts: Array<string | false | undefined>) {
	return parts.filter(Boolean).join(" ");
}

function formatTime(seconds: number) {
	const minutes = Math.floor(seconds / 60);
	const remainder = Math.floor(seconds % 60);
	const hundredths = Math.floor((seconds % 1) * 100);
	return (
		String(minutes).padStart(2, "0") +
		":" +
		String(remainder).padStart(2, "0") +
		"." +
		String(hundredths).padStart(2, "0")
	);
}

export default function App() {
	const inputRef = useRef<HTMLInputElement>(null);
	const videoRef = useRef<HTMLVideoElement>(null);
	const [words, setWords] = useState(seedWords);
	const [selectedId, setSelectedId] = useState(4);
	const [style, setStyle] = useState<CaptionStyle>("Hormozi");
	const [intensity, setIntensity] = useState(68);
	const [captionY, setCaptionY] = useState(61);
	const [playhead, setPlayhead] = useState(3.78);
	const [playing, setPlaying] = useState(false);
	const [safeArea, setSafeArea] = useState(true);
	const [sourceUrl, setSourceUrl] = useState<string | null>(null);
	const [sourceName, setSourceName] = useState("founder-advice.mp4");
	const [language, setLanguage] = useState<Language>("English");
	const [showUpload, setShowUpload] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [saved, setSaved] = useState(true);
	const [hook, setHook] = useState("");
	const [exporting, setExporting] = useState(false);
	const [notice, setNotice] = useState<string | null>(null);
	const [projectId, setProjectId] = useState<string | null>(null);
	const [exportUrl, setExportUrl] = useState<string | null>(null);

	const selected = words.find((word) => word.id === selectedId) ?? words[0];
	// Hold the current word through timing gaps until the next word starts.
	const active = words.findLast((word) => playhead >= word.start);
	const visible = useMemo(() => {
		const group = active?.group;
		return words.filter((word) => word.group === group);
	}, [active, words]);

	useEffect(() => {
		return () => {
			if (sourceUrl) URL.revokeObjectURL(sourceUrl);
		};
	}, [sourceUrl]);

	async function waitForProject(id: string) {
		for (let attempt = 0; attempt < 120; attempt++) {
			await new Promise((resolve) => window.setTimeout(resolve, 2_000));
			const response = await fetch(apiUrl + "/api/typography/projects/" + id, {
				credentials: "include",
			});
			if (!response.ok) continue;
			const project = (await response.json()) as {
				state: "processing" | "ready" | "failed";
				document: { words: Array<Omit<Word, "id" | "emphasis"> & { id: string; emphasis: number }>; style: CaptionStyle; intensity: number; hook: string; captionY: number };
			};
			if (project.state === "failed") {
				setProcessing(false);
				setNotice("Transcription failed. Try a different video.");
				return;
			}
			if (project.state !== "ready") continue;
			setWords(project.document.words.map((word) => ({ ...word, id: Number(word.id), emphasis: word.emphasis * 100 })));
			setStyle(project.document.style);
			setIntensity(project.document.intensity);
			setHook(project.document.hook);
			setCaptionY(project.document.captionY);
			setProcessing(false);
			setNotice("Your word-level captions are ready.");
			return;
		}
		setProcessing(false);
		setNotice("Transcription is taking longer than expected. Refresh this project shortly.");
	}

	useEffect(() => {
		void fetch(apiUrl + "/api/typography/projects", { credentials: "include" })
			.then(async (response) => {
				if (!response.ok) return;
				const [project] = (await response.json()) as Array<{
					id: string;
					title: string;
					language: "en" | "fi";
					state: "uploading" | "processing" | "ready" | "failed";
					document: { words: Array<Omit<Word, "id" | "emphasis"> & { id: string; emphasis: number }>; style: CaptionStyle; intensity: number; hook: string; captionY: number };
				}>;
				if (!project) return;
				if (project.state === "uploading") {
					setNotice("Your previous upload did not finish. Choose the video again to retry.");
					setShowUpload(true);
					return;
				}
				setProjectId(project.id);
				setSourceName(project.title);
				setLanguage(project.language === "fi" ? "Finnish" : "English");
				if (project.document.words.length) {
					setWords(project.document.words.map((word) => ({ ...word, id: Number(word.id), emphasis: word.emphasis * 100 })));
					setStyle(project.document.style);
					setIntensity(project.document.intensity);
					setHook(project.document.hook);
					setCaptionY(project.document.captionY);
				}
				const video = await fetch(apiUrl + "/api/typography/projects/" + project.id + "/video", {
					credentials: "include",
				});
				if (video.ok) setSourceUrl(((await video.json()) as { url: string }).url);
				if (project.state === "processing") {
					setProcessing(true);
					void waitForProject(project.id);
				}
			})
			.catch(() => undefined);
	}, []);

	useEffect(() => {
		if (!playing || sourceUrl) return;
		const interval = window.setInterval(() => {
			setPlayhead((current) => (current >= 7.04 ? 3.02 : current + 0.04));
		}, 40);
		return () => window.clearInterval(interval);
	}, [playing, sourceUrl]);

	useEffect(() => {
		function handleKeyDown(event: KeyboardEvent) {
			if (
				event.target instanceof HTMLInputElement ||
				event.target instanceof HTMLButtonElement ||
				event.target instanceof HTMLTextAreaElement
			)
				return;
			if (event.code === "Space") {
				event.preventDefault();
				const video = videoRef.current;
				if (video) {
					if (video.paused) void video.play();
					else video.pause();
				}
				setPlaying((current) => !current);
			}
		}
		window.addEventListener("keydown", handleKeyDown);
		return () => window.removeEventListener("keydown", handleKeyDown);
	}, []);

	useEffect(() => {
		if (!projectId) return;
		const timer = window.setTimeout(() => {
			void fetch(apiUrl + "/api/typography/projects/" + projectId, {
				method: "PUT",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					document: {
						version: 1,
						words: words.map((word) => ({ ...word, id: String(word.id), emphasis: word.emphasis / 100 })),
						style,
						intensity,
						hook,
						captionY,
					},
				}),
			}).catch(() => setNotice("Could not save this edit. Check your connection."));
		}, 600);
		return () => window.clearTimeout(timer);
	}, [captionY, hook, intensity, projectId, style, words]);

	function changeSaved() {
		setSaved(false);
		window.setTimeout(() => setSaved(true), 600);
	}

	function updateSelected(change: Partial<Word>) {
		setWords((current) =>
			current.map((word) =>
				word.id === selected.id ? { ...word, ...change } : word,
			),
		);
		changeSaved();
	}

	function selectWord(word: Word) {
		setSelectedId(word.id);
		setPlayhead(word.start);
		if (videoRef.current) videoRef.current.currentTime = word.start;
	}

	function togglePlayback() {
		const video = videoRef.current;
		if (video) {
			if (video.paused) void video.play();
			else video.pause();
		}
		setPlaying((current) => !current);
	}

	async function selectFile(event: ChangeEvent<HTMLInputElement>) {
		const file = event.target.files?.[0];
		if (!file) return;
		if (!file.type.startsWith("video/")) {
			setNotice("Choose an MP4, MOV, or WebM video.");
			return;
		}
		if (file.size > 500 * 1024 * 1024) {
			setNotice("Videos must be 500 MB or smaller.");
			return;
		}
		setSourceUrl(URL.createObjectURL(file));
		setSourceName(file.name);
		setProcessing(true);
		setShowUpload(false);
		try {
			const projectResponse = await fetch(apiUrl + "/api/typography/projects", {
				method: "POST",
				credentials: "include",
				headers: { "content-type": "application/json" },
				body: JSON.stringify({
					filename: file.name,
					language: language === "English" ? "en" : "fi",
					contentType: file.type,
					byteSize: file.size,
				}),
			});
			if (projectResponse.status === 401)
				throw new Error("Sign into VISP, then upload your video.");
			if (!projectResponse.ok) throw new Error("Could not create the project.");
			const created = (await projectResponse.json()) as {
				project: { id: string };
				uploadUrl: string;
			};
			const upload = await fetch(created.uploadUrl, {
				method: "PUT",
				headers: { "content-type": file.type },
				body: file,
			});
			if (!upload.ok) throw new Error("Could not upload the video.");
			const finalized = await fetch(
				apiUrl + "/api/typography/projects/" + created.project.id + "/finalize",
				{ method: "POST", credentials: "include" },
			);
			if (!finalized.ok) throw new Error("Could not start transcription.");
			setProjectId(created.project.id);
			setNotice("Video uploaded. VISP is creating word-level captions.");
			void waitForProject(created.project.id);
		} catch (error) {
			setNotice(error instanceof Error ? error.message : "Video upload failed.");
			setProcessing(false);
		}
	}

	function exportProject() {
		if (!projectId) {
			setNotice("Upload and transcribe a video before exporting.");
			return;
		}
		setExporting(true);
		void fetch(apiUrl + "/api/typography/projects/" + projectId + "/export", {
			method: "POST",
			credentials: "include",
		})
			.then((response) => {
				if (!response.ok) throw new Error("Export could not start.");
				setNotice("Export started. Your MP4 will appear when rendering finishes.");
				return waitForExport(projectId);
			})
			.catch((error: unknown) => setNotice(error instanceof Error ? error.message : "Export failed."))
			.finally(() => setExporting(false));
	}

	async function waitForExport(id: string) {
		for (let attempt = 0; attempt < 80; attempt++) {
			await new Promise((resolve) => window.setTimeout(resolve, 3_000));
			const response = await fetch(apiUrl + "/api/typography/projects/" + id + "/export", {
				credentials: "include",
			});
			if (response.status === 202) continue;
			if (!response.ok) {
				const result = (await response.json()) as { error?: string };
				throw new Error(result.error ?? "Export failed. Please try again.");
			}
			const result = (await response.json()) as { url: string };
			setExportUrl(result.url);
			setNotice("Your H.264 MP4 is ready.");
			return;
		}
		setNotice("Export is taking longer than expected. Keep this project open and try again.");
	}

	const previewClass = "phone-preview style-" + style.toLowerCase().replaceAll(" ", "-");

	return (
		<main className="app-shell">
			<header className="topbar">
				<a className="brand" href="/" aria-label="VISP Typography home">
					<MeterMark />
					<span className="brand-name">VISP</span>
					<span className="brand-sub">Typography</span>
				</a>
				<div className="project-title">
					<button className="project-name" type="button">
						{sourceName.replace(/\.[^/.]+$/, "")}
					</button>
					<span className={classNames("save-state", !saved && "saving")}>
						<span className="status-dot" />
						{saved ? "Saved" : "Saving"}
					</span>
				</div>
				<div className="topbar-actions">
					<button className="quiet-button" type="button" onClick={() => setShowUpload(true)}>
						New project
					</button>
					{exportUrl ? (
						<a className="export-button" href={exportUrl}>Download MP4</a>
					) : (
						<button className="export-button" type="button" onClick={exportProject} disabled={exporting}>
							{exporting ? "Preparing export..." : "Export"}
						</button>
					)}
				</div>
			</header>

			<ChainStrip
				source={sourceUrl ? "on" : "off"}
				transcribe={processing ? "live" : projectId ? "on" : "off"}
				style={projectId && !processing ? "on" : "off"}
				export={exportUrl ? "on" : exporting ? "live" : "off"}
			/>

			<section className="workspace">
				<aside className="transcript-panel panel">
					<div className="panel-header">
						<div>
							<p className="eyebrow">Transcript</p>
							<h1>Words</h1>
						</div>
						<button className="icon-button" type="button" aria-label="Transcript settings">•••</button>
					</div>
					<div className="language-row">
						<span className="language-badge">{language === "English" ? "EN" : "FI"}</span>
						<span>{language} transcription</span>
					</div>
					<div className="transcript-copy">
						{words.map((word) => (
							<button
								className={classNames("word-chip", word.id === selected.id && "selected", word.emphasis > 75 && "important")}
								type="button"
								key={word.id}
								onClick={() => selectWord(word)}
							>
								{word.text}
							</button>
						))}
					</div>
					<div className="panel-footer">Click a word to edit its timing, style, and emphasis.</div>
				</aside>

				<section className="editor-stage">
					<div className="stage-toolbar">
						<button className="tool-button active" type="button">9:16</button>
						<button className="tool-button" type="button" onClick={() => setSafeArea((value) => !value)}>
							{safeArea ? "Safe areas on" : "Safe areas off"}
						</button>
						<span className="duration">00:07</span>
					</div>
					<div className="preview-wrap">
						<div className={previewClass}>
							{sourceUrl ? (
								<video
									ref={videoRef}
									className="source-video"
									src={sourceUrl}
									playsInline
									onPlay={() => setPlaying(true)}
									onPause={() => setPlaying(false)}
									onTimeUpdate={(event) => setPlayhead(event.currentTarget.currentTime)}
								/>
							) : <PreviewBackdrop />}
							<div className="preview-vignette" />
							{safeArea && <SafeArea />}
							{hook && <div className="hook-overlay">{hook}</div>}
							<div className="caption-preview" style={{ top: String(captionY) + "%" }}>
								{visible.map((word) => (
									<span
										key={word.id}
										className={classNames(word.id === active?.id && "active", word.emphasis >= intensity && "emphasized")}
									>
										{word.text}
									</span>
								))}
							</div>
							{processing && <ProcessingOverlay />}
							{!projectId && !sourceUrl && (
								<button className="preview-start" type="button" onClick={() => setShowUpload(true)}>
									<span>Upload a video to start</span>
								</button>
							)}
						</div>
					</div>
					<div className="playback-row">
						<button className="play-button" type="button" onClick={togglePlayback} aria-label={playing ? "Pause" : "Play"}>
							{playing ? "Ⅱ" : "▶"}
						</button>
						<span className="timecode">{formatTime(playhead)}</span>
						<input
							aria-label="Playhead"
							type="range"
							min="3.02"
							max="7.04"
							step="0.01"
							value={playhead}
							onChange={(event) => {
								const value = Number(event.target.value);
								setPlayhead(value);
								if (videoRef.current) videoRef.current.currentTime = value;
							}}
						/>
						<span className="timecode">00:07.04</span>
					</div>
					<section className="timeline panel">
						<div className="timeline-header">
							<span>Caption timeline</span>
							<span>{formatTime(selected.start)} — {formatTime(selected.end)}</span>
						</div>
						<div className="timeline-track">
							<div className="playhead" style={{ left: String(((playhead - 3.02) / 4.02) * 100) + "%" }} />
							{words.map((word) => {
								const left = ((word.start - 3.02) / 4.02) * 100;
								const width = Math.max(((word.end - word.start) / 4.02) * 100, 4);
								return (
									<button
										className={classNames("timeline-word", word.id === selected.id && "selected", word.emphasis > 75 && "important")}
										type="button"
										key={word.id}
										style={{ left: String(left) + "%", width: String(width) + "%" }}
										onClick={() => selectWord(word)}
									>
										{word.text}
									</button>
								);
							})}
						</div>
					</section>
				</section>

				<aside className="inspector panel">
					<div className="inspector-tabs">
						<button className="tab active" type="button">Word</button>
						<button className="tab" type="button">Style</button>
					</div>
					<div className="inspector-body">
						<p className="eyebrow">Selected word</p>
						<input className="word-input" aria-label="Selected word" value={selected.text} onChange={(event) => updateSelected({ text: event.target.value })} />
						<label className="switch-row">
							<span><strong>Supersize</strong><small>Make this word larger</small></span>
							<input
								type="checkbox"
								checked={selected.emphasis > 75}
								onChange={(event) => updateSelected({ emphasis: event.target.checked ? 96 : 18 })}
							/>
							<span className="switch" />
						</label>
						<label className="field-label">
							Color
							<span className="select-wrap"><span className="color-swatch" /><select defaultValue="Yellow"><option>Yellow</option><option>White</option><option>Red</option></select></span>
						</label>
						<label className="field-label">
							Animation
							<select defaultValue="Spring pop"><option>Spring pop</option><option>Pop</option><option>Scale</option><option>Fade</option></select>
						</label>
						<div className="two-fields">
							<label className="field-label">Start<input type="number" step="0.01" value={selected.start} onChange={(event) => updateSelected({ start: Number(event.target.value) })} /></label>
							<label className="field-label">End<input type="number" step="0.01" value={selected.end} onChange={(event) => updateSelected({ end: Number(event.target.value) })} /></label>
						</div>
						<div className="divider" />
						<label className="field-label">
							AI intensity <span className="value">{intensity}%</span>
							<input type="range" min="0" max="100" value={intensity} onChange={(event) => { setIntensity(Number(event.target.value)); changeSaved(); }} />
						</label>
						<p className="hint">Controls how often the AI uses bold words, scale, and motion. Your edits stay in place.</p>
						<div className="divider" />
						<label className="field-label">
							Caption position <span className="value">{captionY}%</span>
							<input type="range" min="25" max="80" value={captionY} onChange={(event) => { setCaptionY(Number(event.target.value)); changeSaved(); }} />
						</label>
						<label className="field-label">
							Hook or CTA
							<textarea value={hook} maxLength={80} onChange={(event) => { setHook(event.target.value); changeSaved(); }} placeholder="WAIT FOR #3" />
						</label>
					</div>
				</aside>
			</section>

			<section className="style-dock">
				<div className="style-dock-label"><span className="eyebrow">Caption style</span><strong>{style}</strong></div>
				<div className="style-list">
					{(Object.keys(styleDescriptions) as CaptionStyle[]).map((item) => (
						<button
							className={classNames("style-card", style === item && "selected")}
							type="button"
							key={item}
							onClick={() => { setStyle(item); changeSaved(); }}
						>
							<span className={"style-sample sample-" + item.toLowerCase().replaceAll(" ", "-")}>Aa</span>
							<span><strong>{item}</strong><small>{styleDescriptions[item]}</small></span>
						</button>
					))}
				</div>
				<button className="text-button" type="button" onClick={() => setNotice("Style saved to your VISP account.")}>Save as style</button>
			</section>

			{showUpload && (
				<div className="modal-backdrop" role="presentation" onMouseDown={() => setShowUpload(false)}>
					<section className="upload-modal" role="dialog" aria-modal="true" aria-labelledby="upload-heading" onMouseDown={(event) => event.stopPropagation()}>
						<button className="close-button" type="button" onClick={() => setShowUpload(false)} aria-label="Close upload">×</button>
						<p className="eyebrow">New project</p>
						<h2 id="upload-heading">Turn speech into typography.</h2>
						<p className="modal-copy">Upload a video up to 500 MB. Your project and media stay available for 14 days.</p>
						<button className="dropzone" type="button" onClick={() => inputRef.current?.click()}>
							<span className="upload-icon">↑</span><strong>Choose a video</strong><span>MP4, MOV, or WebM</span>
						</button>
						<label className="field-label">
							Spoken language
							<select value={language} onChange={(event) => setLanguage(event.target.value as Language)}><option>English</option><option>Finnish</option></select>
						</label>
						<input ref={inputRef} className="visually-hidden" type="file" accept="video/mp4,video/quicktime,video/webm,video/*" onChange={selectFile} />
					</section>
				</div>
			)}
			{notice && <button className="notice" type="button" onClick={() => setNotice(null)}>{notice}<span>×</span></button>}
		</main>
	);
}

// Monochrome level-meter mark — the VISP brand mark.
function MeterMark() {
	return (
		<span className="meter-mark" aria-hidden="true">
			{[6, 12, 9, 16, 11, 7].map((height, index) => (
				<i key={String(index)} style={{ height }} />
			))}
		</span>
	);
}

type NodeState = "off" | "on" | "live";

// The signal chain: pipeline stages carrying their own state.
function ChainStrip(props: Record<"source" | "transcribe" | "style" | "export", NodeState>) {
	const nodes: Array<[string, NodeState]> = [
		["Source", props.source],
		["Transcribe", props.transcribe],
		["Style", props.style],
		["Export", props.export],
	];
	return (
		<div className="chain-strip">
			{nodes.map(([label, state], index) => (
				<Fragment key={label}>
					{index > 0 && <span className="chain-link" />}
					<span className={classNames("chain-node", state !== "off" && state)}>{label}</span>
				</Fragment>
			))}
		</div>
	);
}

function PreviewBackdrop() {
	return (
		<div className="demo-video" aria-label="Video preview">
			<div className="window-light one" /><div className="window-light two" />
			<div className="person"><div className="hair" /><div className="face" /><div className="shirt" /></div>
			<div className="desk" /><div className="plant"><i /><i /><i /></div>
		</div>
	);
}

function SafeArea() {
	return <><div className="safe-top"><span>Safe area</span></div><div className="safe-bottom"><span>TikTok controls</span></div></>;
}

function ProcessingOverlay() {
	return <div className="processing"><span className="spinner" />Creating word-level captions…</div>;
}
