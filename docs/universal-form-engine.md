# Universal form engine

`packages/universal-form-engine` maps semantic labels, names, autocomplete hints, input types, and select options to a canonical field ontology. It distinguishes deterministic standard fields from sensitive or ambiguous questions, fills only verified facts, and emits explicit skip/review reasons.

Each observed form step receives a stable fingerprint derived from destination, URL, step, and normalized field structure. An approval is valid only for the reviewed resume, answers, profile snapshot, and fingerprint; navigation or layout changes require re-inspection.
