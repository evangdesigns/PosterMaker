// ControlsPanel component for reuse (desktop and mobile) — defined at top level to avoid remounting on every keystroke
function ControlsPanel({ setBgDataUrl, dateText, setDateText, slots, setNameForSlot, startCropForSlot, downloadDataUrl, sanitizeFilename, exportJPG, setCoordForSlot }) {
	return (
		<div onMouseDown={stop} onFocus={stop} onKeyDown={stop}>
			<h1 className='text-2xl font-bold mb-2' style={{ color: "#FDD100" }}>
				Flash Laughs – Poster Maker
			</h1>

			<div className='space-y-3'>
				<FilePick label='Background' onPick={async (f) => setBgDataUrl(await readFileAsDataURL(f))} />
				<div className='flex items-center gap-2'>
					<span className='text-sm text-gray-400 w-28'>Show Date</span>
					<Input type='date' value={dateText} onChange={(e) => setDateText(e.target.value)} />
				</div>
			</div>

			<div className='mt-4 space-y-6'>
				{slots.map((s, i) => (
					<div key={s.id} className='border border-neutral-800 rounded-2xl p-3'>
						<div className='grid grid-cols-1 gap-2'>
							<div className='text-md' style={{ color: "#FDD100" }}>
								{s.label ? s.label.toUpperCase() : ""}
							</div>
							{/* Name first, required before image */}
							<div className='flex items-center gap-2'>
								<span className='text-sm text-gray-400 w-28'>Name</span>
								<Input name={`${s.id}-name`} value={s.name} onChange={(e) => setNameForSlot(i, e.target.value)} placeholder={`${s.label} Name`} />
							</div>
							<FilePick label='Headshot' onPick={(f) => startCropForSlot(i, f)} disabled={!s.name?.trim()} />
							{!s.name?.trim() && <div className='text-xs text-red-300'>Enter the comic’s name before choosing an image.</div>}
							{s.img && (
								<div className='flex justify-end'>
									<button
										onMouseDown={stop}
										onFocus={stop}
										onKeyDown={stop}
										className='px-3 py-1 rounded-lg bg-yellow-400 text-black text-sm font-semibold hover:bg-yellow-300'
										onClick={() => downloadDataUrl(s.img, `${sanitizeFilename(s.name)}.png`)}>
										Download Cutout PNG
									</button>
								</div>
							)}
							<details className='text-sm text-gray-400'>
								<summary>Advanced position</summary>
								<div className='grid grid-cols-3 gap-2 mt-2'>
									<Input type='number' value={s.x} onChange={(e) => setCoordForSlot(i, "x", parseInt(e.target.value || 0, 10))} placeholder='x' />
									<Input type='number' value={s.y} onChange={(e) => setCoordForSlot(i, "y", parseInt(e.target.value || 0, 10))} placeholder='y' />
									<Input type='number' value={s.size} onChange={(e) => setCoordForSlot(i, "size", parseInt(e.target.value || 0, 10))} placeholder='size' />
								</div>
							</details>
						</div>
					</div>
				))}
			</div>

			<div className='flex gap-3 pt-4'>
				<Button onMouseDown={stop} onFocus={stop} onKeyDown={stop} onClick={exportJPG} className='bg-yellow-400 text-black hover:bg-yellow-300 font-semibold rounded-2xl px-4'>
					Export JPG
				</Button>
			</div>
		</div>
	);
}
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Stage, Layer, Image as KonvaImage, Rect, Text, Group } from "react-konva";
import dayjs from "dayjs";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import Cropper from "cropperjs";

import defaultBg from "@/assets/Laughs-On-The-Rocks_poster.jpg";

const REMOVE_BG_PROXY = import.meta.env.VITE_REMOVEBG_PROXY || "/api/removebg";

// Lightweight image loader for Konva
function useHTMLImage(src) {
	const [image, setImage] = useState(null);
	useEffect(() => {
		if (!src) return setImage(null);
		const img = new window.Image();
		img.crossOrigin = "anonymous";
		img.onload = () => setImage(img);
		img.src = src;
	}, [src]);
	return image;
}

