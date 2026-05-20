#!/usr/bin/env python3
"""
Fetch H2H match history from 11v11.com via Wayback Machine snapshots.

Usage:
  python3 fetch_h2h_11v11.py [--output /path/to/results.json] [--stage GROUP|KNOCKOUT_ALL|etc]

The script:
 1. Reads all matches from the ScoreProphet DB (via docker cp)
 2. For each unique team pair, fetches last 10 H2H matches from 11v11.com
    (via archived Wayback Machine snapshots, since 11v11.com is Cloudflare-blocked)
 3. Saves results to a JSON file
 4. Writes data into the DB (headToHeadJson field), skipping any pair
    that already has non-empty data unless --force is passed

Run after group stage scraping for knockout stage:
  docker cp ScoreProphet:/data/scoreprophet.db /tmp/sp.db
  python3 fetch_h2h_11v11.py --stage ROUND_OF_16
  python3 fetch_h2h_11v11.py --stage QUARTER_FINAL
  etc.

Then write to DB:
  python3 fetch_h2h_11v11.py --write-only --output /tmp/h2h_results.json
"""
import json, re, sys, time, urllib.request, argparse, subprocess, os
from datetime import datetime

# Team name (as stored in ScoreProphet DB) → (11v11 slug, 11v11 opposition display name)
TEAM_MAP = {
    "Mexico": ("mexico", "Mexico"),
    "South Africa": ("south-africa", "South Africa"),
    "South Korea": ("korea-republic", "Korea Republic"),
    "Czechia": ("czech-republic", "Czech Republic"),
    "Canada": ("canada", "Canada"),
    "Bosnia-Herzegovina": ("bosnia-herzegovina", "Bosnia and Herzegovina"),
    "Qatar": ("qatar", "Qatar"),
    "Switzerland": ("switzerland", "Switzerland"),
    "Brazil": ("brazil", "Brazil"),
    "Haiti": ("haiti", "Haiti"),
    "Scotland": ("scotland", "Scotland"),
    "Morocco": ("morocco", "Morocco"),
    "United States": ("usa", "USA"),
    "Paraguay": ("paraguay", "Paraguay"),
    "Australia": ("australia", "Australia"),
    "Turkey": ("turkey", "Turkey"),
    "Germany": ("germany", "Germany"),
    "Curaçao": ("curacao", "Curacao"),
    "Ivory Coast": ("ivory-coast", "Ivory Coast"),
    "Ecuador": ("ecuador", "Ecuador"),
    "Netherlands": ("netherlands", "Netherlands"),
    "Japan": ("japan", "Japan"),
    "Sweden": ("sweden", "Sweden"),
    "Tunisia": ("tunisia", "Tunisia"),
    "Belgium": ("belgium", "Belgium"),
    "Egypt": ("egypt", "Egypt"),
    "Saudi Arabia": ("saudi-arabia", "Saudi Arabia"),
    "Uruguay": ("uruguay", "Uruguay"),
    "Iran": ("iran", "Iran"),
    "New Zealand": ("new-zealand", "New Zealand"),
    "Spain": ("spain", "Spain"),
    "Cape Verde Islands": ("cape-verde-islands", "Cape Verde Islands"),
    "France": ("france", "France"),
    "Senegal": ("senegal", "Senegal"),
    "Iraq": ("iraq", "Iraq"),
    "Norway": ("norway", "Norway"),
    "Argentina": ("argentina", "Argentina"),
    "Algeria": ("algeria", "Algeria"),
    "Austria": ("austria", "Austria"),
    "Jordan": ("jordan", "Jordan"),
    "Portugal": ("portugal", "Portugal"),
    "Uzbekistan": ("uzbekistan", "Uzbekistan"),
    "Colombia": ("colombia", "Colombia"),
    "Congo DR": ("congo-dr", "Congo DR"),
    "England": ("england", "England"),
    "Croatia": ("croatia", "Croatia"),
    "Ghana": ("ghana", "Ghana"),
    "Panama": ("panama", "Panama"),
    # Add more teams here as knockout stage progresses
    # Format: "DB Team Name": ("11v11-slug", "11v11 Opposition Display Name"),
}

