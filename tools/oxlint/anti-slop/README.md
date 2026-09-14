# Vendored anti-slop rules

Selected rules copied from `dmmulroy/anti-slop` at revision
`c44ef22ca116d0ba62a3ff663a0bd13a3f3fa40b` under the MIT license.

Only the rules enabled in `oxlint.config.ts` are vendored. The safety-comment rule
starts as a warning so existing assertions remain visible without blocking lint;
new or touched assertions should include a specific `SAFETY:` justification.
