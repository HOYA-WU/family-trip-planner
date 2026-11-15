#!/usr/bin/env python3
"""把 Notion 匯出的舊行程（Markdown & CSV）轉成本工具的備份檔，再用首頁「匯入備份」匯入。

用法：
  python3 tools/notion_to_backup.py <解壓縮後的 Notion 資料夾> [--owner HOYA] [--kid 啾比] [--weather Melbourne]

需要 Pillow（壓縮圖片）：pip install pillow
只在這台電腦上執行，不會上傳任何東西。輸出的 .json 放在 Notion 資料夾裡。
"""
import argparse, base64, csv, glob, hashlib, io, json, os, re, statistics, sys, unicodedata
from urllib.parse import unquote

from PIL import Image

MAX_PDF = 5 * 1024 * 1024
URL_RE = re.compile(r"https?://[^\s)\]，、]+")
MAPS_RE = re.compile(r"https?://(maps\.app\.goo\.gl|goo\.gl/maps|www\.google\.[^/]+/maps|maps\.google)")


def nid(prefix, n=[0]):
    n[0] += 1
    return f"{prefix}{n[0]}"


def nfkc(s):
    return unicodedata.normalize("NFKC", s or "")


# ---------- 附件 ----------
class Files:
    def __init__(self, root):
        self.root = root
        self.items = []
        self.by_path = {}

    def resolve(self, rel, base):
        rel = unquote(rel.strip())
        for b in (base, self.root):
            p = os.path.normpath(os.path.join(b, rel))
            if os.path.isfile(p):
                return p
        return None

    def add(self, path, purpose="photo"):
        if path in self.by_path:
            return self.by_path[path]
        raw = open(path, "rb").read()
        h = hashlib.sha256(raw).digest()[:12].hex()
        name = os.path.basename(path)
        if name.lower().endswith(".pdf"):
            if len(raw) > MAX_PDF:
                print(f"  ! 略過超過 5MB 的 PDF：{name}")
                return None
            f = {"name": name, "kind": "pdf", "mime": "application/pdf", "size": len(raw), "hash": h,
                 "data": "data:application/pdf;base64," + base64.b64encode(raw).decode()}
        else:
            try:
                img = Image.open(io.BytesIO(raw))
                img.load()
            except Exception as e:
                print(f"  ! 讀不了圖片 {name}：{e}")
                return None
            if purpose == "doc":
                data = jpeg(img, 1600, 2400, 0.82, 450_000)
            else:
                data = jpeg(img, 1200, 1200, 0.75, 250_000)
            f = {"name": name, "kind": "image", "mime": "image/jpeg", "size": int(len(data) * 0.75), "hash": h,
                 "thumb": jpeg(img, 320, 320, 0.6, 30_000), "data": data}
        f["id"] = nid("f")
        self.items.append(f)
        self.by_path[path] = f["id"]
        return f["id"]


def jpeg(img, max_w, max_h, quality, max_bytes):
    im = img.convert("RGBA")
    bg = Image.new("RGB", im.size, (255, 255, 255))
    bg.paste(im, mask=im.split()[3])
    scale = min(1, max_w / bg.width, max_h / bg.height)
    q = int(quality * 100)
    while True:
        w, h = max(1, round(bg.width * scale)), max(1, round(bg.height * scale))
        buf = io.BytesIO()
        bg.resize((w, h), Image.LANCZOS).save(buf, "JPEG", quality=q, optimize=True)
        b = buf.getvalue()
        if len(b) * 4 / 3 <= max_bytes or (q <= 40 and scale < 0.3):
            return "data:image/jpeg;base64," + base64.b64encode(b).decode()
        if q > 50:
            q -= 10
        else:
            scale *= 0.8


# ---------- Markdown 小工具 ----------
def sections(md, level=2):
    """依 ## 標題切段：[(標題, 內文)]"""
    out, title, buf = [], None, []
    mark = "#" * level + " "
    for line in md.splitlines():
        if line.startswith(mark):
            if title is not None or buf:
                out.append((title, "\n".join(buf)))
            title, buf = clean_md(line[len(mark):]).strip(), []
        else:
            buf.append(line)
    out.append((title, "\n".join(buf)))
    return out


def clean_md(s):
    s = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", s)                       # 圖片
    s = re.sub(r"\[([^\]]*)\]\((https?://www\.google\.[^)]*/search[^)]*)\)", r"\1", s)  # Google 搜尋連結只留文字
    s = re.sub(r"\[([^\]]*)\]\((https?://[^)]*)\)", lambda m: m.group(2) if m.group(1) == m.group(2) else f"{m.group(1)} {m.group(2)}", s)
    s = s.replace("**", "").replace("　", " ")
    return s


