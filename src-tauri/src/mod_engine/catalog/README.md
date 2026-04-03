# Rule Catalog Notes

The Rust catalog remains split into:
- `triggers.json`
- `conditions.json`
- `effects.json`
- `common.json`

## Dynamic Option Sources (Balatro Utils)

Frontend hydration supports parameter-level option sourcing from `src/lib/balatro-utils.ts`.
Use this directly in `conditions.json` and `effects.json` so you do not need to hardcode option lists.

Add `optionSource` to any parameter in `conditions.json` or `effects.json`:

```json
{
  "id": "specific_rank",
  "type": "select",
  "label": "Rank",
  "optionSource": "ranks"
}
```

Supported `optionSource` values:
- `rarities`
- `consumableSets`
- `enhancements`
- `editions`
- `seals`
- `vouchers`
- `decks`
- `ranks`
- `suits`
- `pokerHands`
- `tags`
- `tarotCards`
- `planetCards`
- `spectralCards`
- `allConsumables`

## Why use optionSource?

- Keeps catalog definitions small and readable.
- Uses the same preset/custom registries as the rest of the app.
- Avoids stale hardcoded option arrays when content changes.
- Makes adding new conditions/effects/triggers simpler.

## Expanded Common Catalog Data

`common.json` now includes:
- `triggerGroups`
- `optionSources`

`triggerGroups` contains reusable trigger sets (for example `scoringTriggers`, `cardTriggers`, `economyTriggers`, `roundTriggers`, `specialTriggers`).

`optionSources` documents the canonical balatro-utils provider for each source key so JSON authors can stay consistent.

## Trigger Group Usage

Use `applicableTriggerGroups` in condition/effect definitions to avoid repeating long `applicableTriggers` arrays.

```json
{
  "id": "example_condition",
  "applicableTriggerGroups": ["genericTriggers", "economyTriggers"],
  "applicableTriggers": ["card_used"]
}
```

Rules:
- `applicableTriggerGroups` expands from `common.json` `triggerGroups`.
- `applicableTriggers` is optional and acts as explicit leftovers/overrides.
- Final trigger set is the union of both.
