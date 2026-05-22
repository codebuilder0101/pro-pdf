# Type 1 Font Identification & PDF Embedding — Deliverable Report

**Client request:** identify the TrueType (CID) font embedded in `DUMMY.pdf`, find its PostScript Type 1 equivalent, provide either the matching Type 1 font files or a documented workflow to convert/embed as Type 1, and (optionally) deliver an updated PDF using Type 1.

---

## 1. Identification — the only TrueType CID font in the PDF

Inspecting the PDF's font catalog (the equivalent of Adobe Acrobat's **File → Properties → Fonts**):

| Object | Subtype | BaseFont | Embedded as |
|---|---|---|---|
| 6  | Type1 (CFF) | `AAAAAC+ConnectionsBold_CZEX0AA0` | FontFile3 / Type1C |
| 7  | Type1 (CFF) | `AAAAAD+ConnectionsBold_CZEX0AA0` | FontFile3 / Type1C |
| 9  | Type1 (CFF) | `AAAAAF+Connections_CZEX0A60` | FontFile3 / Type1C |
| 10 | Type1 (CFF) | `AAAAAG+Connections_CZEX0A60` | FontFile3 / Type1C |
| 12 | Type1 (CFF) | `AAAAAI+HigherStandards_CZEX0660` | FontFile3 / Type1C |
| 13 | Type1 (CFF) | `AAAAAJ+ITC_Franklin_Gothic_Book_CZEX0080` | FontFile3 / Type1C |
| 15 | Type1 (CFF) | `AAAAAL+ITC_Franklin_Gothic_Book_CZEX0080` | FontFile3 / Type1C |
| **17 / 44** | **Type0 → CIDFontType2** | **`AAAAAM+Connections`** | **FontFile2 / TrueType** ← THE PROBLEM |
| 20 | Type1 (CFF) | `AAAAAO+ConnectionsBold_CZEX0AA0` | FontFile3 / Type1C |
| 22 | Type1 (CFF) | `AAAAAQ+Connections_Medium_CZEX0A80` | FontFile3 / Type1C |
| 23 | Type1 (CFF) | `AAAAAR+Connections_Medium_CZEX0A80` | FontFile3 / Type1C |

**Finding:** every embedded font in the PDF is already PostScript Type 1 **except one** — object 17/44 (`AAAAAM+Connections`), which is embedded as a TrueType (CID) font via `FontFile2`. This is the single font that has to be replaced.

## 2. Matching the embedded font to the supplied TTFs

I extracted the raw embedded font from PDF object 48 (8 052 bytes) and compared its internal metadata against each of the three TTFs you provided.

| Property | Embedded font (obj 48) | `ConnectionsRegular.ttf` | `Connections_Medium.ttf` | `ConnectionsBold.ttf` |
|---|---|---|---|---|
| Family name | `Connections` (subset prefix `LBJFHW+`) | **`Connections`** | `Connections_Medium` | `ConnectionsBold` |
| Subfamily | **`Regular`** | **`Regular`** | `Medium` | `Bold` |
| Copyright | Parachute® 2013, Bank of America | **identical** | — | — |
| numGlyphs | **231** | **231** | 52 | 59 |
| unitsPerEm | 1000 | **1000** | 1000 | 1000 |
| Ascent / Descent | 931 / −264 | **931 / −264** | 722 / −217 | 773 / −219 |
| Bounding box | (−47, −244, 962, 923) | **identical** | (−49, −217, 881, 722) | (−51, −219, 816, 773) |
| capHeight | 685 | **685** | undefined | undefined |
| xHeight | 488 | **488** | undefined | undefined |

> ### ✅ The embedded font is **`ConnectionsRegular.ttf`** (an unmodified subset of it).
> The other two TTFs (`Connections_Medium`, `ConnectionsBold`) are different fonts entirely — different families, different metrics, far fewer glyphs.

The font was originally designed in **2013 by Parachute® exclusively for Bank of America** (see the copyright notice). There is no publicly distributed PostScript Type 1 version of this proprietary font — so the Type 1 form has to be *produced* from `ConnectionsRegular.ttf`.

## 3. Converting `ConnectionsRegular.ttf` → PostScript Type 1

I converted the TrueType file into every PostScript Type 1 form a client could reasonably need:

| File | Format | What it is | Where it is used |
|---|---|---|---|
| `Connections-Regular.cff` | Raw CFF | Compact Font Format — the binary "Type 1C" font program the PDF embeds via `FontFile3` | Inside PDFs (what Acrobat reports as "Type 1") |
| `Connections-Regular.otf` | OpenType (CFF) | OpenType wrapper around the CFF | Installable on Windows / macOS / Linux; usable from any modern app |
| `Connections-Regular.pfa` | Classic Type 1 ASCII | Adobe Type 1, eexec-encrypted, ASCII-hex encoded | Legacy PostScript workflows, Ghostscript, traditional prepress |
| `Connections-Regular.pfb` | Classic Type 1 binary | Same font, binary segments (smaller) | Windows Type 1 installer, classic DTP |
| `Connections-Regular.afm` | Adobe Font Metrics | Companion width / bbox metrics | Required by some legacy apps alongside `.pfb`/`.pfa` |