function stop(e) {
	e.stopPropagation();
}

function CroppedImage({ src, width, height, x = 0, y = 0 }) {
	const img = useHTMLImage(src);
	if (!img) return null;
	return <KonvaImage image={img} x={x} y={y} width={width} height={height} />;
}

function FilePick({ label, accept = "image/*", onPick, disabled = false }) {
	return (
		<div className='flex items-center gap-2'>
			<span className='text-sm text-gray-400 w-28'>{label}</span>
			<Input
				type='file'
				accept={accept}
				disabled={disabled}
				onMouseDown={stop}
				onFocus={stop}
				onKeyDown={stop}
				onChange={(e) => {
					const f = e.target.files?.[0];
					if (f) onPick(f);
				}}
			/>
		</div>
	);
}

// Inline Cropper modal for 1:1 headshot cropping
function CropModal({ open, src, onCancel, onConfirm, title = "Crop Headshot" }) {
	const imgRef = useRef(null);
	const cropperRef = useRef(null);

	useEffect(() => {
		if (!open) return;
		// Wait a tick for image element to mount
		const t = setTimeout(() => {
			if (!imgRef.current) return;
			// Destroy any previous instance
			if (cropperRef.current) {
				cropperRef.current.destroy();
				cropperRef.current = null;
			}
			cropperRef.current = new Cropper(imgRef.current, {
				viewMode: 1,
				aspectRatio: 1,
				dragMode: "move",
				autoCropArea: 1,
				responsive: true,
				background: false,
				guides: true,
				modal: true,
				zoomOnWheel: true,
				movable: true,
				scalable: false,
				rotatable: false,
				cropBoxResizable: true,
				cropBoxMovable: true,
				center: true,
				highlight: false,
			});
		}, 0);
		return () => {
			clearTimeout(t);
			if (cropperRef.current) {
				cropperRef.current.destroy();
				cropperRef.current = null;
			}
		};
	}, [open, src]);

	if (!open) return null;

	const handleConfirm = () => {
		if (!cropperRef.current) return;
		// Export a square; higher than slot size so it looks crisp when scaled
		const canvas = cropperRef.current.getCroppedCanvas({ width: 1024, height: 1024, imageSmoothingQuality: "high", fillColor: "rgba(0,0,0,0)" });
		const dataUrl = canvas.toDataURL("image/png");
		onConfirm(dataUrl);
	};

	return (
		<div className='fixed inset-0 z-[9999] flex items-center justify-center'>
			<div className='absolute inset-0 bg-black/70' onClick={onCancel} />
			<div className='relative bg-neutral-900 border border-neutral-800 rounded-xl shadow-2xl w-[min(92vw,900px)] max-h-[90vh] overflow-hidden'>
				<div className='flex items-center justify-between px-4 py-3 border-b border-neutral-800'>
					<h2 className='text-white text-base font-semibold'>{title}</h2>
					<button onClick={onCancel} className='text-gray-300 hover:text-white'>
						✕
					</button>
				</div>
				<div className='p-3'>
					<div className='w-full h-[60vh] min-h-[360px] overflow-hidden rounded-md'>
						<img ref={imgRef} src={src} alt='Crop' className='max-w-full block' />
					</div>
					<div className='flex gap-3 justify-end pt-3'>
						<button onClick={onCancel} className='px-4 py-2 rounded-lg border border-neutral-700 text-gray-200 hover:bg-neutral-800'>
							Cancel
						</button>
						<button onClick={handleConfirm} className='px-4 py-2 rounded-lg bg-yellow-400 text-black font-semibold hover:bg-yellow-300'>
							Use Crop
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

function readFileAsDataURL(file) {
	return new Promise((resolve) => {
		const r = new FileReader();
		r.onload = () => resolve(r.result);
		r.readAsDataURL(file);
	});
}

// Helper to check if an image file has transparency on its border (alpha < 255)
async function fileHasTransparency(file) {
	// Quick out: only PNGs/WebP typically carry alpha
	if (!/png|webp/i.test(file.type)) return false;

	const dataUrl = await readFileAsDataURL(file);
	const img = await new Promise((resolve, reject) => {
		const el = new Image();
		el.onload = () => resolve(el);
		el.onerror = reject;
		el.src = dataUrl;
	});

	// downscale for faster check
	const maxW = 128;
	const scale = Math.min(1, maxW / img.width);
	const w = Math.max(1, Math.round(img.width * scale));
	const h = Math.max(1, Math.round(img.height * scale));
	const canvas = document.createElement("canvas");
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	ctx.drawImage(img, 0, 0, w, h);
	const { data } = ctx.getImageData(0, 0, w, h);

	// Sample border pixels
	const border = 2;
	for (let y = 0; y < h; y++) {
		for (let x of [0, 1, w - 1, w - 2]) {
			const i = (y * w + x) * 4 + 3;
			if (data[i] < 255) return true;
		}
	}
	for (let x = 0; x < w; x++) {
		for (let y of [0, 1, h - 1, h - 2]) {
			const i = (y * w + x) * 4 + 3;
			if (data[i] < 255) return true;
		}
	}
	return false;
}

async function blobToDataURL(blob) {
	return new Promise((resolve) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result);
		reader.readAsDataURL(blob);
	});
}

