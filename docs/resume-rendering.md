# Resume rendering

`packages/resume-renderer` generates canonical JSON, one-column semantic HTML, a selectable-text PDF, a tailoring diff, and validation report. Chromium renders A4 output; `pdf-lib` normalizes metadata to fixed values so identical inputs are reproducible.

The renderer avoids tables, floating columns, decorative images, and hidden text. Tests extract PDF text, compare hashes across repeated renders, and the release audit renders pages to PNG for visual inspection. Artifacts are stored privately with opaque IDs and SHA-256 hashes.
