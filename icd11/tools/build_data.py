#!/usr/bin/env python3
"""Build the ICD-11 Explorer data files from WHO's official release files.

Inputs (download from https://icd.who.int/browse/latestrelease/mms/en -> "Info" / release files):
  * SimpleTabulation-ICD-11-MMS-en.txt   (from SimpleTabulation-ICD-11-MMS-en.zip)
  * ICD-11-MMS-en.txt                    (pdftotext -layout ICD-11-MMS-en.pdf, from print-ICD-11-MMS-en.zip)

Usage:
  python3 build_data.py <SimpleTabulation.txt> <mms_layout.txt> <out_dir> <release-label>

Outputs (plain JS so the app also works when opened directly from disk via file://):
  out_dir/index.js       -> window.ICD_INDEX = {...}   (all entities: code, title, parent, kind)
  out_dir/ch-XX.js       -> ICD_LOAD_CHAPTER("XX", {...})  (descriptions, inclusions, exclusions ...)

ICD-11 is (c) World Health Organization, licensed CC BY-ND 3.0 IGO. Text is copied verbatim
(only PDF line-wrapping is undone); codes and URIs are preserved as required by the licence.
"""
import csv
import json
import os
import re
import sys

csv.field_size_limit(10_000_000)

DASHES = str.maketrans({"\u200b": "", "\u2018": "'", "\u2019": "'", "‑": "-", "‐": "-", "–": "-", "—": "-", " ": " "})
PAGE_FURNITURE = re.compile(r"^\s*(\d+\s+ICD-11 MMS|ICD-11 MMS\s+\d+)\s*$")
LABELS = ["Inclusions", "Exclusions", "Coded Elsewhere", "Coding Note", "Note", "Additional information"]
LABEL_RE = re.compile(r"^\s*(" + "|".join(re.escape(l) for l in LABELS) + r"):\s*(.*)$")
CODE_REF = re.compile(r"\(([0-9A-Z]{2,4}(?:\.[0-9A-Z]{1,4})?(?:\s*-\s*[0-9A-Z]{2,4}(?:\.[0-9A-Z]{1,4})?)?)\)\s*$")


def norm(s):
    return re.sub(r"\s+", " ", s.translate(DASHES)).strip().lower()


def read_tabulation(path):
    entities = []
    with open(path, encoding="utf-8-sig") as f:
        reader = csv.reader(f, delimiter="\t")
        header = next(reader)
        col = {name.strip(): i for i, name in enumerate(header)}
        for row in reader:
            if not row or len(row) < 10:
                continue
            g = lambda k: row[col[k]].strip() if col.get(k) is not None and col[k] < len(row) else ""
            raw_title = g("Title").strip('"')
            depth = len(re.match(r"^(-\s)*", raw_title).group(0)) // 2
            title = re.sub(r"^(-\s)+", "", raw_title).replace("\u200b", "").strip()
            kind = g("ClassKind")
            code = g("Code")
            block = g("BlockId")
            chap = g("ChapterNo")
            lin = g("Linearization URI")
            m = re.search(r"/mms/(\d+(?:/(?:other|unspecified))?)$", lin)
            if kind == "chapter":
                key = "CH" + chap
            else:  # uncoded groupings (mostly in chapters V and X) get a key from their URI
                key = code or block or ("U" + (m.group(1) if m else str(len(entities))).replace("/", "-"))
            entities.append({
                "key": key, "code": code, "title": title, "kind": kind, "chapter": chap,
                "foundation": g("Foundation URI"), "parentF": g("Parent"),
                "residual": g("IsResidual") == "True", "leaf": g("isLeaf") == "True",
                "lid": m.group(1) if m else "", "depth": depth,
            })
    # The "- - " prefix in each title gives its depth in the tree; the parent is the nearest
    # preceding entity one level up. (Foundation URIs are not unique per position.)
    stack = []
    for e in entities:
        d = 0 if e["kind"] == "chapter" else e["depth"]
        del stack[d:]
        e["parent"] = stack[-1]["key"] if stack else ""
        stack.append(e)
    return entities


def header_matcher(e):
    t = norm(e["title"])
    if e["kind"] == "chapter":
        target = "chapter " + e["chapter"].lstrip("0").rjust(2, "0") if e["chapter"].isdigit() else "chapter " + e["chapter"].lower()
        return lambda line: norm(line) == target
    if e["kind"] == "block":
        prefix = t[:40]
        return lambda line: (len(line) - len(line.lstrip())) <= 1 and norm(line).startswith(prefix)
    code = e["code"]
    rx = re.compile(r"^\s{0,8}" + re.escape(code) + r"\s+(.*)$")
    prefix = t[:18]

    def match(line):
        m = rx.match(line)
        return bool(m) and norm(m.group(1)).startswith(prefix)
    return match


def join_lines(lines):
    out = ""
    for ln in lines:
        ln = ln.strip()
        if not ln:
            continue
        if not out:
            out = ln
        elif out.endswith("-") and not out.endswith(" -") and re.search(r"[A-Za-z]-$", out):
            out += ln  # keep the hyphen of hyphenated compounds ("self-" + "injury")
        else:
            out += " " + ln
    return out


def split_paragraphs(lines):
    paras, cur = [], []
    for ln in lines:
        s = ln.strip()
        if not s:
            if cur:
                paras.append(join_lines(cur)); cur = []
            continue
        if s.startswith("•") or re.match(r"^[a-z]\)\s", s) or re.match(r"^\d+\.\s", s):
            if cur:
                paras.append(join_lines(cur)); cur = []
        cur.append(s)
    if cur:
        paras.append(join_lines(cur))
    return [p for p in paras if p]