function sanitizeFilename(name) {
	return (name || "headshot")
		.trim()
		.replace(/\.[a-z0-9]+$/i, "")
		.replace(/[^\w\-]+/g, "_")
		.slice(0, 60);
}
function downloadDataUrl(dataUrl, filename) {
	const a = document.createElement("a");
	a.href = dataUrl;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}

async function removeBackgroundFromFile(file, opts = { size: "auto", format: "png" }) {
	const form = new FormData();
	form.append("image_file", file);
	form.append("size", opts.size);
	form.append("format", opts.format);

	const res = await fetch(REMOVE_BG_PROXY, {
		method: "POST",
		body: form,
	});

	if (!res.ok) {
		let errText = "";
		try {
			errText = await res.text();
		} catch {}
		throw new Error(`[proxy ${res.status}] ${errText || "Unknown error"}`);
	}

	const blob = await res.blob();
	return await blobToDataURL(blob); // transparent PNG data URL
}

const CANVAS_W = 1080; // preview canvas size (9:16)
const CANVAS_H = 1920;
const EXPORT_PIXEL_RATIO = 2; // exports 2160x3840

const defaultSlots = [
	{ id: "headliner", label: "Headliner", name: "", x: 97, y: 536, size: 212 },
	{ id: "feature", label: "Feature", name: "", x: 345, y: 530, size: 194 },
	{ id: "flop", label: "Flop", name: "", x: 571, y: 531, size: 194 },
	{ id: "opener", label: "Opener", name: "", x: 796, y: 531, size: 194 },
	{ id: "host", label: "Host", name: "", x: 121, y: 915, size: 165 },
];

