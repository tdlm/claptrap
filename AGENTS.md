# Agent guide

Project overview, layout, and commands live in [CLAUDE.md](CLAUDE.md). This file holds
the git conventions every contributor (human or agent) follows.

## Git conventions

### Commits

[Conventional Commits](https://www.conventionalcommits.org/). No ticket references.

```text
<type>(<scope>): <description>

- <what changed and why>
- <one bullet per distinct change>
```

- **Types:** `feat`, `fix`, `refactor`, `perf`, `style`, `docs`, `test`, `build`, `ci`,
  `chore`. `feat` and `fix` are for changes a user of the app notices; everything else
  is internal. `chore` is the fallback; reach for `build` or `docs` first when they fit.
- **Scopes:** optional, lowercase, named after the area touched. Common ones: `main`,
  `engine`, `capture`, `notes`, `settings`, `tray`, `ai`, `ipc`, `preload`, `renderer`,
  `shared`, `icons`, `prompt` (the build prompt in `docs/`). Use `/` for nesting
  (`renderer/settings`). Omit the scope when a change is broad.
- **Description:** imperative mood, lowercase start, no trailing period. Header at most
  100 characters.
- **Body:** a bullet list explaining what changed and why. Skip it when the subject says
  everything. Wrap at 100 characters.
- **Breaking changes:** `!` before the colon and a `BREAKING CHANGE:` footer.
- **One concern per commit.** If the subject needs "and", split the commit.
- **Never include** `Co-Authored-By`, "Generated with …", or other tool/agent
  attribution trailers, or commentary on how the commit was produced.
- Changes to `src/main/ai/prompts.ts` or requirements also update `docs/PROMPT.md` and
  `docs/PROMPT_CHANGELOG.md` (see CLAUDE.md); commit those together with the change.

### Branches

`main` is the default branch. Work on short-lived branches named
`<type>/<kebab-description>` (for example `feat/weekly-summary`), using the same types as
commits, with the whole ref under about 40 characters.

### Pull requests

The PR title uses the same `<type>(<scope>): <description>` form as a commit header.
