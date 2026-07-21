# Ponytail — Minimal Code Governance

**Purpose**: Enforce the Ponytail philosophy: remove before adding, 54% less code.
**Applies to**: Every code change in the monorepo.

## Philosophy

1. **No loops** — Prefer `map`, `filter`, `reduce`, `forEach`
2. **No nested ifs** — Prefer early returns, guard clauses
3. **No classes** — Prefer functions + plain objects
4. **No comments** — Self-documenting code only
5. **Remove before adding** — For every new line, remove two old ones

## Rules

| Rule | Violation | Fix |
|---|---|---|
| `no-loops` | `for`, `while`, `do...while` | Use array methods |
| `no-nested-ifs` | `if` inside another `if` | Extract to early return or function |
| `no-classes` | `class` keyword | Use factory functions |
| `no-comments` | `//`, `/* */` | Rename variables to be self-describing |
| `remove-before-add` | PR adds more lines than it removes | Reject until ratio >= 1:2 |

## Usage

```bash
npx ponytail check src/              # Check source files
npx ponytail check --fix src/        # Auto-fix where possible
npx ponytail diff main...HEAD         # Check diff before merge
```

## Hook Integration

```bashagas
npm run ponytail:check
```

Add to `.husky/pre-commit` or CI pipeline.
