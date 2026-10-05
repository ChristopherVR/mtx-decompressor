<script setup lang="ts">
/**
 * In-browser demo: pick or drop an .eot file, decompress it with the library,
 * show metrics, offer the .ttf as a download and preview text in the
 * recovered font.
 *
 * The library is imported from the repository source, so the docs build does
 * not depend on a published package.
 */
import { onBeforeUnmount, ref } from 'vue';
import { decompressMtx, parseEotMetadata } from '../../../../src/index';

type Tone = 'idle' | 'busy' | 'ok' | 'error';

const fileInput = ref<HTMLInputElement | null>(null);
const dragging = ref(false);
const status = ref('Select or drop an .eot file.');
const tone = ref<Tone>('idle');
const rows = ref<Array<[string, string]>>([]);
const downloadUrl = ref<string | null>(null);
const downloadName = ref('font.ttf');
const fontFamily = ref('serif');
const sampleText = ref('The quick brown fox jumps over the lazy dog 0123456789');
let generation = 0;

function setStatus(message: string, nextTone: Tone): void {
	status.value = message;
	tone.value = nextTone;
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

function revoke(): void {
	if (downloadUrl.value !== null) {
		URL.revokeObjectURL(downloadUrl.value);
		downloadUrl.value = null;
	}
}

function readNumGlyphs(font: Uint8Array): number | undefined {
	if (font.length < 12) {
		return undefined;
	}
	const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
	const numTables = view.getUint16(4, false);
	for (let i = 0, dir = 12; i < numTables && dir + 16 <= font.length; i++, dir += 16) {
		const tag = String.fromCharCode(font[dir], font[dir + 1], font[dir + 2], font[dir + 3]);
		if (tag === 'maxp') {
			const offset = view.getUint32(dir + 8, false);
			return offset + 6 <= font.length ? view.getUint16(offset + 4, false) : undefined;
		}
	}
	return undefined;
}

async function handleFile(file: File): Promise<void> {
	setStatus(`Reading "${file.name}"…`, 'busy');
	rows.value = [];
	revoke();
	try {
		const buffer = await file.arrayBuffer();
		const meta = parseEotMetadata(new Uint8Array(buffer));
		const fontData = new Uint8Array(buffer, meta.fontDataOffset, meta.fontDataSize);
		const t0 = performance.now();
		const ttf = decompressMtx(fontData, { compressed: meta.compressed, encrypted: meta.encrypted });
		const elapsed = performance.now() - t0;

		const copy = ttf.slice();
		downloadUrl.value = URL.createObjectURL(new Blob([copy], { type: 'font/ttf' }));
		downloadName.value = `${file.name.replace(/\.eot$/i, '')}.ttf`;
		rows.value = [
			['Source file', `${file.name} (${formatBytes(buffer.byteLength)})`],
			['Font name', `${meta.fullName || meta.familyName || 'n/a'} (EOT v${meta.version})`],
			['MTX blob (input)', formatBytes(fontData.length)],
			['TrueType (output)', formatBytes(ttf.length)],
			['MTX compression', meta.compressed ? 'Yes' : 'No'],
			['Font obfuscation', meta.encrypted ? 'XOR 0x50 (decoded)' : 'None declared'],
			['Embedding permission bits', `0x${meta.permissions.toString(16).padStart(4, '0')}`],
			['Glyph count', readNumGlyphs(ttf)?.toString() ?? 'n/a'],
			['Decompress time', `${elapsed.toFixed(2)} ms`],
		];

		try {
			generation += 1;
			const family = `MtxDemoFont${generation}`;
			const face = new FontFace(family, copy.buffer);
			await face.load();
			document.fonts.add(face);
			fontFamily.value = `"${family}", serif`;
			setStatus(`Decompressed "${file.name}" in ${elapsed.toFixed(1)} ms.`, 'ok');
		} catch {
			fontFamily.value = 'serif';
			setStatus(`Decompressed "${file.name}". The browser could not preview this font, but the download is ready.`, 'ok');
		}
	} catch (err) {
		setStatus(err instanceof Error ? err.message : String(err), 'error');
	}
}

function onFileChange(): void {
	const file = fileInput.value?.files?.[0];
	if (file !== undefined) {
		void handleFile(file);
	}
}

function onDrop(event: DragEvent): void {
	dragging.value = false;
	const file = event.dataTransfer?.files?.[0];
	if (file !== undefined) {
		void handleFile(file);
	}
}

onBeforeUnmount(revoke);
</script>

<template>
	<div class="live-demo">
		<div class="panel">
			<label
				class="drop-zone"
				:class="{ dragging }"
				@dragover.prevent="dragging = true"
				@dragleave="dragging = false"
				@drop.prevent="onDrop"
			>
				<span class="drop-title">Drop a file here or click to browse</span>
				<span class="drop-hint">.eot</span>
				<input ref="fileInput" type="file" accept=".eot" data-testid="file-input" @change="onFileChange" />
			</label>
			<p class="status" :data-tone="tone" role="status" data-testid="status">{{ status }}</p>
		</div>

		<div class="panel">
			<template v-if="rows.length > 0">
				<dl class="meta">
					<template v-for="[label, value] in rows" :key="label">
						<dt>{{ label }}</dt>
						<dd>{{ value }}</dd>
					</template>
				</dl>
				<div v-if="downloadUrl" class="actions">
					<a class="btn" :href="downloadUrl" :download="downloadName">Download .ttf</a>
				</div>
				<textarea v-model="sampleText" class="sample" :style="{ fontFamily }" rows="3" aria-label="Preview text" />
			</template>
			<span v-else class="placeholder">Font details and a preview appear here.</span>
		</div>
	</div>
</template>

<style scoped>
.live-demo {
	display: grid;
	grid-template-columns: 1fr 1fr;
	gap: 16px;
	margin: 16px 0;
}

@media (max-width: 720px) {
	.live-demo {
		grid-template-columns: 1fr;
	}
}

.panel {
	display: flex;
	flex-direction: column;
	gap: 12px;
	min-width: 0;
}

.drop-zone {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: 4px;
	min-height: 200px;
	padding: 16px;
	border: 1px dashed var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
	cursor: pointer;
	text-align: center;
	transition: border-color 0.2s;
}

.drop-zone:hover,
.drop-zone.dragging {
	border-color: var(--vp-c-brand-1);
}

.drop-zone input {
	display: none;
}

.drop-title {
	font-weight: 500;
	color: var(--vp-c-text-1);
}

.drop-hint,
.placeholder {
	font-size: 14px;
	color: var(--vp-c-text-2);
}

.placeholder {
	display: flex;
	align-items: center;
	justify-content: center;
	min-height: 200px;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
}

.btn {
	display: inline-block;
	padding: 0 16px;
	line-height: 36px;
	font-size: 14px;
	font-weight: 500;
	border: 1px solid var(--vp-button-brand-border);
	border-radius: 20px;
	color: var(--vp-button-brand-text);
	background: var(--vp-button-brand-bg);
	text-decoration: none;
	cursor: pointer;
}

.btn:hover {
	background: var(--vp-button-brand-hover-bg);
}

.vp-doc a.btn {
	color: var(--vp-button-brand-text);
	text-decoration: none;
}

.status {
	margin: 0;
	font-size: 14px;
	color: var(--vp-c-text-2);
}

.status[data-tone='ok'] {
	color: var(--vp-c-green-1);
}

.status[data-tone='error'] {
	color: var(--vp-c-danger-1);
}

.meta {
	display: grid;
	grid-template-columns: max-content 1fr;
	gap: 4px 12px;
	margin: 0;
	font-size: 14px;
}

.meta dt {
	color: var(--vp-c-text-2);
}

.meta dd {
	margin: 0;
	overflow-wrap: anywhere;
}

.actions {
	display: flex;
	gap: 8px;
	flex-wrap: wrap;
}

.sample {
	width: 100%;
	padding: 8px 12px;
	font-size: 24px;
	line-height: 1.4;
	border: 1px solid var(--vp-c-divider);
	border-radius: 8px;
	background: var(--vp-c-bg-soft);
	color: var(--vp-c-text-1);
	resize: vertical;
}
</style>
