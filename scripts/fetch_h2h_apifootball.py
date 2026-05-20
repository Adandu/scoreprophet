#!/usr/bin/env python3
"""
Fetch H2H data from API-Football for all WC 2026 matches.
Only official matches (no friendlies, no youth/women/reserve).
Resumes automatically if rate-limited — run again the next day.

Usage:
  python3 scripts/fetch_h2h_apifootball.py
  python3 scripts/fetch_h2h_apifootball.py --dry-run   # show team ID lookups only
"""

import sqlite3
import json
import time
import sys
import urllib.request
import urllib.parse

API_KEY = "22bfdd8e0b5368c65b2f315651959eeb"
DB_PATH = "/mnt/sdc/docker/scoreprophet/scoreprophet.db"
DRY_RUN = "--dry-run" in sys.argv

# Pre-resolved team IDs (verified from WC 2022, UEFA NL 2022, AFCON 2023, and direct API lookups)
TEAM_IDS: dict[str, int] = {
    "Algeria":            1532,
    "Argentina":          26,
    "Australia":          20,
    "Austria":            775,
    "Belgium":            1,
    "Bosnia-Herzegovina": 1113,
    "Brazil":             6,
    "Canada":             5529,
    "Cape Verde Islands": 1533,
    "Colombia":           8,
    "Congo DR":           1508,
    "Croatia":            3,
    "Curaçao":            5530,
    "Czechia":            770,
    "Ecuador":            2382,
    "Egypt":              32,
    "England":            10,
    "France":             2,
    "Germany":            25,
    "Ghana":              1504,
    "Haiti":              2386,
    "Iran":               22,
    "Iraq":               1567,
    "Ivory Coast":        1501,
    "Japan":              12,
    "Jordan":             1548,
    "Mexico":             16,
    "Morocco":            31,
    "Netherlands":        1118,
    "New Zealand":        4673,
    "Norway":             1090,
    "Panama":             11,
    "Paraguay":           2380,
    "Portugal":           27,
    "Qatar":              1569,
    "Saudi Arabia":       23,
    "Scotland":           1108,
    "Senegal":            13,
    "South Africa":       1531,
    "South Korea":        17,
    "Spain":              9,
    "Sweden":             5,
    "Switzerland":        15,
    "Tunisia":            28,
    "Turkey":             777,
    "United States":      2384,
    "Uruguay":            7,
    "Uzbekistan":         1568,
}

EXCLUDE_TYPES = {"Friendly"}
EXCLUDE_KEYWORDS = [
    "U-17", "U17", "U-18", "U18", "U-19", "U19",
    "U-20", "U20", "U-21", "U21", "U-22", "U22", "U-23", "U23",
    "Youth", "Junior", "Reserve", "Women", "Olympic", "B Team",
]


def api_get(endpoint: str, params: dict) -> dict:
    qs = urllib.parse.urlencode(params)
    url = f"https://v3.football.api-sports.io/{endpoint}?{qs}"
    req = urllib.request.Request(url, headers={"x-apisports-key": API_KEY})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=15) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            if e.code == 429:
                wait = 15 * (attempt + 1)
                print(f"\n  [rate limit] 429 — waiting {wait}s...", flush=True)
                time.sleep(wait)
            else:
                raise
    raise RuntimeError("Exceeded retry limit after repeated 429 errors")


def remaining_quota() -> int:
    data = api_get("status", {})
    resp = data["response"]
    if isinstance(resp, list):
        resp = resp[0] if resp else {}
    reqs = resp.get("requests", {})
    return reqs.get("limit_day", 100) - reqs.get("current", 0)


def resolve_team_id(name: str, cache: dict) -> int | None:
    if name in cache:
        return cache[name]
    if name in TEAM_IDS:
        cache[name] = TEAM_IDS[name]
        return cache[name]
    # Fallback: API search
    print(f"  [lookup] Searching API for '{name}'...")
    data = api_get("teams", {"search": name})
    time.sleep(0.4)
    for team in data.get("response", []):
        cache[name] = team["team"]["id"]
        print(f"  [lookup] Found: {team['team']['name']} (id={cache[name]})")
        return cache[name]
    print(f"  [lookup] WARNING: no result for '{name}'")
    cache[name] = None
    return None


