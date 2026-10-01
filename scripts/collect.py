"""Collect public observations and open forecast data. No credentials required."""
import concurrent.futures
import datetime as dt
import email.utils
import html
import json
import math
import os
from pathlib import Path
import re
import urllib.parse
import urllib.request
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
UTC = dt.timezone.utc
STATIONS = {
    "cve": {"name": "CVE · Port d’Estavayer", "lat": 46.8503333333, "lon": 6.8388333333,
            "source": "https://meteo.cvestavayer.ch/", "data_url": "https://meteo.cvestavayer.ch/data.json",
            "note": "Station SOCOOP / CVE au port de plaisance d’Estavayer."},
    "cvn": {"name": "CVN · Nid-du-Crô", "lat": 46.99534, "lon": 6.95099,
            "holfuy": 1020, "source": "https://www.cvn.ch/services/meteo/",
            "note": "Anémomètre sur la jetée du port de Neuchâtel."},
    "gmr": {"name": "GMR Avenches", "lat": 46.89662, "lon": 7.02349,
            "holfuy": 929, "source": "https://holfuy.com/fr/weather/929",
            "note": "Station terrestre sur le terrain d’aéromodélisme ; pas au bord du lac."},
    "yvbeach": {"name": "YvBeach · Yvonand", "lat": 46.807, "lon": 6.744,
                "source": "https://www.yvbeach.com/yvmeteo.htm",
                "note": "Station de Yvonand. Position indicative ; rafale maximale sur 1 h."},
}
MODELS = ["meteoswiss_icon_ch1", "meteofrance_arome_france", "icon_seamless", "gfs_seamless", "ecmwf_ifs025"]

def request(url):
    req = urllib.request.Request(url, headers={"User-Agent": "WindForcastLake/1.0 (https://github.com/samvyy/wind-forcast-lake)"})
    with urllib.request.urlopen(req, timeout=35) as r:
        return r.read(), r.headers

def number(value):
    n = float(value)
    if not math.isfinite(n):
        raise ValueError("Non-finite measurement")
    return n

def parse_holfuy(raw, received):
    def value(key):
        m = re.search(r'id="' + key + r'"[^>]*>\s*([0-9.]+)', raw)
        if not m:
            raise ValueError("Missing " + key)
        return number(m[1])
    age_block = re.search(r'id="act_date"[^>]*>(.*?)</span>', raw, re.S)
    if not age_block:
        raise ValueError("Missing observation age")
    age = html.unescape(re.sub(r"<[^>]+>", " ", age_block[1])).strip()
    m = re.search(r"([0-9.]+)\s*(sec|s\b|min|hour|hr|h\b|day)", age, re.I)
    if not m:
        raise ValueError("Unrecognised observation age: " + age)
    factor = 86400 if m[2].lower().startswith("day") else 3600 if m[2].lower().startswith(("hour", "hr")) or m[2].lower() == "h" else 60 if m[2].lower().startswith("min") else 1
    timestamp = received - number(m[1]) * factor
    direction = re.search(r'class="act_dir"\s+title="([0-9.]+)°"\s+id="j_avg_dir"', raw)
    if not direction:
        raise ValueError("Missing wind direction")
    speed, gust = value("j_avg_speed"), value("j_max_gust")
    if not (0 <= speed <= 150 and 0 <= gust <= 200):
        raise ValueError("Invalid wind speed")
    return {"time": round(timestamp), "speed": speed, "gust": gust, "direction": number(direction[1]),
            "averaging": "Moyenne 15 min · rafale max 15 min", "temperature": value("j_temperature")}

def parse_yvbeach(raw):
    text = html.unescape(re.sub(r"<[^>]+>", " ", raw))
    text = re.sub(r"\s+", " ", text)
    m = re.search(r"RELEVE DU\s+(\d{1,2})/(\d{1,2})/(\d{4})\s+A\s+(\d{1,2})h(\d{2})", text)
    if not m:
        raise ValueError("Missing station timestamp")
    day, month, year, hour, minute = map(int, m.groups())
    when = dt.datetime(year, month, day, hour, minute, tzinfo=ZoneInfo("Europe/Zurich"))
    def value(pattern):
        found = re.search(pattern, text)
        if not found:
            raise ValueError("Unrecognised YvBeach measurement")
        return number(found[1])
    return {"time": int(when.timestamp()), "speed": round(value(r"VENT\s+moy/10min\s*:\s*([0-9.]+)\s*km/h") / 1.852, 2),
            "gust": round(value(r"RAFALE\s+max/1h\s*:\s*([0-9.]+)\s*km/h") / 1.852, 2),
            "direction": value(r"DIRECTION\s+moy/10min\s*:\s*[A-Z]+\s*-\s*([0-9.]+)°"),
            "averaging": "Moyenne 10 min · rafale max 1 h"}

