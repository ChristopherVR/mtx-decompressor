/**
 * Interactive browser demo for `mtx-decompressor`.
 *
 * Lets the user drop in an `.eot` (Embedded OpenType) file, extracts the
 * embedded MTX-compressed font data, decompresses it with the library, and
 * then (a) reports input/output sizes + timing, (b) offers a `.ttf` download,
 * and (c) registers the recovered font via the FontFace API to render a live
 * sample pangram.
 *
 * Framework-free TypeScript — imported directly from the library source so the
 * demo always tracks the real, current public API.
 */

import { decompressMtx, parseEotMetadata, type EotMetadata } from '../src/index';

// The library now parses the EOT container itself (see `parseEotMetadata`),
// including the version-retry logic real-world files need — so the demo no
// longer carries its own tail-guessing heuristic.

// ---------------------------------------------------------------------------
// sfnt / version sniffing for the output font
// ---------------------------------------------------------------------------

/**
 * Read the leading sfnt version tag of a font binary and map it to a
 * human-readable label. Returns `undefined` if the buffer is too small.
 */
function describeSfntVersion(font: Uint8Array): string | undefined {
	if (font.length < 4) {
		return undefined;
	}
	const tag = (font[0] << 24) | (font[1] << 16) | (font[2] << 8) | font[3];
	switch (tag >>> 0) {
		case 0x00010000:
			return 'TrueType (0x00010000)';
		case 0x4f54544f:
			return 'OpenType/CFF ("OTTO")';
		case 0x74727565:
			return 'TrueType ("true")';
		case 0x74746366:
			return 'TrueType Collection ("ttcf")';
		default:
			return `unknown (0x${(tag >>> 0).toString(16).padStart(8, '0')})`;
	}
}

/** Read the U16 glyph count from the `maxp` table, if present. */
function readNumGlyphs(font: Uint8Array): number | undefined {
	if (font.length < 12) {
		return undefined;
	}
	const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
	const numTables = view.getUint16(4, false);
	let dirOffset = 12;
	for (let i = 0; i < numTables; i++) {
		if (dirOffset + 16 > font.length) {
			break;
		}
		const tag =
			String.fromCharCode(font[dirOffset]) +
			String.fromCharCode(font[dirOffset + 1]) +
			String.fromCharCode(font[dirOffset + 2]) +
			String.fromCharCode(font[dirOffset + 3]);
		if (tag === 'maxp') {
			const tableOffset = view.getUint32(dirOffset + 8, false);
			if (tableOffset + 6 <= font.length) {
				return view.getUint16(tableOffset + 4, false);
			}
		}
		dirOffset += 16;
	}
	return undefined;
}

// ---------------------------------------------------------------------------
// DOM helpers
// ---------------------------------------------------------------------------

function el<T extends HTMLElement>(id: string): T {
	const node = document.getElementById(id);
	if (!node) {
		throw new Error(`Missing DOM element #${id}`);
	}
	return node as T;
}

function formatBytes(n: number): string {
	if (n < 1024) {
		return `${n} B`;
	}
	if (n < 1024 * 1024) {
		return `${(n / 1024).toFixed(1)} KiB`;
	}
	return `${(n / (1024 * 1024)).toFixed(2)} MiB`;
}

// ---------------------------------------------------------------------------
// Demo wiring
// ---------------------------------------------------------------------------

const fileInput = el<HTMLInputElement>('file-input');
const dropZone = el<HTMLLabelElement>('drop-zone');
const statusBox = el<HTMLDivElement>('status');
const resultBox = el<HTMLDivElement>('result');
const metricsList = el<HTMLDListElement>('metrics');
const downloadBtn = el<HTMLAnchorElement>('download');
const sample = el<HTMLDivElement>('sample');

/** Track the last object URL so we can revoke it before creating a new one. */
let lastObjectUrl: string | undefined;
/** A counter to give each decompressed font a unique FontFace family name. */
let fontGeneration = 0;

function setStatus(message: string, kind: 'idle' | 'busy' | 'ok' | 'error'): void {
	statusBox.textContent = message;
	statusBox.dataset.kind = kind;
}

function showMetrics(rows: Array<[string, string]>): void {
	metricsList.replaceChildren();
	for (const [label, value] of rows) {
		const dt = document.createElement('dt');
		dt.textContent = label;
		const dd = document.createElement('dd');
		dd.textContent = value;
		metricsList.append(dt, dd);
	}
}

