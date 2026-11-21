# Preview flags

Flags are URL query parameters, read once from `location.search` by `src/flags.ts`. With no parameters every
flag is off and the page is the accepted build. A flag is on only for the exact value `1`.

| URL | v9 (Main Bazaar arcade) | ux1 (controls guide) |
|---|---|---|
| (none) | off | off |
| `?v9=1` | on | off |
| `?ux1=1` | off | on |
| `?lab=1` | on | on |
| `?lab=1&v9=0` | off | on |
| `?lab=1&ux1=0` | on | off |

## Precedence

1. An explicit `v9=` or `ux1=` always decides that flag: `1` is on, anything else (`0`, `true`, empty) is off.
2. Otherwise `?lab=1` turns the flag on.
3. Otherwise the flag is off.

`?lab=1` is the integrated-preview switch. It covers only `v9` and `ux1`. Flags that are not listed in
`LAB_FLAGS` (`src/flags.ts`) are never enabled by it and keep their own behaviour, including any flag from a branch
that is not merged here. Omitting a flag means it is off, never a hidden default.

`v9Enabled()` and `ux1Enabled(search)` keep their names and call sites and delegate to the registry.
`setV9(null)` also clears the registry cache, so tests can change `location.search` and re-read it.

Rollback: revert the A5 commit; the two original one-line parsers return.
