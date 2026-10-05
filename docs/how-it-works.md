# How it works

The pipeline:

1. **EOT container parsing.** The little-endian header gives the font-data offset and flags.
2. **XOR decryption**, when the container declares it (key `0x50`).
3. **MTX header parsing.** The blob is split into three LZCOMP blocks.
4. **LZCOMP decompression.** Sliding-window LZ with adaptive Huffman coding.
5. **CTF parsing.** TrueType tables are rebuilt from the three Compact TrueType Font streams.
6. **SFNT assembly.** Table directory, alignment and checksums.

Reconstruction promotes short `loca` offsets to the long format when the expanded glyph data exceeds 131,070 bytes, and updates `head` accordingly. The assembled font has a sorted table directory and recalculated checksums.

The decoder reconstructs `hdmx` and `VDMX` metric tables, including their prediction-error encoding and raw fallback form. Malformed metric data throws `EotError` instead of silently omitting a table.

The metric encodings and XOR behaviour are documented in the [MTX](https://www.w3.org/submissions/MTX/) and [EOT](https://www.w3.org/submissions/EOT/) specifications.

## Provenance

A TypeScript port of the MTX decompression code from [libeot](https://github.com/umanwizard/libeot) by Brennan Vincent (MPL-2.0), which is based on the [MicroType Express specification](http://www.w3.org/Submission/MTX/) submitted to the W3C by Monotype Imaging.
