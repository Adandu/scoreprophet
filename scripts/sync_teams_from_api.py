#!/usr/bin/env python3
"""Sync all WC 2026 team squads from football-data.org into the DB."""

import urllib.request
import json
import sqlite3

API_KEY = 'bf4c2bbe0985442abaf75fbbba51088d'
DB_PATH = '/mnt/sdc/docker/scoreprophet/scoreprophet.db'

req = urllib.request.Request(
    'https://api.football-data.org/v4/competitions/WC/teams?season=2026',
    headers={'X-Auth-Token': API_KEY}
)
with urllib.request.urlopen(req, timeout=15) as r:
    data = json.loads(r.read())

teams = data.get('teams', [])
print(f'Fetched {len(teams)} teams from API')

db = sqlite3.connect(DB_PATH)
cur = db.cursor()

updated = 0
for t in teams:
    squad_json = json.dumps(t.get('squad', []))
    staff_json = json.dumps(t.get('staff', []))
    comps_json = json.dumps(t.get('runningCompetitions', []))
    raw_json   = json.dumps(t)
    coach_name = (t.get('coach') or {}).get('name') or ''
    area_name  = (t.get('area') or {}).get('name', '')
    area_code  = (t.get('area') or {}).get('code', '')

    cur.execute(
        "UPDATE Team SET "
        "squadJson=?, staffJson=?, runningCompetitionsJson=?, rawJson=?, "
        "coachName=?, areaName=?, areaCode=?, crest=?, address=?, "
        "website=?, founded=?, clubColors=?, venue=? "
        "WHERE externalId=?",
        (
            squad_json, staff_json, comps_json, raw_json,
            coach_name, area_name, area_code,
            t.get('crest') or '', t.get('address') or '', t.get('website') or '',
            t.get('founded'), t.get('clubColors') or '', t.get('venue') or '',
            str(t['id'])
        )
    )
    if cur.rowcount:
        updated += 1
        print(f"  {t['name']}: {len(t.get('squad', []))} players")

db.commit()
db.close()
print(f'\nUpdated {updated}/{len(teams)} teams.')