def parse_cve(raw):
    data = json.loads(raw)
    current = data["current"]
    def wind(key):
        value = html.unescape(current[key]).strip()
        match = re.fullmatch(r"([0-9]+(?:[.,][0-9]+)?)\s+(?:noeuds|nœuds|knots)", value)
        if not match:
            raise ValueError("Missing CVE wind value or unsupported unit: " + key)
        return number(match[1].replace(",", "."))
    timestamp = number(current["dateTimeRaw"])
    speed, gust = wind("windSpeed"), wind("windGust")
    direction = number(data["current_raw"]["windDir"])
    if not (0 <= speed <= 150 and 0 <= gust <= 200 and 0 <= direction <= 360 and timestamp > 0):
        raise ValueError("Invalid CVE observation")
    return {"time": int(timestamp), "speed": speed, "gust": gust, "direction": direction,
            "averaging": "Relevé de la source · rafale de l’intervalle", "temperature": number(data["current_raw"]["outTemp"])}

def collect_station(item):
    key, meta = item
    url = ("https://widget.holfuy.com/?" + urllib.parse.urlencode({"station": meta["holfuy"], "su": "knots", "t": "C", "lang": "fr", "mode": "detailed"})) if "holfuy" in meta else meta.get("data_url", meta["source"])
    data, headers = request(url)
    received = email.utils.parsedate_to_datetime(headers["Date"]).timestamp() if headers.get("Date") else dt.datetime.now(UTC).timestamp()
    raw = data.decode("iso-8859-1" if key == "yvbeach" else "utf-8")
    obs = parse_holfuy(raw, received) if "holfuy" in meta else parse_cve(raw) if key == "cve" else parse_yvbeach(raw)
    if obs["time"] > received + 120:
        raise ValueError("Observation timestamp is in the future")
    return key, obs

def main():
    now = int(dt.datetime.now(UTC).timestamp())
    path = ROOT / "data/live.json"
    previous = json.loads(path.read_text()) if path.exists() else {"stations": {}}
    stations = {}
    for key, meta in STATIONS.items():
        old = previous.get("stations", {}).get(key, {})
        stations[key] = {**meta, "latest": old.get("latest"), "history": old.get("history", []), "error": None}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        jobs = {executor.submit(collect_station, item): item[0] for item in STATIONS.items()}
        for job in concurrent.futures.as_completed(jobs):
            key = jobs[job]
            try:
                _, obs = job.result()
                station = stations[key]
                station["latest"] = obs
                history = {o["time"]: o for o in station["history"]}
                history[obs["time"]] = obs
                station["history"] = [o for _, o in sorted(history.items()) if o["time"] >= now - 72 * 3600]
                print(key, "OK", obs["speed"], "kn")
            except Exception as e:
                stations[key]["error"] = str(e)
                print(key, "unavailable:", e)
    path.write_text(json.dumps({"generatedAt": now, "stations": stations}, ensure_ascii=False, separators=(",", ":")))
    forecast_path = ROOT / "data/forecast.json"
    forecast = json.loads(forecast_path.read_text()) if forecast_path.exists() else {}
    if now - forecast.get("generatedAt", 0) < 3 * 3600 and not os.getenv("FORCE_FORECAST"):
        print("Forecast cache still recent")
        return
    spots = json.loads((ROOT / "data/spots.json").read_text())
    params = {"latitude": ",".join(str(s["lat"]) for s in spots), "longitude": ",".join(str(s["lon"]) for s in spots),
              "hourly": "wind_speed_10m,wind_gusts_10m,wind_direction_10m", "models": ",".join(MODELS),
              "wind_speed_unit": "kn", "timeformat": "unixtime", "forecast_days": 7}
    try:
        raw, _ = request("https://api.open-meteo.com/v1/forecast?" + urllib.parse.urlencode(params))
        forecasts = json.loads(raw)
        if not isinstance(forecasts, list) or len(forecasts) != len(spots):
            raise ValueError("Unexpected forecast response")
        result = {}
        for spot, data in zip(spots, forecasts):
            h = data["hourly"]
            models = {}
            for model in MODELS:
                models[model] = {"speed": h["wind_speed_10m_" + model], "gust": h["wind_gusts_10m_" + model], "direction": h["wind_direction_10m_" + model]}
            result[spot["id"]] = {"time": h["time"], "models": models}
        forecast_path.write_text(json.dumps({"generatedAt": now, "source": "https://open-meteo.com/", "spots": result}, separators=(",", ":")))
        print("Forecasts OK for", len(result), "spots")
    except Exception as e:
        print("Forecast update failed; keeping previous timestamp:", e)
        if not forecast_path.exists():
            forecast_path.write_text(json.dumps({"generatedAt": 0, "spots": {}, "error": "Forecast unavailable"}))

if __name__ == "__main__":
    main()
