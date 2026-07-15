#!/usr/bin/env python3
"""台灣智庫文章爬蟲：從 sitemap 抓取全部文章的標題／摘要／日期，輸出 data/articles.json。

用法：python3 scripts/crawl.py
"""
import json
import re
import html as htmllib
import os
import urllib.request
import urllib.parse
import xml.etree.ElementTree as ET
from collections import Counter
from concurrent.futures import ThreadPoolExecutor

SITEMAP = "https://www.taiwanthinktank.org/blog-posts-sitemap.xml"
OUT = os.path.join(os.path.dirname(__file__), "..", "data", "articles.json")
HDR = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"}
NS = {"s": "http://www.sitemaps.org/schemas/sitemap/0.9"}


def get(url: str) -> str:
    safe = urllib.parse.quote(url, safe=":/?#[]@!$&()*+,;=~-._")
    req = urllib.request.Request(safe, headers=HDR)
    return urllib.request.urlopen(req, timeout=25).read().decode("utf-8", errors="ignore")


def meta(pattern: str, page: str) -> str:
    m = re.search(pattern, page)
    return htmllib.unescape(m.group(1)).strip() if m else ""


def categorize(title: str) -> str:
    if "政策研究系列" in title or "CHAPTER" in title.upper():
        return "政策研究報告"
    if re.search(r"研討會|論壇|新聞稿|開放報名|已額滿", title):
        return "研討會與新聞"
    if "民調" in title or "民意調查" in title:
        return "民意調查"
    return "議題評論"


def fetch(url: str) -> dict:
    try:
        page = get(url)
        title = meta(r'<meta property="og:title" content="([^"]*)"', page)
        title = re.sub(r"\s*\|\s*taiwanthinktank\s*$", "", title).strip()
        desc = re.sub(r"\s+", " ", meta(r'<meta property="og:description" content="([^"]*)"', page)).strip()
        m = re.search(r'"datePublished"\s*:\s*"([^"]+)"', page)
        return {
            "title": title,
            "url": url,
            "summary": desc[:300],
            "date": m.group(1)[:10] if m else "",
            "category": categorize(title),
        }
    except Exception as e:
        print(f"  失敗 {url}: {e}")
        return {}


def main() -> None:
    print("抓取 sitemap …")
    tree = ET.fromstring(get(SITEMAP))
    urls = [u.findtext("s:loc", namespaces=NS) for u in tree.findall("s:url", NS)]
    print(f"共 {len(urls)} 篇文章，開始抓取 metadata（8 併發）…")

    with ThreadPoolExecutor(max_workers=8) as ex:
        results = [r for r in ex.map(fetch, urls) if r and r["title"]]

    results.sort(key=lambda a: a["date"], reverse=True)
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, separators=(",", ":"))

    print(f"完成：{len(results)} 篇 → {os.path.abspath(OUT)}")
    print(Counter(a["category"] for a in results))


if __name__ == "__main__":
    main()
