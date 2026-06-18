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

import { decompressMtx } from '../src/index';

// ---------------------------------------------------------------------------
// EOT container parsing (demo-side helper)
// ---------------------------------------------------------------------------
//
// IMPORTANT: the `mtx-decompressor` library operates on the *MTX font blob*
// that lives inside an EOT container — it does not parse the EOT header
// itself. To make this demo accept a real `.eot` file, we parse the minimal
// EOT header here (in the demo, not the library) to locate the embedded font
// bytes and read the compression/encryption flags.
//
// EOT layout (little-endian, see the W3C EOT submission / Microsoft spec):
//   offset 0 : EOTSize        U32  total file size in bytes
//   offset 4 : FontDataSize   U32  size of the embedded font data block
//   offset 8 : Version        U32
//   offset 12: Flags          U32  (TTEMBED_* bit flags)
//   ...       variable-length metadata fields (family name, etc.)
//   end      : FontData       FontDataSize bytes at (EOTSize - FontDataSize)

/** Flag bit: the embedded font data is MTX-compressed. */
const TTEMBED_TTCOMPRESSED = 0x00000004;
/** Flag bit: the embedded font data is XOR-obfuscated (key 0x50). */
const TTEMBED_XORENCRYPTDATA = 0x10000000;

interface EotFont {
	/** Raw MTX font blob extracted from the tail of the EOT file. */
	fontData: Uint8Array;
	/** Whether the blob is MTX-compressed (per EOT flags). */
	compressed: boolean;
	/** Whether the blob is XOR-encrypted (per EOT flags). */
	encrypted: boolean;
}

/**
 * Parse an EOT container and return the embedded font blob plus its
 * compression/encryption flags. Throws with a readable message on malformed
 * input.
 */
function parseEot(buffer: ArrayBuffer): EotFont {
	if (buffer.byteLength < 16) {
		throw new Error('File too small to be a valid EOT container (need at least 16 bytes).');
	}

	const view = new DataView(buffer);
	const eotSize = view.getUint32(0, true);
	const fontDataSize = view.getUint32(4, true);
	const flags = view.getUint32(12, true);

	if (fontDataSize === 0 || fontDataSize > buffer.byteLength) {
		throw new Error(
			`EOT FontDataSize (${fontDataSize}) is out of range for a ${buffer.byteLength}-byte file. This may not be an EOT file.`,
		);
	}

	// The font data sits at the tail of the file. Prefer EOTSize when it is
	// consistent with the actual byte length; otherwise fall back to the real
	// length so we still locate the trailing blob.
	const total = eotSize === buffer.byteLength ? eotSize : buffer.byteLength;
	const start = total - fontDataSize;
	if (start < 16) {
		throw new Error('EOT font-data offset overlaps the header — file appears malformed.');
	}

	const fontData = new Uint8Array(buffer, start, fontDataSize);
	return {
		fontData,
		compressed: (flags & TTEMBED_TTCOMPRESSED) !== 0,
		encrypted: (flags & TTEMBED_XORENCRYPTDATA) !== 0,
	};
}

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

	// 1. Locate the embedded font blob inside the EOT container.
	let eot: EotFont;
	try {
		eot = parseEot(buffer);
	} catch (err) {
		setStatus((err as Error).message, 'error');
		return;
	}

	// 2. Decompress with the library, timing the call.
	let ttf: Uint8Array;
	let elapsedMs: number;
	try {
		const t0 = performance.now();
		ttf = decompressMtx(eot.fontData, {
			compressed: eot.compressed,
			encrypted: eot.encrypted,
		});
		elapsedMs = performance.now() - t0;
	} catch (err) {
		setStatus(`Decompression failed: ${(err as Error).message}`, 'error');
		return;
	}

	// 3. Report metrics.
	const ratio = ttf.length > 0 ? eot.fontData.length / ttf.length : 0;
	showMetrics([
		['Source file', `${file.name} (${formatBytes(buffer.byteLength)})`],
		['MTX blob (input)', formatBytes(eot.fontData.length)],
		['TrueType (output)', formatBytes(ttf.length)],
		['Compression ratio', `${(ratio * 100).toFixed(1)}% of output`],
		['EOT flags', `compressed=${eot.compressed}, encrypted=${eot.encrypted}`],
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
