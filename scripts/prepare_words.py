#!/usr/bin/env python3
"""
Prepares the Finnish word dataset for Sanakuutio.
Combines Kotus (Institute for the Languages of Finland),
Joukahainen (Voikko morphology database), and Finnish word frequency lists.
"""

import json
import re
import urllib.request
import xml.etree.ElementTree as ET
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"
DATA_DIR.mkdir(parents=True, exist_ok=True)

KOTUS_XML_URL = "https://raw.githubusercontent.com/hugovk/everyfinnishword/master/kotus-sanalista_v1/kotus-sanalista_v1.xml"
KOTUS_TXT_URL = "https://raw.githubusercontent.com/hugovk/everyfinnishword/master/kaikkisanat.txt"
JOUKAHAINEN_URL = "https://raw.githubusercontent.com/voikko/corevoikko/master/voikko-fi/vocabulary/joukahainen.xml"
FREQ_URL = "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/fi/fi_50k.txt"

def fetch_data(url: str, cache_file: Path) -> bytes:
    if cache_file.exists():
        print(f"Loading cached {cache_file.name}...")
        return cache_file.read_bytes()
    print(f"Downloading {url}...")
    req = urllib.request.Request(url, headers={"User-Agent": "Sanakuutio/1.0"})
    with urllib.request.urlopen(req) as resp:
        content = resp.read()
    cache_file.write_bytes(content)
    return content

def main():
    cache_dir = DATA_DIR / ".cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    # 1. Fetch source data
    kotus_xml_bytes = fetch_data(KOTUS_XML_URL, cache_dir / "kotus.xml")
    kotus_txt_bytes = fetch_data(KOTUS_TXT_URL, cache_dir / "kaikkisanat.txt")
    joukahainen_bytes = fetch_data(JOUKAHAINEN_URL, cache_dir / "joukahainen.xml")
    freq_bytes = fetch_data(FREQ_URL, cache_dir / "fi_50k.txt")

    # 2. Parse frequency map
    freq_map = {}
    for line in freq_bytes.decode("utf-8", errors="ignore").splitlines():
        parts = line.strip().split()
        if len(parts) >= 2:
            try:
                freq_map[parts[0].lower()] = int(parts[1])
            except ValueError:
                pass
    print(f"Parsed {len(freq_map)} frequency entries.")

    # 3. Parse Joukahainen word classes
    root_j = ET.fromstring(joukahainen_bytes)
    j_classes = {}
    for w in root_j.findall("word"):
        classes = [c.text for c in w.findall("classes/wclass") if c.text]
        forms = [f.text for f in w.findall("forms/form") if f.text]
        if not forms or not classes:
            continue
        word = forms[0].lower().strip()
        # Only Finnish letters
        if not re.match(r"^[a-zåäö]+$", word):
            continue
        # Map primary class
        cls = classes[0]
        if cls in ("noun", "adjective", "verb", "adverb", "conjunction", "interjection", "pnoun_misc", "pnoun_firstname", "pnoun_lastname", "pnoun_place"):
            j_classes[word] = cls
    print(f"Parsed {len(j_classes)} Joukahainen tagged words.")

    # 4. Parse Kotus XML
    root_kotus = ET.fromstring(kotus_xml_bytes)
    kotus_records = {}
    for st in root_kotus.findall("st"):
        s = st.find("s")
        if s is None or not s.text:
            continue
        word = s.text.lower().strip()
        if not re.match(r"^[a-zåäö]+$", word):
            continue
        
        t = st.find("t")
        tn = None
        if t is not None:
            tn_el = t.find("tn")
            if tn_el is not None and tn_el.text:
                try:
                    tn = int(tn_el.text)
                except ValueError:
                    pass
        kotus_records[word] = tn
    print(f"Parsed {len(kotus_records)} Kotus words.")

    # 5. Build full set of valid guess words from Kotus txt + Kotus XML + Joukahainen
    all_valid_words = set()
    for line in kotus_txt_bytes.decode("utf-8", errors="ignore").splitlines():
        w = line.strip().lower()
        if re.match(r"^[a-zåäö]+$", w) and 4 <= len(w) <= 8:
            all_valid_words.add(w)
    for w in kotus_records:
        if 4 <= len(w) <= 8:
            all_valid_words.add(w)
    for w, cls in j_classes.items():
        if 4 <= len(w) <= 8 and not cls.startswith("pnoun_"):
            all_valid_words.add(w)
    print(f"Total valid guess words (4-8 letters): {len(all_valid_words)}")

    # 6. Classify target words (nouns, adjectives, verbs in basic form)
    # We exclude adverbs/particles (tn 99/101, adverb, etc.)
    targets_by_len = {l: [] for l in range(4, 9)}
    guesses_by_len = {l: set() for l in range(4, 9)}

    for w in all_valid_words:
        l = len(w)
        guesses_by_len[l].add(w)

        # Check part of speech
        pos = None
        j_cls = j_classes.get(w)
        if j_cls:
            if j_cls == "noun":
                pos = "substantiivi"
            elif j_cls == "adjective":
                pos = "adjektiivi"
            elif j_cls == "verb":
                pos = "verbi"
            elif j_cls in ("adverb", "conjunction", "interjection") or j_cls.startswith("pnoun_"):
                # Exclude from secret target words
                continue

        tn = kotus_records.get(w)
        if tn in (99, 101):
            # Exclude adverbs from targets
            continue

        if pos is None:
            if tn is not None and 52 <= tn <= 78:
                pos = "verbi"
            elif w.endswith(("inen", "ton", "tön", "mainen", "mäinen", "kas", "käs", "llinen", "ikas")):
                pos = "adjektiivi"
            elif tn is not None and 1 <= tn <= 51:
                pos = "substantiivi"
            elif w in kotus_records:
                # Compound words in Kotus without <t> are nominals (nouns/adjectives)
                pos = "substantiivi"

        if pos in ("substantiivi", "adjektiivi", "verbi"):
            freq = freq_map.get(w, 0)
            targets_by_len[l].append({
                "w": w,
                "pos": pos,
                "f": freq
            })

    # Sort target words by frequency descending (most common first)
    for l in range(4, 9):
        targets_by_len[l].sort(key=lambda item: (item["f"], item["w"]), reverse=True)
        print(f"Length {l}: {len(targets_by_len[l])} targets, {len(guesses_by_len[l])} valid guesses")
        print(f"  Top 5 length {l}: {[x['w'] + ' (' + x['pos'] + ')' for x in targets_by_len[l][:5]]}")

    # 7. Write data files
    # Compact format for fast web delivery and loading
    dataset = {
        "targets": {str(l): targets_by_len[l] for l in range(4, 9)},
        "guesses": {str(l): sorted(list(guesses_by_len[l])) for l in range(4, 9)}
    }

    out_file = DATA_DIR / "words.json"
    with open(out_file, "w", encoding="utf-8") as f:
        json.dump(dataset, f, ensure_ascii=False, separators=(",", ":"))
    print(f"Wrote dataset to {out_file} ({out_file.stat().st_size / 1024:.1f} KB)")

if __name__ == "__main__":
    main()
