import { describe, expect, it } from 'vitest';
import { EotError, EotErrorCode, toEotError } from './errors';
import { parseEotMetadata } from './eot';
import { decompressMtx } from './mtx-decompress';
import { Stream } from './stream';

describe('hardening', () => {
	it('rejects fontDataSize larger than totalSize', () => {
		const b = new Uint8Array(32);
		new DataView(b.buffer).setUint32(0, 16, true);
		new DataView(b.buffer).setUint32(4, 1000, true);
		expect(() => parseEotMetadata(b)).toThrow(EotError);
	});

	it('wraps non-EotError exceptions with a cause', () => {
		const e = toEotError(new RangeError('boom'));
		expect(e).toBeInstanceOf(EotError);
		expect(e.code).toBe(EotErrorCode.CorruptFile);
		expect(e.cause).toBeInstanceOf(RangeError);
	});

	it('only throws EotError on garbage compressed input', () => {
		const junk = new Uint8Array(64).map((_, i) => (i * 37) & 0xff);
		expect(() => decompressMtx(junk)).toThrow(EotError);
	});

	it('warns on non-sfnt uncompressed passthrough', () => {
		const warnings: string[] = [];
		decompressMtx(new Uint8Array([1, 2, 3, 4]), { compressed: false, onWarn: (m) => warnings.push(m) });
		expect(warnings).toHaveLength(1);
	});

	it('grows stream reservations geometrically', () => {
		const s = new Stream(null, 0);
		s.reserve(10);
		s.reserve(11);
		expect(s.reserved).toBeGreaterThanOrEqual(20);
	});
});

describe('maxOutputBytes', () => {
	it('rejects a font larger than the cap', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { eotToTtf } = await import('./eot');
		const eot = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'real', 'glyphicons-3.3.7.eot')));
		expect(() => eotToTtf(eot, { maxOutputBytes: 1000 })).toThrow(/maxOutputBytes/);
		expect(eotToTtf(eot, { maxOutputBytes: 1_000_000 }).length).toBeGreaterThan(1000);
	});
});

describe('input types', () => {
	it('accepts ArrayBuffer, DataView and Blob', async () => {
		const { readFileSync } = await import('node:fs');
		const { join } = await import('node:path');
		const { eotToTtf, eotToTtfAsync } = await import('./eot');
		const raw = new Uint8Array(readFileSync(join(__dirname, '__fixtures__', 'real', 'fontawesome-3.2.1.eot')));
		const want = eotToTtf(raw);
		const ab = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
		expect(eotToTtf(ab)).toEqual(want);
		expect(eotToTtf(new DataView(ab))).toEqual(want);
		expect(await eotToTtfAsync(new Blob([raw]))).toEqual(want);
	});
});
