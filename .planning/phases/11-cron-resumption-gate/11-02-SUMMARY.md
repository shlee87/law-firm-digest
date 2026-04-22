---
phase: 11-cron-resumption-gate
plan: 02
status: complete
completed: 2026-04-21
---

# Plan 11-02 Summary: Thawte CA Fix + shin-kim Re-enabled

## What was done

**Task 1 (autonomous):**
- Fetched the Thawte TLS RSA CA G1 intermediate cert from `http://cacerts.thawte.com/ThawteTLSRSACAG1.crt` (AIA URL embedded in shinkim.com's leaf cert). Server sends only 1 cert in ServerHello — intermediate genuinely missing.
- Embedded the PEM (CN=Thawte TLS RSA CA G1, issuer=DigiCert Global Root G2, expires Nov 2, 2027) in `.github/workflows/daily.yml` via a new write step before `run_pipeline`.
- Added `NODE_EXTRA_CA_CERTS: /tmp/thawte-tls-rsa-ca-g1.pem` to the `run_pipeline` step's env block.
- Flipped `shin-kim` → `enabled: true` in `config/firms.yaml`.
- Updated loader tests: `DISABLED_FIRM_ID` sentinel changed from `shin-kim` to a non-existent ID (all 13 firms now enabled). 448 tests passing.

**Task 2 (human smoke test — checkpoint passed 2026-04-21):**
- `pnpm check:firm bkl` → 9 items, 9/9 bodies enriched ✅
- `pnpm check:firm kim-chang` → 5 items, 5/5 bodies enriched ✅
- `pnpm check:firm shin-kim` (with `NODE_EXTRA_CA_CERTS` set locally) → 10 items, 10/10 bodies enriched ✅

All three previously-disabled firms confirmed working. RESUME-01 precondition met.

## Deviations

None from the plan. PEM was embedded directly in the workflow (not fetched at runtime), as recommended. The placeholder PEM in the plan was replaced with the actual cert.

## State after this plan

- All 13 firms enabled in `config/firms.yaml`
- `daily.yml` has Thawte intermediate write step + `NODE_EXTRA_CA_CERTS`
- 448 tests passing, `tsc --noEmit` clean
- Commit: `e2db1bb`
