# Default identity fonts

These WOFF2 files are bundled locally so the default identity renders without an
external font request. CSS family aliases in `styles/brand.css` keep them separate
from the existing theme-specific Google Fonts families.

| Family            | Bundled files                                              | Source release   | License                          |
| ----------------- | ---------------------------------------------------------- | ---------------- | -------------------------------- |
| Newsreader        | Latin and extended Latin, normal and italic variable fonts | Google Fonts v26 | [OFL](OFL-Newsreader.txt)        |
| Plus Jakarta Sans | Latin and extended Latin variable fonts                    | Google Fonts v12 | [OFL](OFL-Plus-Jakarta-Sans.txt) |
| Tajawal           | Arabic, regular 400, medium 500 and bold 700               | Google Fonts v12 | [OFL](OFL-Tajawal.txt)           |
| Noto Naskh Arabic | Arabic variable font                                       | Google Fonts v44 | [OFL](OFL-Noto-Naskh-Arabic.txt) |

Downloaded from the official Google Fonts distribution on 15 October 2026.
Newsreader and Noto Naskh Arabic carry display text. Plus Jakarta Sans and Tajawal
carry working UI and data. Font weights exposed by the brand CSS are 400 to 700.
All faces use `font-display: swap`; Unicode ranges avoid fetching the Arabic or
extended Latin assets until matching glyphs appear.

Newsreader provides an open-source contemporary serif alternative to the Erato
Nova reference. No Erato Nova font or commercial license is bundled.

Upstream projects and copyright notices:

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

- [Newsreader](https://github.com/google/fonts/tree/main/ofl/newsreader)
- [Plus Jakarta Sans](https://github.com/google/fonts/tree/main/ofl/plusjakartasans)
- [Tajawal](https://github.com/google/fonts/tree/main/ofl/tajawal)
- [Noto Naskh Arabic](https://github.com/google/fonts/tree/main/ofl/notonaskharabic)
