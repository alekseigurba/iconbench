# Fonts

Self-hosted Poppins for the chrome, copied from
[domain-map](https://github.com/alekseigurba/domain-map). Nothing here is picked
by default — `app/css/tokens.css` chooses through `--font-heading` and
`--font-text`, and a weight is only downloaded by the browser once the page
uses it.

| Family | Files | Axis |
| --- | --- | --- |
| Poppins | `poppins-{300,400,600}-*.woff2` | static — no variable cut exists |

It ships two subsets, `latin` and `latin-ext`. The `unicode-range` in
[`../css/fonts.css`](../css/fonts.css) keeps `latin-ext` off the wire until a
page actually needs an accented character.

Poppins comes from Google Fonts under the SIL Open Font License 1.1; the
upstream license text is in [`licenses/`](licenses/).