def images_in(md):
    return re.findall(r"!\[[^\]]*\]\(([^)]+)\)", md)


def checks(md):
    """- [x] 項目 → [(文字, 勾了沒, 所在段落標題)]"""
    out, head = [], ""
    for line in md.splitlines():
        if line.startswith("## "):
            head = clean_md(line[3:]).strip()
        m = re.match(r"\s*- \[( |x)\]\s*(.+)", line)
        if m:
            out.append((clean_md(m.group(2)).strip(), m.group(1) == "x", head))
        elif line.strip() == "---":
            out.append((None, None, "---"))
    return out


# ---------- 日期時間 ----------
def day_of(label, year):
    m = re.match(r"\s*(\d{1,2})/(\d{1,2})", nfkc(label))
    if not m:
        return "", ""
    rest = re.sub(r"^\s*\d{1,2}/\d{1,2}\s*(\([^)]*\))?\s*", "", nfkc(label)).strip(" -")
    return f"{year}-{int(m.group(1)):02d}-{int(m.group(2)):02d}", rest


def time_in(s):
    s = nfkc(s)
    m = re.search(r"(?<!\d)(\d{1,2}):(\d{2})\s*(am|pm|AM|PM)?", s)
    if not m:
        return ""
    h, mi = int(m.group(1)), int(m.group(2))
    if (m.group(3) or "").lower() == "pm" and h < 12:
        h += 12
    return f"{h:02d}:{mi:02d}" if h < 24 else ""


