# ICD-11 Explorer

A fast, offline-capable browser for the complete **WHO ICD-11 MMS (release 2026-01)**: all 28 chapters,
37,052 entries (chapters, blocks and coded categories), with WHO's descriptions, inclusions,
exclusions, "coded elsewhere" notes and coding notes.

## Features

- **Clickable code tree on the left**: every chapter → block → category → subcategory, expandable.
- **Search** by code (`6A20`, `6C40.3`, `6A7`) or by title words (`panic`, `bipolar type II`).
  Tick **Search descriptions too** to search inside definitions, inclusions and notes as well.
- **Chapter 06 only** filter and quick links for psychosis, mood, anxiety, substance use,
  personality and neurocognitive disorders.
- Codes cited in exclusions / coded-elsewhere lists are links; code ranges jump to their block.
- Breadcrumbs, subcategory lists, copy-code buttons, and a link to each entry in the official WHO browser.
- Works on phones (the code list becomes a slide-out drawer) and in light or dark mode.
- Each entry has its own link, e.g. `index.html#6A20` or `index.html#6A70-1` (dots become dashes).

## Run it

No server or install needed: open `icd11/index.html` in any browser (double-click works, because the
data ships as plain `.js` files). It can also be served by any static host.

## Rebuilding the data for a new ICD-11 release

1. From the release files listed at <https://icd.who.int/browse/latestrelease/mms/en> download
   `SimpleTabulation-ICD-11-MMS-en.zip` and `print-ICD-11-MMS-en.zip`, and unzip both.
2. `pdftotext -layout ICD-11-MMS-en.pdf mms.txt`
3. `python3 tools/build_data.py SimpleTabulation-ICD-11-MMS-en.txt mms.txt data 2026-01`

The script takes codes, titles and hierarchy from the simple tabulation and matches each entry's text
from the print edition (37,051 of 37,052 entries matched for 2026-01).

## Scope and licence

ICD-11 © World Health Organization, licensed under
[CC BY-ND 3.0 IGO](https://creativecommons.org/licenses/by-nd/3.0/igo/). Text is reproduced without
modification (only PDF line breaks are joined), with ICD-11 codes and URIs kept. This app is not
endorsed by WHO.

The MMS gives each disorder's clinical description. For chapter 06, the detailed diagnostic
requirements (essential features, boundaries with normality and other disorders, course and severity
specifiers) are published separately by WHO as the *Clinical Descriptions and Diagnostic Requirements
for ICD-11 Mental, Behavioural or Neurodevelopmental Disorders* (CDDR, 2024), which this app does
not include.