def split_items(lines):
    """Turn the right-hand column of an Inclusions/Exclusions/Coded Elsewhere list into items."""
    items, cur = [], []
    for ln in lines:
        s = ln.strip()
        if not s:
            continue
        cur.append(s)
        if CODE_REF.search(s) or not s.endswith((",", "-", " or", " and", " of", " with", " in", " to", " the")):
            items.append(join_lines(cur)); cur = []
    if cur:
        items.append(join_lines(cur))
    return items


def parse_body(lines, kind):
    lines = [l for l in lines if not PAGE_FURNITURE.match(l)]
    if kind == "chapter":
        cleaned, skip = [], False
        for l in lines:
            s = l.strip()
            if re.match(r"^This chapter has \d+", s) or s.startswith("Code range starts with"):
                continue
            if s.startswith("This chapter contains the following top level blocks"):
                skip = True; continue
            if skip:
                continue
            cleaned.append(l)
        lines = cleaned
    sections, cur_label, cur = [], "description", []
    for l in lines:
        m = LABEL_RE.match(l)
        if m:
            sections.append((cur_label, cur))
            cur_label, cur = m.group(1), [m.group(2)]
        else:
            cur.append(l)
    sections.append((cur_label, cur))
    out = {}
    for label, ls in sections:
        if label in ("description", "Note", "Additional information"):
            # A list label's items continue until a blank line; text after that belongs to the description.
            paras = split_paragraphs(ls)
            if not paras:
                continue
            key = {"description": "d", "Note": "n", "Additional information": "a"}[label]
            out.setdefault(key, []).extend(paras)
        else:
            # list sections end at first blank line followed by non-indented prose (rare); keep simple
            key = {"Inclusions": "i", "Exclusions": "x", "Coded Elsewhere": "ce", "Coding Note": "cn"}[label]
            if key == "cn":
                out.setdefault(key, []).extend(split_paragraphs(ls))
            else:
                out.setdefault(key, []).extend(split_items(ls))
    return out


def main():
    tab_path, mms_path, out_dir, release = sys.argv[1:5]
    entities = read_tabulation(tab_path)
    with open(mms_path, encoding="utf-8") as f:
        text = f.read().replace("\f", "\n")
    lines = text.split("\n")

    # Skip the table of contents: start at the first standalone "CHAPTER 01" line.
    pos = next(i for i, l in enumerate(lines) if l.strip() == "CHAPTER 01")
    starts = []  # (line_index, entity_index)
    missing = 0
    for idx, e in enumerate(entities):
        m = header_matcher(e)
        limit = min(len(lines), pos + 6000)
        found = None
        for j in range(pos, limit):
            if m(lines[j]):
                found = j
                break
        if found is None:
            missing += 1
            continue
        starts.append((found, idx))
        pos = found + 1

    details = {}
    for n, (line_i, idx) in enumerate(starts):
        end = starts[n + 1][0] if n + 1 < len(starts) else len(lines)
        e = entities[idx]
        body = lines[line_i + 1:end]
        if e["kind"] == "chapter":
            # drop the wrapped chapter title lines that follow "CHAPTER NN"
            title_n = norm(e["title"])
            acc = ""
            while body and title_n.startswith(norm(acc + " " + body[0]) if acc else norm(body[0])) and body[0].strip():
                acc = (acc + " " + body[0].strip()).strip()
                body = body[1:]
        elif e["kind"] == "block":
            # drop wrapped block title continuation (until the line ending with the code range)
            first = lines[line_i]
            if not re.search(r"\)\s*$", first) and body and re.search(r"\(\S+\)\s*$", body[0]):
                body = body[1:]
        d = parse_body(body, e["kind"])
        if d:
            details[e["key"]] = d

    os.makedirs(out_dir, exist_ok=True)
    chapters = []
    index = []
    for e in entities:
        if e["kind"] == "chapter":
            chapters.append({"k": e["key"], "no": e["chapter"], "t": e["title"]})
        row = [e["key"], e["code"], e["title"], e["parent"], {"chapter": "h", "block": "b"}.get(e["kind"], "c"), e["chapter"], e["lid"]]
        index.append(row)
    with open(os.path.join(out_dir, "index.js"), "w", encoding="utf-8") as f:
        f.write("window.ICD_INDEX=")
        json.dump({"release": release, "chapters": chapters,
                   "fields": ["key", "code", "title", "parent", "kind", "chapter", "lid"],
                   "rows": index}, f, ensure_ascii=False, separators=(",", ":"))
        f.write(";\n")
    by_ch = {}
    for e in entities:
        if e["key"] in details:
            by_ch.setdefault(e["chapter"], {})[e["key"]] = details[e["key"]]
    for ch in chapters:
        data = by_ch.get(ch["no"], {})
        with open(os.path.join(out_dir, f"ch-{ch['no']}.js"), "w", encoding="utf-8") as f:
            f.write(f'ICD_LOAD_CHAPTER("{ch["no"]}",')
            json.dump(data, f, ensure_ascii=False, separators=(",", ":"))
            f.write(");\n")
    print(f"entities={len(entities)} matched={len(starts)} missing={missing} with_details={len(details)}")


if __name__ == "__main__":
    main()
