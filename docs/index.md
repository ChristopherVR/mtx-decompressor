---
layout: home

hero:
  name: mtx-decompressor
  text: MTX-compressed EOT to TrueType
  tagline: A TypeScript library with no runtime dependencies. Extracts standard .ttf fonts from MicroType Express data in the browser and in Node.js.
  actions:
    - theme: brand
      text: Get started
      link: /getting-started
    - theme: alt
      text: API reference
      link: /api
    - theme: alt
      text: GitHub
      link: https://github.com/ChristopherVR/mtx-decompressor

features:
  - title: EOT container parsing
    details: Reads the Embedded OpenType header, including files whose declared version disagrees with their layout, and applies the container's compression and XOR flags.
  - title: Full MTX decoding
    details: LZCOMP with adaptive Huffman coding, CTF reconstruction, and the hdmx and VDMX metric tables, assembled into a valid SFNT with recalculated checksums.
  - title: Browser and Node.js
    details: Works on plain Uint8Array data. Hand the result to the FontFace API or write it to disk.
---

## Live demo

Select or drop an `.eot` file. The font is extracted in your browser and is not uploaded anywhere.

<ClientOnly>
  <LiveDemo />
</ClientOnly>

## Example

```ts
import { eotToTtf } from 'mtx-decompressor';

const eotBytes = new Uint8Array(await file.arrayBuffer());
const ttf = eotToTtf(eotBytes); // Uint8Array containing a TrueType font
```

See [Getting started](./getting-started.md) for installation and [Usage](./usage.md) for more examples.