MONTHS = {
    "Jan": 1, "Feb": 2, "Mar": 3, "Apr": 4, "May": 5, "Jun": 6,
    "Jul": 7, "Aug": 8, "Sep": 9, "Oct": 10, "Nov": 11, "Dec": 12,
}


def fetch_url(url, timeout=15):
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.read().decode("utf-8", errors="replace")
    except Exception:
        return None


def find_wayback_snapshot(raw_url):
    cdx = (
        f"http://web.archive.org/cdx/search/cdx?url={raw_url}"
        f"&output=json&limit=5&filter=statuscode:200&fl=timestamp,original&collapse=timestamp:6"
    )
    data = fetch_url(cdx)
    if not data:
        return None
    try:
        rows = json.loads(data)
        if len(rows) < 2:
            return None
        ts = rows[1][0]
        return f"https://web.archive.org/web/{ts}/{raw_url}"
    except Exception:
        return None


def parse_matches(html, home_team, away_team, limit=10):
    """Parse match rows from 11v11.com HTML table."""
    results = []
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", html, re.DOTALL | re.IGNORECASE)
    for row in rows:
        cells = re.findall(r"<td[^>]*>(.*?)</td>", row, re.DOTALL | re.IGNORECASE)
        if len(cells) < 4:
            continue
        clean = [re.sub(r"<[^>]+>", "", c).strip() for c in cells]
        date_match = re.match(
            r"(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})",
            clean[0],
        )
        if not date_match:
            continue
        day = int(date_match.group(1))
        mon = MONTHS[date_match.group(2)]
        year = int(date_match.group(3))
        try:
            dt = datetime(year, mon, day)
        except Exception:
            continue
        score_str = None
        home_score = away_score = 0
        competition = ""
        for cell in clean[1:]:
            sm = re.search(r"(\d+)\s*-\s*(\d+)", cell)
            if sm and score_str is None:
                score_str = sm.group(0)
                home_score = int(sm.group(1))
                away_score = int(sm.group(2))
            elif len(cell) > 3 and not re.match(r"^[WDL]$", cell) and score_str:
                competition = cell
        if not score_str:
            continue
        match_id = (
            f"11v11-{year}{mon:02d}{day:02d}"
            f"-{home_team[:4].replace(' ','')}"
            f"-{away_team[:4].replace(' ','')}"
            f"-{home_score}-{away_score}"
        )
        results.append(
            {
                "id": match_id,
                "utcDate": dt.strftime("%Y-%m-%dT00:00:00Z"),
                "competition": competition,
                "homeTeam": home_team,
                "awayTeam": away_team,
                "homeScore": home_score,
                "awayScore": away_score,
            }
        )
        if len(results) >= limit:
            break
    return results


def fetch_h2h_from_11v11(home, away, limit=10):
    """Try both perspectives (home→away and away→home) via Wayback Machine."""
    if home not in TEAM_MAP or away not in TEAM_MAP:
        print(f"  ⚠ No TEAM_MAP entry for '{home}' or '{away}' — add it to TEAM_MAP")
        return None

    home_slug, _ = TEAM_MAP[home]
    _, away_display = TEAM_MAP[away]
    away_slug, _ = TEAM_MAP[away]
    _, home_display = TEAM_MAP[home]

    for (team_slug, opp_display, primary_home, primary_away) in [
        (home_slug, away_display, home, away),
        (away_slug, home_display, away, home),
    ]:
        opp_encoded = opp_display.replace(" ", "%20")
        raw_url = f"11v11.com/teams/{team_slug}/tab/opposingTeams/opposition/{opp_encoded}/"
        snapshot_url = find_wayback_snapshot(raw_url)
        if not snapshot_url:
            time.sleep(0.5)
            continue
        html = fetch_url(snapshot_url)
        if not html:
            time.sleep(0.5)
            continue
        matches = parse_matches(html, primary_home, primary_away, limit)
        if matches:
            # If fetched from away perspective, swap home/away
            if primary_home != home:
                for m in matches:
                    m["homeTeam"], m["awayTeam"] = home, away
                    m["homeScore"], m["awayScore"] = m["awayScore"], m["homeScore"]
            return matches
        time.sleep(0.5)
    return None


