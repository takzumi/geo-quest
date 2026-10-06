"""
build.py : CSVの問題データを、アプリが読める data.js に変換するスクリプト

使い方（ターミナルで）:
    cd geo-quest
    python tools/build.py

【流れ】
  tools/questions.csv   (問題。Excelで編集OK)  ─┐
  tools/prefectures.csv (県名・漢字データ)      ─┴→ チェック → docs/data/data.js を作る

学習ポイント:
  - csv.DictReader : CSVの各行を「列名→値」の辞書として読める
  - json.dumps     : Pythonのデータ(辞書・リスト)をJSON文字列に変換
  - assert / エラー集め : データのミスを実行時に教えてくれる
"""
import csv
import json
from pathlib import Path

# このファイルの場所を基準にパスを決める（どこから実行しても動く）
BASE = Path(__file__).resolve().parent
OUT = BASE.parent / "docs" / "data" / "data.js"


def read_csv(name):
    # utf-8-sig : Excelで保存したCSV(BOM付き)も読める
    with open(BASE / name, encoding="utf-8-sig", newline="") as f:
        return list(csv.DictReader(f))


def main():
    prefs = read_csv("prefectures.csv")
    questions = read_csv("questions.csv")
    errors = []

    pref_names = {p["name"] for p in prefs}

    # ---------- 県データの整形 ----------
    pref_list = []
    for p in prefs:
        pref_list.append({
            "name": p["name"],
            "kana": p["kana"],
            "region": int(p["region"]),
            "suffix": p["suffix"],
            "capital": p["capital"],
            "capitalKana": p["capital_kana"],
            "mnemonic": p["mnemonic"],
            "decoys": [p["decoy1"], p["decoy2"]],
            "wrongKana": [p["wrong_kana1"], p["wrong_kana2"]],
        })

    # ---------- 問題データのチェックと整形 ----------
    q_list = []
    seen_ids = set()
    for row in questions:
        qid = row["id"]
        if qid in seen_ids:
            errors.append(f"{qid}: idが重複しています")
        seen_ids.add(qid)

        if row["type"] == "choice":
            wrongs = [row["wrong1"], row["wrong2"], row["wrong3"]]
            if any(w == "" for w in wrongs):
                errors.append(f"{qid}: 4択なのに不正解の選択肢が足りません")
            if row["answer"] in wrongs:
                errors.append(f"{qid}: 正解が不正解の選択肢にも入っています")
            q_list.append({
                "id": qid, "region": int(row["region"]), "cat": row["category"],
                "lv": int(row["level"]), "type": "choice", "q": row["question"],
                "a": row["answer"], "w": wrongs, "e": row["explanation"],
            })
        elif row["type"] == "map":
            if row["answer"] not in pref_names:
                errors.append(f"{qid}: 地図問題の答え「{row['answer']}」が県リストにありません")
            q_list.append({
                "id": qid, "region": int(row["region"]), "cat": row["category"],
                "lv": int(row["level"]), "type": "map", "q": row["question"],
                "a": row["answer"], "e": row["explanation"],
            })
        else:
            errors.append(f"{qid}: type は choice か map にしてください")

    if errors:
        print("❌ データにミスがありました。直してからもう一度実行してください。")
        for e in errors:
            print("  -", e)
        raise SystemExit(1)

    data = {"prefs": pref_list, "questions": q_list}
    OUT.parent.mkdir(parents=True, exist_ok=True)
    # ensure_ascii=False : 日本語をそのまま書き出す
    OUT.write_text(
        "// このファイルは tools/build.py が自動で作ります。直接は編集しないでください。\n"
        "window.GEO_DATA = " + json.dumps(data, ensure_ascii=False, indent=1) + ";\n",
        encoding="utf-8",
    )

    # ---------- 集計の表示 ----------
    print("✅ 変換できました →", OUT)
    print(f"   県: {len(pref_list)}件 / 問題: {len(q_list)}件")
    for r, label in [(1, "①中国・四国"), (2, "②近畿"), (3, "③中部")]:
        rows = [q for q in q_list if q["region"] == r]
        cats = {}
        for q in rows:
            cats[q["cat"]] = cats.get(q["cat"], 0) + 1
        print(f"   {label}: {len(rows)}問  {cats}")


if __name__ == "__main__":
    main()