MONTHS = {m: i + 1 for i, m in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def date_en(s):
    m = re.search(r"(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?,?\s+(\d{4})", s)
    if m and m.group(2).lower() in MONTHS:
        return f"{m.group(3)}-{MONTHS[m.group(2).lower()]:02d}-{int(m.group(1)):02d}"
    m = re.search(r"(\d{4})-(\d{2})-(\d{2})", s)
    return m.group(0) if m else ""


def time_en(s):
    m = re.search(r"(\d{1,2}):(\d{2})\s*(am|pm)", s, re.I)
    if m:
        h = int(m.group(1)) % 12 + (12 if m.group(3).lower() == "pm" else 0)
        return f"{h:02d}:{m.group(2)}"
    m = re.search(r"(?<!\d)(\d{1,2}):(\d{2})(?!\d)", s)
    return f"{int(m.group(1)):02d}:{m.group(2)}" if m else ""


# ---------- 行程卡片 ----------
TYPE_MAP = {"移動": "move", "吃喝": "food", "住宿": "stay", "景點": "sight", "購物": "shop"}
TYPE_TO_CAT = {"food": "food", "move": "transport", "stay": "stay", "sight": "ticket", "shop": "shopping"}
BOOKING_RE = re.compile(r"確認碼|預訂號碼|Reference|Booking|Order Number|訂位代號", re.I)


def guess_type(title):
    if re.search(r"餐|咖啡|coffee|冰淇淋|酒莊|Bistro|Restaurant|Kitchen", title, re.I):
        return "food"
    if re.search(r"紀念品|超市|店", title):
        return "shop"
    return "sight"


def sort_key(card, idx):
    if card["time"]:
        h, m = map(int, card["time"].split(":"))
        return h * 60 + m
    t = card["title"]
    if re.search(r"早午餐", t): return 10 * 60
    if re.search(r"早餐", t): return 8 * 60
    if re.search(r"午餐", t): return 12 * 60
    if re.search(r"晚餐", t): return 18 * 60 + 30
    if card["type"] == "stay": return 23 * 60 + idx * 0.01
    return 14 * 60 + idx * 0.01


def num(s):
    try:
        return float((s or "").replace(",", "").strip())
    except ValueError:
        return 0


def convert_cards(csv_path, root, files, year, cur_col, cur_code, rates):
    base = os.path.dirname(csv_path)
    rows = list(csv.DictReader(open(csv_path, encoding="utf-8-sig")))
    cards, expenses, labels = [], [], {}
    for idx, r in enumerate(rows):
        raw_title = " ".join((r.get("地點") or "").split())
        if not raw_title:
            continue
        day, label = day_of(r.get("第幾天", ""), year)
        if day and label:
            labels.setdefault(day, label)
        status = "normal"
        title = raw_title
        if "❌" in title:
            status = "cancelled"
            title = title.replace("❌", " ")
        if re.search(r"已訂", title):
            status = "booked"
            title = re.sub(r"[（(]?\s*已訂\s*[)）]?", " ", title)
        title = " ".join(title.split()).strip(" -")
        typ = next((v for k, v in TYPE_MAP.items() if k in (r.get("類別") or "")), None) or guess_type(title)

        desc, memo = (r.get("描述") or "").strip(), (r.get("備註") or "").strip()
        booking = ""
        if memo and BOOKING_RE.search(memo):
            booking, memo = memo, ""
        text = "\n\n".join(x for x in dict.fromkeys([desc, memo]) if x)
        urls = list(dict.fromkeys(URL_RE.findall(text + " " + booking)))
        location = next((u for u in urls if MAPS_RE.match(u)), "")
        imgs = []
        for col, purpose in (("照片", "photo"), ("Files & media", "doc")):
            for part in (r.get(col) or "").split(", "):
                part = part.strip()
                if not part:
                    continue
                if part.startswith("http"):
                    if MAPS_RE.match(part) and not location:
                        location = part
                    elif part not in urls:
                        urls.append(part)
                    continue
                p = files.resolve(part, base)
                fid = p and files.add(p, purpose)
                if fid:
                    imgs.append(fid)
        notes = text
        for u in urls:
            notes = notes.replace(u, "")
        notes = re.sub(r"[ \t]+\n", "\n", re.sub(r"\n{3,}", "\n\n", notes)).strip()
        if booking and status == "normal":
            status = "booked"
        card = {
            "id": nid("c"), "day": day, "type": typ, "title": title, "status": status,
            "time": time_in(raw_title), "endTime": "", "notes": notes, "location": location,
            "links": [{"label": "", "url": u} for u in urls if u != location],
            "booking": booking, "images": imgs,
        }
        card["_k"] = sort_key(card, idx)
        cards.append(card)

        amt = num(r.get(cur_col)) if cur_col else 0
        cur = cur_code
        if not amt:
            amt, cur = num(r.get("台幣")), "TWD"
        if amt > 0:
            expenses.append({"id": "c_" + card["id"], "cardId": card["id"], "amount": amt, "currency": cur,
                             "title": title, "date": day, "category": TYPE_TO_CAT.get(typ, "other")})
        if cur_col and num(r.get(cur_col)) > 0 and num(r.get("台幣結算")) > 0:
            rates.append(num(r.get("台幣結算")) / num(r.get(cur_col)))

    by_day = {}
    for c in cards:
        by_day.setdefault(c["day"], []).append(c)
    for xs in by_day.values():
        xs.sort(key=lambda c: c.pop("_k"))
        for i, c in enumerate(xs):
            c["order"] = (i + 1) * 1000
    return cards, expenses, labels


# ---------- 主頁面 ----------
def parse_flights(text):
    pnr = (re.search(r"訂位代號[:：]\s*([A-Z0-9]{5,8})", text) or [None, ""])[1]
    groups = []
    for leg in re.split(r"(?m)^###\s+", text)[1:]:
        segs = []
        for part in re.split(r"(?m)^(?=航班\d)", leg)[1:]:
            g = lambda k: (re.search(rf"{k}\s*[:：]\s*(.+)", part) or [None, ""])[1].strip()
            fn = re.match(r"航班\d\s*[:：]\s*([A-Z0-9]{2})-?0*(\d+)", part)
            dep, arr = g("出發地點"), g("抵達地點")
            dt, at = g("出發時間"), g("抵達時間")
            code = lambda s: (re.search(r"\(([A-Z]{3})\)", s) or [None, ""])[1]
            term = lambda s: ("T" + m.group(1)) if (m := re.search(r"航廈\s*(\d+)", s)) else ""
            iso = lambda s: (lambda m: f"{m.group(1)}T{m.group(2)}" if m else "")(re.search(r"(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})", s))
            tz = lambda s: (re.search(r"\(([+-]\d+)\)", s) or [None, ""])[1]
            segs.append({
                "flightNo": f"{fn.group(1)}{fn.group(2)}" if fn else "", "airline": g("航空公司"),
                "from": code(dep), "fromTerminal": term(dep), "depart": iso(dt), "depTz": tz(dt),
                "to": code(arr), "toTerminal": term(arr), "arrive": iso(at), "arrTz": tz(at),
                "cabin": re.sub(r"\s+", "", g(r"艙\s*等")),
            })
        if segs:
            extra = []
            if (bag := re.search(r"行李.*?[:：]\s*(.+)", leg)):
                extra.append("行李：" + bag.group(1).strip())
            if (tr := re.search(r"轉機時間\s*[:：]\s*([^-]+)", leg)):
                extra.append("轉機 " + tr.group(1).strip())
            groups.append({"segments": segs, "note": "\n".join(extra)})
    return pnr, groups


def parse_outfits(text, owner, year):
    out, cur = [], None
    for line in text.splitlines():
        s = nfkc(line).strip()
        m = re.match(r"(\d{1,2})/(\d{1,2})(?:\s*-\s*(\d{1,2})/(\d{1,2}))?", s)
        if m:
            d1 = (int(m.group(1)), int(m.group(2)))
            dates = [d1] + ([(int(m.group(3)), int(m.group(4)))] if m.group(3) else [])
            cur = [f"{year}-{a:02d}-{b:02d}" for a, b in dates]
            continue
        if cur and s:
            for d in cur:
                prev = next((o for o in out if o["date"] == d), None)
                if prev:
                    prev["text"] += "\n" + s
                else:
                    out.append({"id": f"{d}_{owner}", "date": d, "personId": owner, "text": s})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("folder")
    ap.add_argument("--owner", default="HOYA", help="每日穿搭是誰的（家人名字）")
    ap.add_argument("--kid", default="", help="行李清單「小孩用品」歸給誰（家人名字）")
    ap.add_argument("--weather", default="", help="天氣預報地點（英文城市名）")
    args = ap.parse_args()

    mains = [p for p in glob.glob(os.path.join(args.folder, "**", "*.md"), recursive=True)
             if os.path.isdir(re.sub(r"\s+[0-9a-f]{32}\.md$", "", p))]
    mains.sort(key=lambda p: p.count(os.sep))
    if not mains:
        sys.exit("找不到 Notion 的行程主頁面")
    main_md = mains[0]
    root = os.path.dirname(main_md)
    sub = re.sub(r"\s+[0-9a-f]{32}\.md$", "", main_md)
    md = open(main_md, encoding="utf-8").read()
    title = clean_md(md.splitlines()[0].lstrip("# ")).strip()
    print(f"轉換：{title}")

    db = glob.glob(os.path.join(sub, "*_all.csv")) or glob.glob(os.path.join(sub, "*.csv"))
    db = [p for p in db if "行程" in os.path.basename(p)] or db
    header = next(csv.reader(open(db[0], encoding="utf-8-sig"))) if db else []
    cur_col, cur_code, country = next(((c, code, cc) for c, code, cc in
                                       [("澳幣", "AUD", "AU"), ("日元", "JPY", "JP"), ("日幣", "JPY", "JP"), ("美金", "USD", "US"), ("韓元", "KRW", "KR"), ("歐元", "EUR", "")]
                                       if c in header), (None, "TWD", ""))
    years = re.findall(r"20\d\d", title + md)
    year = int(years[0]) if years else 2026

    files = Files(root)
    rates = []
    cards, expenses, labels = convert_cards(db[0], root, files, year, cur_col, cur_code, rates) if db else ([], [], {})

    todos, flights, tickets, links, outfits, lists, items, notes = [], [], [], [], [], [], [], {}
    blocks = [{"id": t, "type": t} for t in ["todo", "flights", "tickets", "lists", "outfits", "expenses", "links", "map"]]
    secs = sections(md)
    in_tickets = False
    fare = ""
    for head, body in secs:
        h = head or ""
        if "待辦" in h:
            for t, done, _ in checks(body):
                if t:
                    todos.append({"id": nid("t"), "text": t, "done": done, "order": (len(todos) + 1) * 1000})
            continue
        if "航班" in h:
            pnr, groups = parse_flights(clean_md(body))
            for g in groups:
                flights.append({"id": nid("fl"), "order": (len(flights) + 1) * 1000, "pnr": pnr, "note": g["note"], "files": [], "segments": g["segments"]})
            continue
        if "票價" in h:
            fare = "\n".join(x.strip() for x in clean_md(body).splitlines() if x.strip())
            continue
        if h == "票券":
            in_tickets = True
            continue
        if in_tickets and h and not re.search(r"行前|衣服|買東西|行程安排", h):
            txt = clean_md(body)
            lines = [x.strip() for x in txt.splitlines() if x.strip()]
            bno = (re.search(r"(?:Booking No\.?|Reference|預訂號碼|Order Number)\s*[:：]?\s*([A-Z0-9-]{4,})", txt, re.I) or [None, ""])[1]
            fids = [files.add(p, "doc") for p in (files.resolve(x, root) for x in images_in(body)) if p]
            name = re.sub(r"[（(].*$", "", h).strip() or h
            tickets.append({"id": nid("tk"), "order": (len(tickets) + 1) * 1000, "title": name,
                            "date": date_en(h + " " + txt), "time": time_en(h) or time_en(txt), "bookingNo": bno,
                            "note": "\n".join([h] + lines) if name != h else "\n".join(lines), "files": [f for f in fids if f]})
            continue
        in_tickets = False
        if "衣服" in h or "穿搭" in h:
            outfits = parse_outfits(body, "@" + args.owner, year)
            continue
        if "買東西" in h:
            urls = [u for u in URL_RE.findall(body) if "google." not in u and "notion" not in u]
            for u in dict.fromkeys(urls):
                links.append({"id": nid("l"), "order": (len(links) + 1) * 1000, "label": "", "url": u})
            text = clean_md(body)
            for u in urls:
                text = text.replace(u, "")
            text = "\n".join(l.rstrip() for l in text.splitlines() if l.strip() and not re.match(r"\s*\S+\s+\S*%[0-9A-F]{2}", l))
            text = re.sub(r"^(\S.*?)\s*$", r"\1", text, flags=re.M)
            blocks.append({"id": "n_shop", "type": "note", "title": "買東西"})
            notes["n_shop"] = {"id": "n_shop", "text": text.strip()}
            continue
    if fare and flights:
        flights[-1]["note"] = (flights[-1]["note"] + "\n\n票價條款：\n" + fare).strip()

    # 子頁面：行李清單、參考資料
    for p in glob.glob(os.path.join(sub, "*.md")):
        name = os.path.basename(p)
        body = open(p, encoding="utf-8").read()
        if name.startswith("行李"):
            lid = nid("ls")
            lists.append({"id": lid, "title": "行李", "kind": "packing", "order": 1000})
            for t, done, head in checks(body):
                if not t:
                    continue
                if "行前" in head:
                    todos.append({"id": nid("t"), "text": t, "done": done, "order": (len(todos) + 1) * 1000})
                    continue
                owner = "@" + args.kid if args.kid and "小孩" in head else "shared"
                items.append({"id": nid("i"), "listId": lid, "text": t, "done": done, "owner": owner, "order": (len(items) + 1) * 1000})
        elif "參考" in name or "資料" in name:
            for sh, sb in sections(body):
                for u in dict.fromkeys(URL_RE.findall(sb)):
                    links.append({"id": nid("l"), "order": (len(links) + 1) * 1000, "label": sh or "", "url": u})

    days = sorted({c["day"] for c in cards if c["day"]})
    arrivals = [s["arrive"][:10] for f in flights for s in f["segments"] if s["arrive"]]
    departs = [s["depart"][:10] for f in flights for s in f["segments"] if s["depart"]]
    start = min(days + departs) if days or departs else ""
    end = max(days + arrivals) if days or arrivals else start
    trip = {
        "id": "notion", "title": title, "startDate": start, "endDate": end, "dayLabels": labels,
        "countries": [country] if country else [], "travelerIds": None, "blocks": blocks,
        "rates": {cur_code: round(statistics.median(rates), 2)} if rates else {}, "ratesDate": "",
        "mapUrl": "", "weatherPlace": args.weather, "cover": "",
    }
    out = {"app": "family-trip-planner", "version": 1, "source": "notion", "trip": trip,
           "subs": {"cards": cards, "todos": todos, "flights": flights, "tickets": tickets, "lists": lists,
                    "listItems": items, "outfits": outfits, "expenses": expenses, "links": links,
                    "notes": list(notes.values())},
           "files": files.items}
    dest = os.path.join(args.folder, f"{title}.json")
    json.dump(out, open(dest, "w", encoding="utf-8"), ensure_ascii=False)
    print(f"卡片 {len(cards)}、待辦 {len(todos)}、航班 {len(flights)}、票券 {len(tickets)}、清單項目 {len(items)}、"
          f"穿搭 {len(outfits)}、花費 {len(expenses)}、連結 {len(links)}、附件 {len(files.items)}")
    print(f"日期 {start} → {end}，檔案 {os.path.getsize(dest) / 1e6:.1f} MB")
    print(f"輸出：{dest}")


if __name__ == "__main__":
    main()