def is_official(fixture: dict) -> bool:
    league = fixture.get("league", {})
    if league.get("type") in EXCLUDE_TYPES:
        return False
    name = league.get("name", "")
    return not any(kw.lower() in name.lower() for kw in EXCLUDE_KEYWORDS)


def fetch_h2h(id1: int, id2: int) -> list[dict]:
    data = api_get("fixtures/headtohead", {"h2h": f"{id1}-{id2}"})
    time.sleep(0.4)
    results = []
    for f in data.get("response", []):
        g = f["goals"]
        if g["home"] is None or g["away"] is None:
            continue  # skip future/upcoming fixtures
        if not is_official(f):
            continue
        results.append({
            "id": str(f["fixture"]["id"]),
            "utcDate": f["fixture"]["date"][:10],
            "homeTeam": f["teams"]["home"]["name"],
            "awayTeam": f["teams"]["away"]["name"],
            "homeScore": g["home"],
            "awayScore": g["away"],
        })
    return sorted(results, key=lambda x: x["utcDate"])


def main() -> None:
    db = sqlite3.connect(DB_PATH)
    cur = db.cursor()

    # Resume: only process matches not yet synced
    cur.execute("""
        SELECT id, homeTeam, awayTeam FROM Match
        WHERE headToHeadSyncedAt IS NULL AND homeTeam != 'TBD' AND awayTeam != 'TBD'
        ORDER BY id
    """)
    matches = cur.fetchall()
    print(f"Matches to process: {len(matches)}")

    if DRY_RUN:
        print("\n--- DRY RUN: checking team ID coverage ---")
        missing = []
        for _, home, away in matches:
            for team in (home, away):
                if team not in TEAM_IDS:
                    missing.append(team)
        if missing:
            print("Teams not in TEAM_IDS (will use API lookup):")
            for t in sorted(set(missing)):
                print(f"  {t}")
        else:
            print("All team names covered by TEAM_IDS — no API lookups needed.")
        db.close()
        return

    quota = remaining_quota()
    print(f"API quota remaining today: {quota}\n")

    team_cache: dict[str, int | None] = {}
    done = 0

    for match_id, home_team, away_team in matches:
        # Estimate calls needed: 1 H2H + lookups for uncached teams
        lookups_needed = sum(
            1 for t in (home_team, away_team)
            if t not in team_cache and t not in TEAM_IDS
        )
        calls_needed = lookups_needed + 1  # +1 for the H2H call
        if quota < calls_needed + 2:
            print(f"\nQuota nearly exhausted ({quota} left). Run again tomorrow to continue.")
            break

        home_id = resolve_team_id(home_team, team_cache)
        away_id = resolve_team_id(away_team, team_cache)
        quota -= lookups_needed

        if not home_id or not away_id:
            print(f"  SKIP {home_team} vs {away_team} — missing team ID")
            # Mark as processed so we don't retry indefinitely
            cur.execute("UPDATE Match SET headToHeadJson='[]', headToHeadSyncedAt='SKIPPED' WHERE id=?", (match_id,))
            db.commit()
            continue

        print(f"  {home_team} ({home_id}) vs {away_team} ({away_id})...", end=" ", flush=True)
        h2h = fetch_h2h(home_id, away_id)
        quota -= 1
        time.sleep(1.2)  # stay well under per-minute rate limit

        if h2h:
            # Lock with sentinel so admin API sync never overwrites
            cur.execute(
                "UPDATE Match SET headToHeadJson=?, headToHeadSyncedAt='2099-01-01T00:00:00.000Z' WHERE id=?",
                (json.dumps(h2h), match_id)
            )
        else:
            # No data — let football-data.org API try as fallback
            cur.execute(
                "UPDATE Match SET headToHeadJson='[]', headToHeadSyncedAt=NULL WHERE id=?",
                (match_id,)
            )
            # Mark progress with a flag so we skip on resume
            cur.execute(
                "UPDATE Match SET headToHeadSyncedAt='NO_DATA' WHERE id=? AND headToHeadSyncedAt IS NULL",
                (match_id,)
            )

        db.commit()
        print(f"{len(h2h)} official matches (quota left: {quota})")
        done += 1

    db.close()
    remaining = len(matches) - done
    print(f"\nDone. Processed {done} matches. {remaining} remaining (run again if > 0).")


if __name__ == "__main__":
    main()
