#!/usr/bin/env python3
"""Loona Astrology Tools — site generator.
Regenerates the ENTIRE site (root English edition + 39 edition folders)
from generator/strings/<code>.json. Editions without a strings file fall
back to English. Run:  python3 generator/build.py   (or root build.py)
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GEN = os.path.join(ROOT, "generator")
TPL = os.path.join(GEN, "templates")
STR = os.path.join(GEN, "strings")
BASE = "https://astrology.loonaautomation.com"
LASTMOD = "2026-11-17"

EDITIONS = ["", "ar","bg","bn","cs","da","de","el","en-gb","en-us","es","fi","fr","he","hi","hr","hu","id","it","ja","ko","ms","nb","nl","pl","pt","pt-br","pt-pt","ro","ru","sk","sv","sw","th","tr","uk","ur","vi","zh","zh-hant"]
LANG_ATTR = {"": "en", "en-gb": "en-GB", "en-us": "en-US", "zh-hant": "zh-Hant", "pt-br": "pt-BR", "pt-pt": "pt-PT"}
RTL = {"ar", "he", "ur"}
NATIVE = {"": "English", "en-gb": "English (UK)", "en-us": "English (US)", "ar": "العربية", "bg": "Български", "bn": "বাংলা", "cs": "Čeština", "da": "Dansk", "de": "Deutsch", "el": "Ελληνικά", "es": "Español", "fi": "Suomi", "fr": "Français", "he": "עברית", "hi": "हिन्दी", "hr": "Hrvatski", "hu": "Magyar", "id": "Bahasa Indonesia", "it": "Italiano", "ja": "日本語", "ko": "한국어", "ms": "Bahasa Melayu", "nb": "Norsk", "nl": "Nederlands", "pl": "Polski", "pt": "Português", "pt-br": "Português (Brasil)", "pt-pt": "Português (Portugal)", "ro": "Română", "ru": "Русский", "sk": "Slovenčina", "sv": "Svenska", "sw": "Kiswahili", "th": "ไทย", "tr": "Türkçe", "uk": "Українська", "ur": "اردو", "vi": "Tiếng Việt", "zh": "中文", "zh-hant": "繁體中文"}

PAGES = ["index.html", "birth-chart-calculator.html", "about.html", "contact.html", "privacy.html", "terms.html", "disclaimer.html", "faq.html", "feedback.html", "how-we-work.html"]
INFO = {"about.html": "about", "contact.html": "contact", "privacy.html": "privacy", "terms.html": "terms", "disclaimer.html": "disclaimer", "faq.html": "faq", "feedback.html": "feedback", "how-we-work.html": "howwework"}

def load_strings(code):
    en = json.load(open(os.path.join(STR, "en.json"), encoding="utf-8"))
    if code in ("", "en-gb", "en-us"):
        return en
    p = os.path.join(STR, code + ".json")
    if os.path.exists(p):
        d = json.load(open(p, encoding="utf-8"))
        en.update(d)
    return en

def tpl(name):
    return open(os.path.join(TPL, name), encoding="utf-8").read()

CSS = tpl("style.css")

def render(text, S, extra):
    def rep(m):
        k = m.group(1)
        if k in extra: return extra[k]
        v = S.get(k, "")
        return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    return re.sub(r"\[\[([A-Za-z0-9_]+)\]\]", rep, text)

def edition_url(code, page):
    prefix = BASE + ("/" + code if code else "")
    return prefix + "/" if page == "index.html" else prefix + "/" + page

def hreflang(page):
    out = []
    for c in EDITIONS:
        la = LANG_ATTR.get(c, c)
        href = edition_url(c, page)
        out.append(f'<link rel="alternate" hreflang="{la}" href="{href}">')
    out.append(f'<link rel="alternate" hreflang="x-default" href="{edition_url("", page)}">')
    return "".join(out)

def lang_links(page, absolute):
    parts = []
    for c in EDITIONS:
        la = LANG_ATTR.get(c, c)
        href = edition_url(c, page) if absolute else None
        parts.append((c, la, href))
    return parts

def build_edition(code):
    S = load_strings(code)
    lang = LANG_ATTR.get(code, code if code else "en")
    outdir = os.path.join(ROOT, code) if code else ROOT
    os.makedirs(outdir, exist_ok=True)
    prefix = "../" if code else ""
    dirattr = ' dir="rtl"' if code in RTL else ""
    strip = " · ".join(f'<a href="{edition_url(c, "index.html")}" hreflang="{LANG_ATTR.get(c, c or "en")}" style="color:#cfe0d6;text-decoration:underline">{NATIVE[c]}</a>' for c in EDITIONS)
    menu = "".join(f'<a href="{edition_url(c, "index.html")}" hreflang="{LANG_ATTR.get(c, c or "en")}">{NATIVE[c]}</a>' for c in EDITIONS)
    header = render(tpl("header.html"), S, {"PREFIX": prefix, "LANGMENU": menu})
    footer = render(tpl("footer.html"), S, {"LANGSTRIP": strip})
    faq_jsonld_items = [{"@type": "Question", "name": S[f"faq{i}_q"], "acceptedAnswer": {"@type": "Answer", "text": S[f"faq{i}_a"]}} for i in range(1, 7)]
    webapp = {"@context": "https://schema.org", "@type": "WebApplication", "name": S["site_name"], "url": edition_url(code, "birth-chart-calculator.html"), "description": S["tool_desc"], "applicationCategory": "LifestyleApplication", "operatingSystem": "Any", "browserRequirements": "Requires JavaScript", "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"}, "publisher": {"@type": "Organization", "name": "Loona Automation", "url": "https://loonaautomation.github.io/"}}
    org = {"@context": "https://schema.org", "@type": "Organization", "name": "Loona Automation", "url": "https://loonaautomation.github.io/", "logo": "https://loonaautomation.github.io/og-image.jpg", "sameAs": ["https://github.com/loonaautomation", "https://www.pinterest.com/loonaautomation/", "https://www.reddit.com/user/loonaautomation/", "https://dev.to/loonaautomation"]}

    def head(title, desc, page, manifest, jsonld):
        h = render(tpl("head.html"), S, {"TITLE": title, "DESC": desc, "CANONICAL": edition_url(code, page), "HREFLANG": hreflang(page), "PREFIX": prefix, "CSS": CSS, "MANIFEST": manifest, "JSONLD": jsonld})
        return h

    def jsonld_str(objs):
        return "\n".join('<script type="application/ld+json">' + json.dumps(o, ensure_ascii=False) + "</script>" for o in objs)

    common = {"LANG": lang, "DIRATTR": dirattr, "HEADER": header, "FOOTER": footer}

    # index
    extra = dict(common); extra["HEAD"] = head(S["index_title"], S["index_desc"], "index.html", "manifest.webmanifest", jsonld_str([webapp, {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_jsonld_items}]))
    open(os.path.join(outdir, "index.html"), "w", encoding="utf-8").write(render(tpl("index.html"), S, extra))

    # tool
    subset = {k: S[k] for k in ["signs", "planets", "copied", "copy_failed", "err_date", "err_city", "err_engine", "summary_h", "house_label", "cusp_note", "row_sun", "row_moon", "row_asc", "row_mc", "wheel_h", "rising_unavailable"]}
    extra = dict(common); extra["HEAD"] = head(S["tool_title"], S["tool_desc"], "birth-chart-calculator.html", "birth-chart-calculator.webmanifest", jsonld_str([webapp, {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": faq_jsonld_items}]))
    extra["ASTROPREFIX"] = prefix; extra["STRINGS_JSON"] = json.dumps(subset, ensure_ascii=False)
    open(os.path.join(outdir, "birth-chart-calculator.html"), "w", encoding="utf-8").write(render(tpl("tool.html"), S, extra))

    # info pages
    for page, pfx in INFO.items():
        title = S[pfx + "_title"]; h1 = S[pfx + "_h1"]
        desc = S[pfx + "_inshort"]
        body = S[pfx + "_body"]
        if page == "faq.html":
            items = "".join(f"<h3>{S[f'faq{i}_q']}</h3><p>{S[f'faq{i}_a']}</p>" for i in range(1, 7))
            body = body.replace('<div id="faq-list"></div>', items)
        extra = dict(common)
        extra["HEAD"] = head(title, desc, page, "manifest.webmanifest", jsonld_str([org]))
        extra["PAGE_H1"] = h1; extra["PAGE_INSHORT"] = desc; extra["PAGE_BODY"] = body; extra["FAQSCRIPT"] = ""
        open(os.path.join(outdir, page), "w", encoding="utf-8").write(render(tpl("info.html"), S, extra))

    # manifests
    man = {"name": S["site_name"], "short_name": "Astrology", "description": S["index_desc"], "start_url": ".", "scope": ".", "display": "standalone", "background_color": "#062e2a", "theme_color": "#062e2a", "icons": [{"src": prefix + "icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": prefix + "icon-512.png", "sizes": "512x512", "type": "image/png"}, {"src": prefix + "icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}
    json.dump(man, open(os.path.join(outdir, "manifest.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)
    tman = dict(man); tman["name"] = S["site_name"] + " — " + S["tool_card_h"]; tman["short_name"] = "Birth Chart"; tman["description"] = S["tool_desc"]; tman["start_url"] = "birth-chart-calculator.html"
    json.dump(tman, open(os.path.join(outdir, "birth-chart-calculator.webmanifest"), "w", encoding="utf-8"), ensure_ascii=False, indent=2)

    # sitemap (this edition only; root sitemap lists root URLs only — mirror convention)
    urls = "\n".join(f'<url><loc>{edition_url(code, p)}</loc><lastmod>{LASTMOD}</lastmod></url>' for p in PAGES)
    open(os.path.join(outdir, "sitemap.xml"), "w", encoding="utf-8").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + urls + "\n</urlset>\n")

    # search index (mirror shape: n,u,s,d,k,p,c)
    meta = [("index.html", S["tool_card_h"], S["index_desc"], "Tool"), ("birth-chart-calculator.html", S["tool_card_h"], S["tool_desc"], "Tool")]
    for page, pfx in INFO.items():
        meta.append((page, S[pfx + "_h1"], S[pfx + "_inshort"], "Guide" if page in ("faq.html", "how-we-work.html") else "Page"))
    idx = []
    for i, (page, n, d, c) in enumerate(meta):
        idx.append({"n": n, "u": edition_url(code, page), "s": S["site_name"], "d": d, "k": (n + " " + d).lower(), "p": i, "c": c})
    json.dump(idx, open(os.path.join(outdir, "search-index.json"), "w", encoding="utf-8"), ensure_ascii=False)

def build_root_extras():
    S = load_strings("")
    header = render(tpl("header.html"), S, {"PREFIX": "", "LANGMENU": "".join(f'<a href="{edition_url(c, "index.html")}" hreflang="{LANG_ATTR.get(c, c or "en")}">{NATIVE[c]}</a>' for c in EDITIONS)})
    strip = " · ".join(f'<a href="{edition_url(c, "index.html")}" hreflang="{LANG_ATTR.get(c, c or "en")}" style="color:#cfe0d6;text-decoration:underline">{NATIVE[c]}</a>' for c in EDITIONS)
    footer = render(tpl("footer.html"), S, {"LANGSTRIP": strip})
    h = render(tpl("head.html"), S, {"TITLE": S["notfound_title"], "DESC": S["notfound_p"], "CANONICAL": BASE + "/404.html", "HREFLANG": "", "PREFIX": "", "CSS": CSS, "MANIFEST": "manifest.webmanifest", "JSONLD": ""})
    page = render(tpl("404.html"), S, {"HEAD": h, "HEADER": header, "FOOTER": footer})
    open(os.path.join(ROOT, "404.html"), "w", encoding="utf-8").write(page)
    open(os.path.join(ROOT, "robots.txt"), "w", encoding="utf-8").write("User-agent: *\nAllow: /\nSitemap: " + BASE + "/sitemap.xml\n")
    open(os.path.join(ROOT, "google5b3a299509a330b3.html"), "w", encoding="utf-8").write("google-site-verification: google5b3a299509a330b3.html")

if __name__ == "__main__":
    for code in EDITIONS:
        build_edition(code)
    build_root_extras()
    print(f"Built {len(EDITIONS)} editions x {len(PAGES)} pages = {len(EDITIONS)*len(PAGES)} HTML pages (+404).")
