The layout primitives in `layout/` originate from the MUI Treasury registry:
https://github.com/siriwatknp/mui-treasury/tree/1ee6192dc49e73aa194b7d70dfdd7c7bbc84612b/apps/website/registry/layout/layout-core

Only `Root`, `Content`, and their shared class names are included. The
`Breakpoint` imports were changed to type-only imports for this project's
TypeScript configuration, and the files were formatted with Prettier.

`theme/` is based on the MUI Treasury Primitive documentation theme at the
same revision:
https://github.com/siriwatknp/mui-treasury/tree/1ee6192dc49e73aa194b7d70dfdd7c7bbc84612b/apps/website/registry/themes/mui-treasury

The unused MUI X overrides are omitted. Type-only imports and the provider
export were adjusted for this project's TypeScript and React configuration.
The light background, sidebar, text and divider colors are adapted for WrtKit.
The table container border is omitted for the flat workspace layout; other
component styles and palette colors are retained.