All five files contain **the same 231 glyphs** with the **same metrics** as the original `ConnectionsRegular.ttf`, just expressed using PostScript outlines (cubic Bézier) instead of TrueType outlines (quadratic Bézier).

## 4. Embedding the Type 1 font in the PDF

The accompanying file **`DUMMY-Type1.pdf`** is the original PDF, byte-for-byte equivalent visually, with the TrueType CID `Connections` font **replaced by its Type 1 (CFF / "Type1C") equivalent**.

What changed at the PDF object level:

| Object | Before | After |
|---|---|---|
| 17 (font dict) | `/Type /Font /Subtype /Type0 /Encoding /Identity-H /DescendantFonts [44 0 R]` | `/Type /Font /Subtype /Type1 /Encoding << /Differences [ ... ] >> /FirstChar 0 /LastChar 230 /Widths [ ... ]` |
| 44 (CID descendant) | `/CIDFontType2`, points to `/FontFile2` | **dropped** (no longer needed) |
| 47 (FontDescriptor) | `/FontFile2 48 0 R` (TrueType) | `/FontFile3 48 0 R` (CFF) |
| 48 (font program) | TrueType binary (`Length1 8052`) | **CFF binary** (`Subtype /Type1C`), all 231 glyphs |
| 45 (ToUnicode CMap) | 2-byte codespace `<0000><FFFF>` | 1-byte codespace `<00><FF>` |
| 3 (content stream) | `/G1 1 Tf <00440045004A0048>` (4-hex-digit CIDs) | `/G1 1 Tf <44454A48>` (2-hex-digit codes) |

The rest of the PDF — page content, images, all other fonts, layout, colors — is untouched.

### Side-by-side verification

Rendered with MuPDF (the same library used by many PDF previewers):

* `render_original.png` — the original PDF
* `render_type1.png`    — the rebuilt PDF
* `comparison.png`      — both side by side

The two pages render **pixel-identical**.

### Acrobat-style font properties — Before vs After

```
Before (DUMMY.pdf, “Connections”):
  Type:               Type 0 (composite)
  Encoding:           Identity-H
  Actual font:        Embedded subset
  Type of descendant: CIDFontType2 (TrueType)            ← this is the issue
  Font file:          FontFile2 (TrueType binary)

After (DUMMY-Type1.pdf, “Connections”):
  Type:               Type 1                              ← now Type 1
  Encoding:           Custom
  Actual font:        Embedded
  Font file:          FontFile3, Subtype Type1C (CFF — Adobe Type 1 Compact)
```

Open the rebuilt PDF in Adobe Acrobat → **File → Properties → Fonts**: every embedded font, including `Connections`, is now listed as **"Type 1 (Embedded Subset)"** with **"Actual Font Type: Type 1"**.

### Bonus: improved text accessibility

The original PDF's `Connections` font carried only a partial ToUnicode CMap (it mapped roughly 10 codes). As a result, when text was selected or copied from the original PDF, large portions came out garbled — e.g. `'$6 //&` instead of `DAS LLC`, or `%egLQQLQg EaOaQFe oQ $SULO 1 ` instead of `Beginning balance on April 1, 2026`.

Because the rebuilt PDF re-encodes the same font using a `/Differences` array that names every glyph by its standard PostScript name (`A`, `B`, `…`, `a`, `b`, `…`, `space`, `dollar`, …), PDF readers can now reverse-map glyphs to Unicode automatically. **Text in the rebuilt PDF copies cleanly out of Acrobat / any PDF reader.**

---

## 5. Documented workflow — how this was done

The conversion is reproducible. The complete workflow:

### Stage 1 — identify the CID font inside the PDF

1. Open the PDF in Adobe Acrobat Pro → **File → Properties → Fonts**, *or* run:
   ```
   pdffonts DUMMY.pdf
   ```
2. Look for a font whose *type* is `CID TrueType` or `Type 0 / CIDFontType2`.
   In this PDF, that's the single entry `AAAAAM+Connections`.

### Stage 2 — match it to one of the TTFs

For each of the three supplied TTFs, read the internal name/metrics:

```
fc-scan ConnectionsRegular.ttf      # Linux
# or, on Windows: double-click the .ttf and read "Font family" + "Style"
```

Compare:
* family name (ignore the `XXXXXX+` subset prefix the PDF adds)
* subfamily (Regular / Medium / Bold)
* number of glyphs
* ascent / descent / bbox / capHeight / xHeight

The font in the PDF is **Connections Regular** → matches `ConnectionsRegular.ttf`.

### Stage 3 — produce the PostScript Type 1 form

Best (free) tool: **FontForge**.

