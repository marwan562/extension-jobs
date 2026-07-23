# Connector SDK

`packages/connector-sdk` separates discovery from application:

- `JobSourceConnector` searches or imports jobs and returns normalized records with source provenance.
- `ApplicationDestinationConnector` inspects, safely fills, validates, and—only with an approved reviewed fingerprint—submits an application.

A connector declares an ID, version, and capabilities. Implementations must consult the site-policy registry, validate exact hosts, bound imported page data, reject unknown layouts, surface challenges, and never infer unsupported operations. Discovery source and application destination may differ for the same job.
