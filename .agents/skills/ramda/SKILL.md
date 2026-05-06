---
name: ramda
description: Guidance for using Ramda in transformation-heavy TypeScript or JavaScript. Use when editing data pipelines, collection/object transformations, reducers, selectors, or parser code that can benefit from Ramda operators.
---

# Ramda Skill

Use this skill when editing transformation-heavy TypeScript or JavaScript in this repo.

## Principles

- Prefer Ramda when it makes data transformations more declarative and easier to scan.
- Avoid point-free code that hides types, branching, errors, or important domain names.
- Prefer `R.pipe` for readable left-to-right transformations when it avoids noisy intermediate variables.
- Plain loops are acceptable for complex branching, early exits, async control flow, or hot paths where Ramda obscures intent.
- Prefer a single `reduce` over `filter` plus `map` when one pass remains clear.

## Preferred Operators

- Selection and shape: `pick`, `pickBy`, `omit`, `props`, `path`, `pathOr`, `assoc`, `assocPath`, `evolve`.
- Combining and merging: `mergeLeft`, `mergeRight`, `mergeDeepRight`, `union`, `intersection`, `difference`, `symmetricDifference`.
- Collections: `groupBy`, `countBy`, `uniq`, `range`, `indexBy`, `partition`, `sortBy`, `ascend`, `descend`.
- Predicates: `any`, `all`, `anyPass`, `allPass`, `propEq`, `pathEq`, `includes`.
- String/list transforms: `split`, `splitAt`, `splitEvery`, `join`.
- Fan-out and composition: `juxt`, `applySpec`, `converge`, `pipe`.
- Object utilities: `invert`, `invertObj`, `toPairs`, `fromPairs`, `mapObjIndexed`.

## Type Discipline

- Keep `undefined` and `null` separate. Do not use `R.isNil` when absent and explicitly-null states need different behavior.
- Prefer typed helper functions at transformation boundaries so component and reducer code does not need casts.
- Reuse domain/API types when the transformation preserves the same shape.

## Review Checklist

- Is the transformation clearer than the equivalent plain TypeScript?
- Are all intermediate domain concepts still named when naming helps understanding?
- Does the code preserve `undefined` versus `null` semantics when that distinction matters?