export default function PosterMaker() {
	const [bgDataUrl, setBgDataUrl] = useState(defaultBg);
	const [dateText, setDateText] = useState(dayjs().format("YYYY-MM-DD"));

	const [slots, setSlots] = useState(defaultSlots.map((s) => ({ ...s, img: "", name: s.name })));

	// Cropper modal state
	const [cropState, setCropState] = useState({ open: false, src: "", target: { index: null } });

	// Busy overlay
	const [busy, setBusy] = useState({ open: false, message: "" });

	const startCropForSlot = async (idx, file) => {
		try {
			setBusy({ open: true, message: "Checking image..." });
			let processedUrl;
			if (await fileHasTransparency(file)) {
				processedUrl = await readFileAsDataURL(file);
			} else {
				setBusy({ open: true, message: "Removing background..." });
				try {
					processedUrl = await removeBackgroundFromFile(file);
				} catch (e) {
					console.warn("Background removal failed, using original image:", e);
					processedUrl = await readFileAsDataURL(file);
				}
			}
			setCropState({ open: true, src: processedUrl, target: { index: idx } });
		} finally {
			setBusy({ open: false, message: "" });
		}
	};

	const cancelCrop = () => setCropState({ open: false, src: "", target: { index: null } });

	const confirmCrop = (dataUrl) => {
		if (cropState.target.index != null) {
			const next = [...slots];
			next[cropState.target.index].img = dataUrl;
			setSlots(next);
		}
		cancelCrop();
	};

	const stageRef = useRef(null);

	const bgImage = useHTMLImage(bgDataUrl);

	const ASPECT = CANVAS_H / CANVAS_W;
	const previewRef = useRef(null);
	const [stageSize, setStageSize] = useState({ w: CANVAS_W, h: CANVAS_H });
	const [drawerOpen, setDrawerOpen] = useState(false);

	const scale = stageSize.w / CANVAS_W;

	useEffect(() => {
		const update = () => {
			const el = previewRef.current;
			if (!el) return;
			const w = Math.max(320, el.clientWidth); // fit available width
			setStageSize({ w, h: Math.round(w * ASPECT) });
		};
		update();
		window.addEventListener("resize", update);
		return () => window.removeEventListener("resize", update);
	}, []);
	const addImageToSlot = async (idx, file) => {
		const url = await readFileAsDataURL(file);
		const next = [...slots];
		next[idx].img = url;
		setSlots(next);
	};
	const setNameForSlot = (idx, val) => {
		const next = [...slots];
		next[idx].name = val;
		setSlots(next);
	};
	const setCoordForSlot = (idx, field, val) => {
		const next = [...slots];
		next[idx][field] = val;
		setSlots(next);
	};

	const exportJPG = () => {
		// Ensure export is at full design resolution regardless of preview scale
		const pixelRatio = (CANVAS_W * EXPORT_PIXEL_RATIO) / stageSize.w; // = EXPORT_PIXEL_RATIO / scale
		const uri = stageRef.current.toDataURL({
			mimeType: "image/jpeg",
			pixelRatio,
			quality: 0.95,
		});
		const a = document.createElement("a");
		a.href = uri;
		a.download = `LOTR_${dayjs(dateText).format("YYYY-MM-DD")}.jpg`;
		a.click();
	};

	return (
		<div className='min-h-screen w-full bg-neutral-950 text-white'>
			{/* Mobile Hamburger */}
			<div className='lg:hidden fixed top-3 left-3 z-[10000]'>
				<button aria-label='Open controls' onClick={() => setDrawerOpen(true)} className='p-2 rounded-md border border-neutral-800 bg-neutral-900/70 backdrop-blur hover:bg-neutral-800'>
					{/* simple hamburger icon */}
					<div className='w-6 h-0.5 bg-white mb-1'></div>
					<div className='w-6 h-0.5 bg-white mb-1'></div>
					<div className='w-6 h-0.5 bg-white'></div>
				</button>
			</div>
			<div className='max-w-7xl mx-auto p-6 grid grid-cols-1 lg:grid-cols-5 gap-6'>
				{/* Controls (desktop) */}
				<Card className='hidden lg:block lg:col-span-2 bg-neutral-900 border-neutral-800'>
					<CardContent className='p-4 space-y-4'>
						<ControlsPanel
							setBgDataUrl={setBgDataUrl}
							dateText={dateText}
							setDateText={setDateText}
							slots={slots}
							setNameForSlot={setNameForSlot}
							startCropForSlot={startCropForSlot}
							downloadDataUrl={downloadDataUrl}
							sanitizeFilename={sanitizeFilename}
							exportJPG={exportJPG}
							setCoordForSlot={setCoordForSlot}
						/>
					</CardContent>
				</Card>

				{/* Preview / Canvas */}
				<Card className='lg:col-span-3 bg-neutral-900 border-neutral-800 overflow-hidden'>
					<CardContent className='p-0'>
						<div ref={previewRef} className='w-full flex items-start justify-center p-4 bg-neutral-900'>
							<Stage ref={stageRef} width={stageSize.w} height={stageSize.h} className='rounded-2xl shadow-2xl'>
								<Layer scaleX={scale} scaleY={scale}>
									{/* Background */}
									{bgImage ? <KonvaImage image={bgImage} width={CANVAS_W} height={CANVAS_H} /> : <Rect x={0} y={0} width={CANVAS_W} height={CANVAS_H} fill='#1a1a1a' />}

									{/* Date (centered near top) */}
									<Text text={dayjs(dateText).format("MMM DD YYYY")} x={0} y={420} width={CANVAS_W} align='center' fontStyle='bold' fontSize={50} fill='#ffffff' shadowColor='#000' shadowBlur={8} />

									{/* Comic slots */}
									{slots.map((s, i) => (
										<Group key={s.id} x={s.x} y={s.y}>
											{/* Image clip square */}
											<Group clip={{ x: 0, y: 0, width: s.size, height: s.size }}>
												<Rect width={s.size} height={s.size} fill='#fdfbcc' />
												<CroppedImage src={s.img} x={0} y={0} width={s.size} height={s.size} />
											</Group>
											{/* Name (auto split on \n) */}
											<Text text={s.name ? s.name.toUpperCase() : ""} y={s.size + 12} width={s.size} align='center' fontSize={s.id === "headliner" ? 32 : 28} fill='#ffffff' lineHeight={1.05} />
										</Group>
									))}
								</Layer>
							</Stage>
						</div>
					</CardContent>
				</Card>
			</div>
			{/* Mobile Drawer for Controls */}
			<div className={`lg:hidden fixed inset-0 z-[9999] transition-opacity ${drawerOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none"}`} onClick={() => setDrawerOpen(false)}>
				<div className='absolute inset-0 bg-black/60'></div>
				<div
					className={`absolute top-0 left-0 h-full w-[88%] max-w-[420px] bg-neutral-900 border-r border-neutral-800 shadow-2xl transition-transform duration-300 ${
						drawerOpen ? "translate-x-0" : "-translate-x-full"
					}`}
					onClick={(e) => e.stopPropagation()}>
					<div className='flex items-center justify-between px-4 py-3 border-b border-neutral-800'>
						<div className='font-semibold' style={{ color: "#FDD100" }}>
							Controls
						</div>
						<button aria-label='Close controls' onClick={() => setDrawerOpen(false)} className='p-2 rounded-md border border-neutral-800 hover:bg-neutral-800'>
							✕
						</button>
					</div>
					<div className='p-4 space-y-4 overflow-y-auto h-[calc(100%-56px)]'>
						<ControlsPanel
							setBgDataUrl={setBgDataUrl}
							dateText={dateText}
							setDateText={setDateText}
							slots={slots}
							setNameForSlot={setNameForSlot}
							startCropForSlot={startCropForSlot}
							downloadDataUrl={downloadDataUrl}
							sanitizeFilename={sanitizeFilename}
							exportJPG={() => {
								exportJPG();
								setDrawerOpen(false);
							}}
							setCoordForSlot={setCoordForSlot}
						/>
					</div>
				</div>
			</div>
			{/* Busy overlay */}
			{busy.open && (
				<div className='fixed inset-0 z-[9998] flex items-center justify-center bg-black/60'>
					<div className='px-4 py-3 rounded-lg bg-neutral-900 border border-neutral-700 text-white'>{busy.message || "Working..."}</div>
				</div>
			)}
			{/* Cropper Modal */}
			<CropModal open={cropState.open} src={cropState.src} onCancel={cancelCrop} onConfirm={confirmCrop} title='Crop Headshot (1:1)' />
		</div>
	);
}
