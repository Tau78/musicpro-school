#!/usr/bin/env bash
# Carica listing + Review Notes su App Store Connect. Non è Submit for Review.
# Segreti: ~/.app-store/asc-api/key.env
# Uso: bash scripts/asc-metadata.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

BUNDLE_ID="it.musicproeventi.school"
APP_ID="${ASC_APP_ID:-6806407450}"
PRIVACY_URL="https://www.musicproeventi.it/privacy"
SUPPORT_URL="https://school.musicproeventi.it"
MARKETING_URL="https://www.musicproeventi.it"

load_asc_api() {
  if [[ -n "${ASC_KEY_ID:-}" && -n "${ASC_ISSUER_ID:-}" && -n "${ASC_KEY_PATH:-}" ]]; then
    return 0
  fi
  local key_env="$HOME/.app-store/asc-api/key.env"
  if [[ -f "$key_env" ]]; then
    # shellcheck disable=SC1090
    source "$key_env"
  fi
  if [[ -z "${ASC_KEY_ID:-}" && -n "${APPLE_API_KEY_ID:-}" ]]; then
    ASC_KEY_ID="$APPLE_API_KEY_ID"
    ASC_ISSUER_ID="$APPLE_API_ISSUER_ID"
    ASC_KEY_PATH="$APPLE_API_KEY_PATH"
  fi
  if [[ -z "${ASC_KEY_ID:-}" || -z "${ASC_ISSUER_ID:-}" || -z "${ASC_KEY_PATH:-}" ]]; then
    echo "Manca ASC API key.env (~/.app-store/asc-api/key.env o ASC_KEY_ID/ASC_ISSUER_ID/ASC_KEY_PATH)" >&2
    exit 1
  fi
}

load_asc_api

# Non stampare mai il contenuto della .p8
echo "ASC key: id=${ASC_KEY_ID} path=${ASC_KEY_PATH}"

python3 - "$ASC_KEY_ID" "$ASC_ISSUER_ID" "$ASC_KEY_PATH" "$APP_ID" "$BUNDLE_ID" \
  "$PRIVACY_URL" "$SUPPORT_URL" "$MARKETING_URL" "$REPO" <<'PY'
import json, os, sys, time, urllib.request, urllib.error
from pathlib import Path

(
    kid, iss, key_path, app_id, bundle_id,
    privacy_url, support_url, marketing_url, repo,
) = sys.argv[1:]

def read_field(path, name):
    text = Path(path).read_text(encoding="utf-8")
    prefix = name + ":"
    lines = text.splitlines()
    for i, line in enumerate(lines):
        if not line.startswith(prefix):
            continue
        rest = line[len(prefix):].strip()
        if rest == "|":
            block = []
            for nxt in lines[i + 1:]:
                if nxt.startswith("  "):
                    block.append(nxt[2:])
                elif nxt.strip() == "":
                    block.append("")
                else:
                    break
            return "\n".join(block).strip() + "\n"
        return rest
    return ""

def jwt_token():
    import base64, json as js, subprocess
    def b64url(raw: bytes) -> str:
        return base64.urlsafe_b64encode(raw).rstrip(b"=").decode()
    now = int(time.time())
    header = b64url(js.dumps({"alg": "ES256", "kid": kid, "typ": "JWT"}).encode())
    payload = b64url(js.dumps({
        "iss": iss, "iat": now, "exp": now + 12 * 60, "aud": "appstoreconnect-v1",
    }).encode())
    signing_input = f"{header}.{payload}".encode()
    der = subprocess.check_output(
        ["openssl", "dgst", "-sha256", "-sign", key_path],
        input=signing_input,
    )
    # DER ECDSA → JOSE r||s (32+32)
    def der_to_jose(sig: bytes) -> bytes:
        i = 0
        assert sig[i] == 0x30
        i += 2  # skip seq + len
        assert sig[i] == 0x02
        i += 1
        rlen = sig[i]
        i += 1
        r = sig[i:i + rlen]
        i += rlen
        assert sig[i] == 0x02
        i += 1
        slen = sig[i]
        i += 1
        s = sig[i:i + slen]
        r = r[1:] if r[0] == 0 else r
        s = s[1:] if s[0] == 0 else s
        return r.rjust(32, b"\x00") + s.rjust(32, b"\x00")
    return f"{header}.{payload}.{b64url(der_to_jose(der))}"

TOKEN = jwt_token()
API = "https://api.appstoreconnect.apple.com"

def api(method, path, body=None):
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(
        API + path,
        data=data,
        method=method,
        headers={
            "Authorization": "Bearer " + TOKEN,
            "Content-Type": "application/json",
        },
    )
    try:
        with urllib.request.urlopen(req) as res:
            raw = res.read()
            return json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        raise SystemExit(f"{method} {path} → {e.code}\n{err}") from e

def patch(resource, id_, attrs):
    return api("PATCH", f"/v1/{resource}/{id_}", {
        "data": {"type": resource, "id": id_, "attributes": attrs},
    })

it_path = Path(repo) / "store/ios/it.txt"
en_path = Path(repo) / "store/ios/en.txt"
notes_path = Path(repo) / "store/ios/review-notes.txt"
for p in (it_path, en_path, notes_path):
    if not p.is_file():
        raise SystemExit(f"Manca {p.relative_to(repo)} — crea store/ios prima di caricare i metadati")

