# Default identity fonts

These WOFF2 files are bundled locally so the default identity renders without an
external font request. CSS family aliases in `styles/brand.css` keep them separate
from the existing theme-specific Google Fonts families.

| Family            | Bundled files                                              | Source release   | License                          |
| ----------------- | ---------------------------------------------------------- | ---------------- | -------------------------------- |
| Commissioner      | Latin and extended Latin, normal variable fonts            | Google Fonts v24 | [OFL](OFL-Commissioner.txt)      |
| Newsreader        | Latin and extended Latin, normal and italic variable fonts | Google Fonts v26 | [OFL](OFL-Newsreader.txt)        |
| Plus Jakarta Sans | Latin and extended Latin variable fonts                    | Google Fonts v12 | [OFL](OFL-Plus-Jakarta-Sans.txt) |
| Tajawal           | Arabic, regular 400, medium 500 and bold 700               | Google Fonts v12 | [OFL](OFL-Tajawal.txt)           |
| Noto Naskh Arabic | Arabic variable font                                       | Google Fonts v44 | [OFL](OFL-Noto-Naskh-Arabic.txt) |

Commissioner was downloaded from the official Google Fonts distribution on
18 October 2026. The other families were downloaded on 15 October 2026.
Commissioner carries the default Latin headlines, working UI and data; Tajawal
carries the Arabic UI. Newsreader remains available for selective serif accents.
The older font assets are retained for existing uses. Font weights exposed by
the brand CSS are 400 to 700.
All faces use `font-display: swap`; Unicode ranges avoid fetching the Arabic or
extended Latin assets until matching glyphs appear.

Newsreader provides an open-source contemporary serif alternative to the Erato
Nova reference. No Erato Nova font or commercial license is bundled.

Upstream projects and copyright notices:

- [Commissioner, Kostas Bartsokas](https://github.com/kosbarts/Commissioner).
  Copyright 2019 The Commissioner Project Authors.
- [Newsreader, Production Type](https://github.com/productiontype/Newsreader).
  Copyright 2020 The Newsreader Project Authors.
- [Plus Jakarta Sans, Tokotype](https://github.com/tokotype/PlusJakartaSans).
  Copyright 2020 The Plus Jakarta Sans Project Authors.
- [Tajawal, Boutros Fonts](https://github.com/googlefonts/tajawal).
  Copyright 2018 Boutros International.
- [Noto Arabic](https://github.com/notofonts/arabic).
  Copyright 2022 The Noto Project Authors.

Complete license and copyright text is retained in the corresponding `OFL-*.txt`
files. Assets are unmodified font binaries from `fonts.gstatic.com`.

Official metadata:

- [Commissioner](https://github.com/google/fonts/tree/main/ofl/commissioner)
- [Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader)
- [Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans)
- [Tajawal](https://github.com/google/fonts/tree/main/ofl/tajawal)
- [Noto Naskh Arabic](https://github.com/google/fonts/tree/main/ofl/notonaskharabic)

## Commissioner distribution

The normal variable WOFF2 files are unmodified Google Fonts v24 binaries requested
with `family=Commissioner:wght@400..700&display=swap`. The distribution leaves the
slant, flair and volume axes at their normal defaults. Google Fonts metadata
identifies upstream commit `7f7dc8e9ed7ffeb3f7a91261f2b9549436ab3d02`.

- [Family specimen](https://fonts.google.com/specimen/Commissioner)
- [Official metadata](https://raw.githubusercontent.com/google/fonts/main/ofl/commissioner/METADATA.pb)
- [Latin binary](https://fonts.gstatic.com/s/commissioner/v24/tDbw2o2WnlgI0FNDgduEk4jAhwgumbU1SVfU5BD8OuRL8OstC6KOhgvBYWSFJ-Mgdrgiju6fF8m0akXa.woff2)
- [Extended Latin binary](https://fonts.gstatic.com/s/commissioner/v24/tDbw2o2WnlgI0FNDgduEk4jAhwgumbU1SVfU5BD8OuRL8OstC6KOhgvBYWSFJ-Mgdrgiju6fF8m0ZEXaexs.woff2)

| File                           |  Bytes | SHA-256                                                            |
| ------------------------------ | -----: | ------------------------------------------------------------------ |
| `commissioner-latin.woff2`     | 36,700 | `e3d539b926881fbb3592788297eee24d6d179c1c06dbad36805fc722775247ce` |
| `commissioner-latin-ext.woff2` | 30,988 | `bd6c9bcd8fddfa16facc4398d075d0dfdf1286fc08334b94e8ea0c94beb1e0ff` |