async function handleFile(file: File): Promise<void> {
	setStatus(`Reading "${file.name}"…`, 'busy');
	resultBox.hidden = true;

	let buffer: ArrayBuffer;
	try {
		buffer = await file.arrayBuffer();
	} catch (err) {
		setStatus(`Could not read the file: ${(err as Error).message}`, 'error');
		return;
	}

	// 1. Parse the EOT container header to locate the font blob and its flags.
	let meta: EotMetadata;
	try {
		meta = parseEotMetadata(new Uint8Array(buffer));
	} catch (err) {
		setStatus((err as Error).message, 'error');
		return;
	}
	const fontData = new Uint8Array(buffer, meta.fontDataOffset, meta.fontDataSize);

	// 2. Decompress with the library, timing the call.
	let ttf: Uint8Array;
	let elapsedMs: number;
	try {
		const t0 = performance.now();
		ttf = decompressMtx(fontData, {
			compressed: meta.compressed,
			encrypted: meta.encrypted,
		});
		elapsedMs = performance.now() - t0;
	} catch (err) {
		setStatus(`Decompression failed: ${(err as Error).message}`, 'error');
		return;
	}

	// 3. Report metrics.
	const ratio = ttf.length > 0 ? fontData.length / ttf.length : 0;
	const fontLabel = meta.fullName || meta.familyName || 'n/a';
	showMetrics([
		['Source file', `${file.name} (${formatBytes(buffer.byteLength)})`],
		['Font name', `${fontLabel} (EOT v${meta.version}${meta.badVersion ? ', corrected' : ''})`],
		['MTX blob (input)', formatBytes(fontData.length)],
		['TrueType (output)', formatBytes(ttf.length)],
		['Compression ratio', `${(ratio * 100).toFixed(1)}% of output`],
		['EOT flags', `compressed=${meta.compressed}, encrypted=${meta.encrypted}`],
		['sfnt version', describeSfntVersion(ttf) ?? 'n/a'],
		['Glyph count', readNumGlyphs(ttf)?.toString() ?? 'n/a'],
		['Decompress time', `${elapsedMs.toFixed(2)} ms`],
	]);

	// 4. Wire the download button (Blob → object URL).
	if (lastObjectUrl) {
		URL.revokeObjectURL(lastObjectUrl);
	}
	// Copy into a standalone ArrayBuffer so the Blob owns clean, exact bytes.
	const ttfCopy = ttf.slice();
	const blob = new Blob([ttfCopy], { type: 'font/ttf' });
	lastObjectUrl = URL.createObjectURL(blob);
	downloadBtn.href = lastObjectUrl;
	downloadBtn.download = file.name.replace(/\.eot$/i, '') + '.ttf';

	// 5. Register the recovered font and render a live sample.
	try {
		fontGeneration += 1;
		const family = `MtxDemoFont${fontGeneration}`;
		// FontFace wants an ArrayBuffer/-View; pass the copied bytes.
		const face = new FontFace(family, ttfCopy.buffer);
		await face.load();
		document.fonts.add(face);
		sample.style.fontFamily = `"${family}", serif`;
		setStatus(`Decompressed "${file.name}" — rendering recovered font below.`, 'ok');
	} catch {
		// The font bytes are still valid for download even if the browser
		// declines to render them (some recovered fonts lack a usable cmap).
		sample.style.fontFamily = 'serif';
		setStatus(
			`Decompressed "${file.name}". The browser could not render this font for preview, but the .ttf download is ready.`,
			'ok',
		);
	}

	resultBox.hidden = false;
}

// File picker
fileInput.addEventListener('change', () => {
	const file = fileInput.files?.[0];
	if (file) {
		void handleFile(file);
	}
});

// Drag & drop
['dragenter', 'dragover'].forEach((evt) => {
	dropZone.addEventListener(evt, (e) => {
		e.preventDefault();
		dropZone.dataset.dragging = 'true';
	});
});
['dragleave', 'drop'].forEach((evt) => {
	dropZone.addEventListener(evt, (e) => {
		e.preventDefault();
		delete dropZone.dataset.dragging;
	});
});
dropZone.addEventListener('drop', (e) => {
	const file = e.dataTransfer?.files?.[0];
	if (file) {
		void handleFile(file);
	}
});

setStatus('Choose an .eot file to begin.', 'idle');