notes = notes_path.read_text(encoding="utf-8").strip()
if len(notes) > 4000:
    raise SystemExit(f"review-notes.txt è {len(notes)} char (max 4000)")

versions = api(
    "GET",
    f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=5",
)
if not versions.get("data"):
    raise SystemExit("Nessuna versione iOS su ASC")
version = versions["data"][0]
version_id = version["id"]
print(
    "Versione:",
    version["attributes"].get("versionString"),
    version["attributes"].get("appStoreState"),
    version_id,
)

locs = api("GET", f"/v1/appStoreVersions/{version_id}/appStoreVersionLocalizations")
wanted = {
    "it": {
        "description": read_field(it_path, "description"),
        "keywords": read_field(it_path, "keywords"),
        "promotionalText": read_field(it_path, "promotional_text"),
        "whatsNew": read_field(it_path, "whats_new"),
        "supportUrl": support_url,
        "marketingUrl": marketing_url,
    },
    "en-US": {
        "description": read_field(en_path, "description"),
        "keywords": read_field(en_path, "keywords"),
        "promotionalText": read_field(en_path, "promotional_text"),
        "whatsNew": read_field(en_path, "whats_new"),
        "supportUrl": support_url,
        "marketingUrl": marketing_url,
    },
}
have = {row["attributes"]["locale"]: row for row in locs.get("data", [])}
# whatsNew: su 1.0 ASC rifiuta l'edit. Includilo solo con ASC_WHATS_NEW=1.
include_whats_new = os.environ.get("ASC_WHATS_NEW", "").strip() in ("1", "true", "yes")
for locale, attrs in wanted.items():
    row = have.get(locale)
    if not row:
        print("Manca localization", locale, "— creala in ASC (Add Localization)")
        continue
    payload = {k: v for k, v in attrs.items() if v}
    if not include_whats_new:
        payload.pop("whatsNew", None)
    try:
        patch("appStoreVersionLocalizations", row["id"], payload)
        print("OK listing", locale)
    except SystemExit as e:
        msg = str(e)
        if "whatsNew" in msg:
            payload.pop("whatsNew", None)
            patch("appStoreVersionLocalizations", row["id"], payload)
            print("OK listing", locale, "(senza whatsNew)")
        else:
            raise
if not include_whats_new:
    print("Nota: whatsNew non inviato (prima versione o default). Override: ASC_WHATS_NEW=1")

infos = api("GET", f"/v1/apps/{app_id}/appInfos")
info = next((x for x in infos.get("data", []) if x["attributes"].get("state") != "READY_FOR_DISTRIBUTION" or True), None)
if info:
    info_locs = api("GET", f"/v1/appInfos/{info['id']}/appInfoLocalizations")
    name_it = read_field(it_path, "name")
    sub_it = read_field(it_path, "subtitle")
    name_en = read_field(en_path, "name")
    sub_en = read_field(en_path, "subtitle")
    for row in info_locs.get("data", []):
        loc = row["attributes"]["locale"]
        attrs = {"privacyPolicyUrl": privacy_url}
        if loc.startswith("it"):
            attrs["name"] = name_it
            attrs["subtitle"] = sub_it
        elif loc.startswith("en"):
            attrs["name"] = name_en
            attrs["subtitle"] = sub_en
        patch("appInfoLocalizations", row["id"], attrs)
        print("OK app info", loc, "privacy URL")

# demoAccountPassword intenzionalmente omesso: non va nel repo; compilare in ASC UI.
review_attrs = {
    "contactFirstName": "Mauro",
    "contactLastName": "Andreoni",
    "contactPhone": "+393716752550",
    "contactEmail": "andreoni.mauro@gmail.com",
    "demoAccountRequired": True,
    "demoAccountName": "andreoni.mauro@gmail.com",
    "notes": notes,
}
detail = api("GET", f"/v1/appStoreVersions/{version_id}/appStoreReviewDetail")
if detail.get("data"):
    patch("appStoreReviewDetails", detail["data"]["id"], review_attrs)
    print("OK review notes (demoAccountRequired=true, password omessa)")
else:
    api("POST", "/v1/appStoreReviewDetails", {
        "data": {
            "type": "appStoreReviewDetails",
            "attributes": review_attrs,
            "relationships": {
                "appStoreVersion": {"data": {"type": "appStoreVersions", "id": version_id}},
            },
        }
    })
    print("OK review notes (create; demoAccountRequired=true, password omessa)")

print()
print("=== Metadati caricati. NON è Submit for Review. ===")
print("Mancano ancora (manuale / non via questo script):")
print("  - screenshot iPhone: 1242×2688 o 1284×2778 — store/ios/screenshots/")
print("  - screenshot iPad 13″: 2064×2752 — store/ios/screenshots/ipad-13-2064x2752/")
print("  - Age Rating (Individual)")
print("  - App Privacy (nutrition labels)")
print("  - password demo Sign-In Required su ASC (App Review Information)")
print("  - video/allegato solo se Apple lo chiede in Resolution Center (non di default)")
print("Bundle:", bundle_id, "| App ID:", app_id)
print("Poi: bash scripts/asc-submit.sh  (dry-run)  oppure  ASC_SUBMIT=1 bash scripts/asc-submit.sh --yes")
PY
