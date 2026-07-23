# Resume import

`packages/resume-importers` accepts PDF, DOCX, Markdown, text, JSON, and YAML. It resolves real paths, rejects symlinks and unsupported signatures, limits byte size, verifies content signatures independently of file extensions, and copies source bytes into a private artifact vault.

PDF and DOCX text extraction use `pdf-parse` and `mammoth`. Structured and text formats become provenance-rich candidate facts. Import does not mark facts approved; inspect and approve them explicitly with the CLI.