def get_db_pairs(stage_filter=None):
    """Extract team pairs from ScoreProphet DB."""
    tmp_db = "/tmp/sp_h2h_fetch.db"
    subprocess.run(["docker", "cp", "ScoreProphet:/data/scoreprophet.db", tmp_db], check=True)
    stage_clause = f"WHERE stage='{stage_filter}'" if stage_filter else "WHERE stage='GROUP'"
    out = subprocess.check_output(
        ["sqlite3", tmp_db, f"SELECT homeTeam, awayTeam FROM Match {stage_clause};"]
    ).decode()
    os.remove(tmp_db)
    pairs = []
    for line in out.strip().splitlines():
        parts = line.split("|")
        if len(parts) == 2:
            pairs.append(f"{parts[0]}|{parts[1]}")
    return pairs


def write_to_db(results):
    """Write H2H results back to ScoreProphet DB."""
    tmp_db = "/tmp/sp_h2h_write.db"
    subprocess.run(["docker", "cp", "ScoreProphet:/data/scoreprophet.db", tmp_db], check=True)

    updated = 0
    skipped = 0
    for pair, matches in results.items():
        home, away = pair.split("|")
        json_val = json.dumps(matches)
        # Only write if current value is empty ("[]")
        cur = subprocess.check_output(
            ["sqlite3", tmp_db,
             f"SELECT headToHeadJson FROM Match WHERE homeTeam='{home}' AND awayTeam='{away}' AND stage='GROUP';"]
        ).decode().strip()
        if cur and cur != "[]":
            skipped += 1
            continue
        subprocess.run(
            ["sqlite3", tmp_db,
             f"UPDATE Match SET headToHeadJson='{json_val.replace(chr(39), chr(39)*2)}' "
             f"WHERE homeTeam='{home}' AND awayTeam='{away}';"],
            check=True,
        )
        updated += 1

    subprocess.run(["docker", "cp", tmp_db, "ScoreProphet:/data/scoreprophet.db"], check=True)
    os.remove(tmp_db)
    print(f"DB write complete: {updated} updated, {skipped} skipped (already had data)")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--output", default="/tmp/h2h_results.json")
    parser.add_argument("--stage", default="GROUP", help="DB stage filter (GROUP, ROUND_OF_16, etc.)")
    parser.add_argument("--write-only", action="store_true", help="Skip fetch, just write existing JSON to DB")
    parser.add_argument("--force", action="store_true", help="Re-fetch even pairs already in output JSON")
    args = parser.parse_args()

    if args.write_only:
        with open(args.output) as f:
            results = json.load(f)
        write_to_db(results)
        return

    try:
        with open(args.output) as f:
            results = json.load(f)
    except Exception:
        results = {}

    pairs = get_db_pairs(args.stage)
    pending = [p for p in pairs if p not in results or args.force]
    print(f"Total pairs in DB ({args.stage}): {len(pairs)}")
    print(f"Already in cache: {len(results)}")
    print(f"Pending: {len(pending)}")

    for i, pair in enumerate(pending):
        home, away = pair.split("|")
        print(f"[{i+1}/{len(pending)}] {pair}...", flush=True)

        # Mirror from reverse pair if already known
        rev = f"{away}|{home}"
        if not args.force and rev in results:
            if results[rev] == []:
                results[pair] = []
                print("  ✓ Empty (teams never met, mirrored)")
            else:
                mirrored = [
                    {**m, "homeTeam": home, "awayTeam": away,
                     "homeScore": m["awayScore"], "awayScore": m["homeScore"]}
                    for m in results[rev]
                ]
                results[pair] = mirrored
                print(f"  ✓ Mirrored {len(mirrored)} matches from {rev}")
            with open(args.output, "w") as f:
                json.dump(results, f, indent=2)
            continue

        matches = fetch_h2h_from_11v11(home, away)
        if matches is None:
            results[pair] = []
            print("  ✗ No data found")
        else:
            results[pair] = matches
            print(f"  ✓ {len(matches)} matches")

        with open(args.output, "w") as f:
            json.dump(results, f, indent=2)
        time.sleep(1)

    with open(args.output, "w") as f:
        json.dump(results, f, indent=2)

    with_data = sum(1 for v in results.values() if v)
    print(f"\nDone: {with_data}/{len(results)} pairs with match data")


if __name__ == "__main__":
    main()
