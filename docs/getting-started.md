# Getting started

mtx-decompressor decompresses **MicroType Express (MTX)** font data found inside **EOT** (Embedded OpenType) containers and returns a standard **TrueType (.ttf)** font.

MTX is a font compression format developed by Monotype. EOT files that use it are common in older web pages and in Microsoft Office documents.

## Installation

::: code-group

```sh [npm]
npm install mtx-decompressor
```

```sh [pnpm]
pnpm add mtx-decompressor
```

```sh [yarn]
yarn add mtx-decompressor
```

```sh [bun]
bun add mtx-decompressor
```

:::

The package has no dependencies and works in the browser and in Node.js.

## Quick start

```ts
import { eotToTtf } from 'mtx-decompressor';

const eotBytes: Uint8Array = /* the raw bytes of a .eot file */;
const ttfBytes = eotToTtf(eotBytes);
```

`eotToTtf` parses the EOT header, locates the embedded font data, and applies the container's own compression and encryption flags.

## Error handling

Errors are thrown as `EotError` with a machine-readable `code` (see `EotErrorCode`), so corrupt, truncated and unsupported input can be told apart.

```ts
import { EotError, eotToTtf } from 'mtx-decompressor';

try {
	eotToTtf(bytes);
} catch (err) {
	if (err instanceof EotError) {
		console.error(err.code, err.message);
	}
}
```
