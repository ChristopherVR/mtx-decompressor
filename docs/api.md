# API

## `eotToTtf(eotBytes, options?)`

Parses a raw EOT container and returns the reconstructed TrueType binary. Throws `EotError` on a corrupt or truncated container.

| Option   | Type                        | Description                          |
| -------- | --------------------------- | ------------------------------------ |
| `onWarn` | `(message: string) => void` | Called for each non-fatal diagnostic |

## `inspectEotProtection(eotBytes)`

Inspects protection metadata without decompressing the font. Returns `encryption` (`'none'` or `'xor-0x50'`), `passwordProtection` (`'not_supported_by_eot'`), `embeddingPermissions` (the raw `fsType` bits) and `rootString` (URL restrictions).

## `parseEotMetadata(eotBytes)`

Parses the EOT header and returns an `EotMetadata` object: `version`, `flags`, `compressed`, `encrypted`, `familyName`, `styleName`, `versionName`, `fullName`, `fontDataOffset`, `fontDataSize`, `permissions` and more. Files whose declared version disagrees with their layout are recovered and flagged with `badVersion` instead of throwing. Throws `EotError` on corrupt input.

## `canLegallyEdit(metadata)`

Takes an `EotMetadata` and returns whether the `fsType` embedding permissions allow editing.

## `decompressMtx(fontData, options?)`

Decompresses an MTX-compressed font into a TrueType binary.

| Parameter            | Type                         | Description                                                                   |
| -------------------- | ---------------------------- | ----------------------------------------------------------------------------- |
| `fontData`           | `Uint8Array`                 | Raw font bytes (MTX-compressed, optionally encrypted)                         |
| `options.encrypted`  | `boolean` (default: `false`) | XOR-decrypt with key `0x50` before decompression                              |
| `options.compressed` | `boolean` (default: `true`)  | If `false`, skip decompression and return the (possibly decrypted) data as-is |
| `options.onWarn`     | `(message: string) => void`  | Called for each non-fatal diagnostic; the font is still produced              |
| **Returns**          | `Uint8Array`                 | A TrueType (.ttf) font binary                                                 |

## `decompressEotFont(fontData, compressed, encrypted)`

Wrapper around `decompressMtx` that takes explicit boolean parameters.

## `unpackMtx(data, size)`

Low level: unpacks an MTX blob into three LZCOMP-decompressed streams. Returns `{ streams: Uint8Array[], sizes: number[] }`.

## Types and errors

`SFNTContainer` and `SFNTTable` describe the reconstructed font tables. `EotError` and `EotErrorCode` provide error handling by code.
