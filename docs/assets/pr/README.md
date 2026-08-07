# PR review screenshots

Before/after captures produced during review of a specific pull request, kept so
the PR record stays readable after its working branch is gone.

These are historical review artifacts, not user documentation. They are not
regenerated, not consumed by the app or CI, and should not be edited — if a
later change makes a capture misleading, leave it and take fresh captures for
the new PR.

| Directory | PR |
| --- | --- |
| `155-theme-default-redesign/` | [#155](https://github.com/irodori-table/irodori-table/pull/155) — rebuild the default theme around the app icon's palette |
| `156-typography-layout/` | [#156](https://github.com/irodori-table/irodori-table/pull/156) — anchor the type scale on the menu, stop the top row squeezing |

Both sets previously lived on orphan branches (`assets/theme-default-redesign`,
`assets/typography-layout-shots`) that existed only to host the images for a PR
body. Because those branches were never merged, they survived every branch
cleanup and had to be kept alive purely so the embedded images would not break.
Absorbing them here removes that constraint. New PRs should attach screenshots
by dragging them into the PR body — GitHub then hosts them itself, and no branch
is needed.
