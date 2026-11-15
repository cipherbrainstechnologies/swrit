# EditDNA in Dear Swritsinh

The **EditDNA** analyzer/applier/Resolve driver lives in the open-source [MEX-creator/easy-edit](https://github.com/MEX-creator/easy-edit) repository (Python CLI, local analysis, DaVinci Resolve scripting).

This web app provides a **private vault** for:

- **Style templates** — `schema_version: 1` JSON from `editdna analyze`
- **Edit plans (EDL)** — `edl_version: 1` JSON from `editdna apply`

Use **EditDNA** in the nav. Heavy analysis and Resolve builds still run on your workstation with the CLI; the vault stores, previews, downloads, and deletes artifacts in Postgres.

Railway deploys run `pnpm db:migrate`, which applies `drizzle/0004_editdna.sql`.