```
fontforge -lang=ff -c '
  Open($1);
  Generate($2, "", 0);
' ConnectionsRegular.ttf Connections-Regular.pfb
```

This writes `Connections-Regular.pfb` (binary Type 1) and `Connections-Regular.afm` (metrics).
For ASCII Type 1 (`.pfa`) substitute the output filename's extension; for CFF/OpenType-CFF substitute `.otf`.

Commercial alternatives: **FontLab 8**, **Glyphs 3** — same path: *File → Open → File → Generate Font → choose "PostScript Type 1 (Binary)" / "PostScript Type 1 (ASCII)" / "OpenType-CFF"*.

**License note:** Because this font was commissioned by Bank of America from Parachute®, you should treat redistribution of any converted Type 1 file the same way you'd treat the original TTF. The conversion is mechanical reformatting of the outlines you already have — it doesn't create a new licensable work — but distribution permissions are governed by the original license.

### Stage 4 — embed the Type 1 font into the PDF

**Option A — regenerate the PDF from the source document.** If you still have the InDesign / Word / source file:
1. Install the new Type 1 `Connections` font on the system.
2. Open the source layout.
3. In the font picker, select the Type 1 `Connections` (the .pfb you installed).
4. Export to PDF with **"Embed all fonts" / "Subset embed"** turned on.
5. Verify via Acrobat → File → Properties → Fonts.

**Option B — patch the PDF directly (what was done here).**
Use a prepress tool that can substitute embedded font streams:
* **callas pdfToolbox** — define a *Font Substitution Profile*: replace embedded `Connections` (TrueType) with embedded `Connections` (Type 1), preserving encoding.
* **Enfocus PitStop Pro** — *Global Change → Embed Font as Type 1*.
* **Adobe Acrobat Preflight** — limited; can re-embed but not always re-format.

The `DUMMY-Type1.pdf` deliverable in this package implements exactly Option B: every TrueType CID stream in the original PDF was replaced by the matching CFF (Type 1C) stream and the parent font dictionary was rewritten from `Type0 / CIDFontType2` to a simple `Type1`.

### Stage 5 — verify

```
pdffonts DUMMY-Type1.pdf
```

Expected output: every line under the *type* column reads `Type 1` or `Type 1C`. None reads `CID TrueType` or `TrueType`.

In Acrobat: **File → Properties → Fonts** — every entry shows **Type 1** as actual font type.

---

## 6. Package contents

| File | Purpose |
|---|---|
| `DUMMY-Type1.pdf` | **The corrected PDF.** Visually identical to the original; every font now Type 1. |
| `DUMMY.pdf` | Original (untouched, for reference). |
| `ConnectionsRegular.ttf` | Original TTF (the one that matched). |
| `ConnectionsBold.ttf`, `Connections_Medium.ttf` | Original TTFs (NOT matches — different fonts). |
| `Connections-Regular.otf` | Converted font, OpenType (CFF) format — installable on any modern OS. |
| `Connections-Regular.cff` | Converted font, raw CFF (Type 1C) — the bytes embedded in the PDF. |
| `Connections-Regular.pfa` | Converted font, classic Type 1 ASCII format. |
| `Connections-Regular.pfb` | Converted font, classic Type 1 binary format. |
| `Connections-Regular.afm` | Adobe Font Metrics companion for the .pfa / .pfb. |
| `render_original.png` | Page 1 of the original PDF, rendered to PNG. |
| `render_type1.png` | Page 1 of the rebuilt PDF, rendered to PNG — visually identical. |
| `comparison.png` | Side-by-side, both renders. |
| `DELIVERABLE_REPORT.md` | This document. |

---

## 7. Summary for the client

1. **Identification:** the TrueType (CID) font inside `DUMMY.pdf` is **Connections Regular** by Parachute® (2013, commissioned by Bank of America). It corresponds **exactly** to your supplied **`ConnectionsRegular.ttf`**. The other two TTFs (`Connections_Medium`, `ConnectionsBold`) are unrelated.

2. **Type 1 equivalent:** there is no third-party Type 1 release of this proprietary font. Its Type 1 form has been generated from your TTF and is provided in every standard Type 1 format: **`.cff` (PDF-embeddable Type 1C), `.otf` (OpenType-CFF, installable), `.pfa` and `.pfb` (classic Type 1), plus the matching `.afm`**.

3. **Embedded result:** the accompanying **`DUMMY-Type1.pdf`** replaces the TrueType CID embedding with the Type 1 CFF embedding. Open it in Acrobat → File → Properties → Fonts: **every font now reports as Type 1**. Visual output is pixel-identical to the original, and text extraction / copy-paste now works correctly (it was partially broken in the original).

4. **Workflow:** Section 5 documents the full process so the conversion can be reproduced in-house for other PDFs (Acrobat Pro / `pdffonts` → FontForge or FontLab → re-export or substitute via pdfToolbox / PitStop Pro).
