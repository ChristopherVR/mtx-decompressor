# Usage

## Whole file

```ts
import { eotToTtf } from 'mtx-decompressor';

const ttf = eotToTtf(eotBytes, { onWarn: (message) => console.warn(message) });
```

`onWarn` receives diagnostics for recovered header-version mismatches and other non-fatal problems.

## Lower-level API

Parse the container yourself when you need the metadata or want to slice the font data:

```ts
import { decompressMtx, parseEotMetadata } from 'mtx-decompressor';

const meta = parseEotMetadata(eotBytes);
const fontData = eotBytes.subarray(meta.fontDataOffset, meta.fontDataOffset + meta.fontDataSize);
const ttf = decompressMtx(fontData, { compressed: meta.compressed, encrypted: meta.encrypted });
```

## Inspecting protection

```ts
import { canLegallyEdit, inspectEotProtection, parseEotMetadata } from 'mtx-decompressor';

const info = inspectEotProtection(eotBytes);
// { encryption: 'none' | 'xor-0x50', passwordProtection: 'not_supported_by_eot', embeddingPermissions, rootString }

const editable = canLegallyEdit(parseEotMetadata(eotBytes));
```

EOT specifies fixed-key XOR obfuscation, which `eotToTtf` removes automatically. It has no password-based encryption. A password on an enclosing Office document or archive must be handled before extracting the EOT. Embedding permission bits and URL restrictions are separate from encryption.

## Using the font in a browser

```ts
const ttf = eotToTtf(eotBytes);
const face = new FontFace('Recovered', ttf.slice().buffer);
await face.load();
document.fonts.add(face);
```
