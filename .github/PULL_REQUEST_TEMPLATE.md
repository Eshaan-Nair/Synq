## What does this PR do?

Brief description of the change and why it was made.

Fixes # (issue number, if applicable)

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] New platform support
- [ ] Documentation update
- [ ] Refactor / performance
- [ ] CI / tooling

## Testing

How did you verify this works?

- [ ] `npx tsc --noEmit` in `backend/` — 0 errors
- [ ] `cd backend && npm test` — all tests pass
- [ ] Manually saved a chat and verified chunks stored
- [ ] Manually triggered Auto-Connect and verified context injected
- [ ] Rebuilt extension and tested in Chrome

## Checklist

- [ ] `PLATFORM_SELECTORS.md` updated (if selectors changed)
- [ ] `CHANGELOG.md` entry added
- [ ] No new `console.log` — use `logger` utility in backend
- [ ] TypeScript strict — no new `any` without a comment
