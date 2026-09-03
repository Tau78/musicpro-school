#!/usr/bin/env bash
# Submit for Review via App Store Connect API (reviewSubmissions).
# Default: dry-run (stampa stato, build, checklist) e exit 0.
# Submit reale solo con ASC_SUBMIT=1 o flag --yes.
# Segreti: ~/.app-store/asc-api/key.env — mai stampare il contenuto .p8.
# Uso:
#   bash scripts/asc-submit.sh              # dry-run
#   ASC_SUBMIT=1 bash scripts/asc-submit.sh # submit
#   bash scripts/asc-submit.sh --yes        # submit
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO"

BUNDLE_ID="it.musicproeventi.school"
APP_ID="${ASC_APP_ID:-6806407450}"

DO_SUBMIT=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y) DO_SUBMIT=1 ;;
    --dry-run) DO_SUBMIT=0 ;;
    -h|--help)
      cat <<'EOF'
Uso: bash scripts/asc-submit.sh [--yes|--dry-run]

  (default)  dry-run: versione editable, build READY, checklist; exit 0
  --yes      submit reale (equivale a ASC_SUBMIT=1)
  ASC_SUBMIT=1  stesso effetto di --yes

Non è un comando git. Non usa --force.
EOF
      exit 0
      ;;
    *)
      echo "Flag sconosciuto: $arg (usa --yes o --dry-run)" >&2
      exit 1
      ;;
  esac
done
if [[ "${ASC_SUBMIT:-0}" == "1" ]]; then
  DO_SUBMIT=1
fi

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

echo "ASC key: id=${ASC_KEY_ID} path=${ASC_KEY_PATH}"
if [[ "$DO_SUBMIT" -eq 1 ]]; then
  echo "Modalità: SUBMIT (ASC_SUBMIT / --yes)"
else
  echo "Modalità: DRY-RUN (default). Per submit: ASC_SUBMIT=1 o --yes"
fi

python3 - "$ASC_KEY_ID" "$ASC_ISSUER_ID" "$ASC_KEY_PATH" "$APP_ID" "$BUNDLE_ID" "$DO_SUBMIT" <<'PY'
import json, sys, time, urllib.request, urllib.error

kid, iss, key_path, app_id, bundle_id, do_submit_s = sys.argv[1:]
do_submit = do_submit_s == "1"

EDITABLE = {
    "PREPARE_FOR_SUBMISSION",
    "READY_FOR_REVIEW",
    "WAITING_FOR_REVIEW",  # already in flight — report only
    "REJECTED",
    "DEVELOPER_REJECTED",
    "METADATA_REJECTED",
    "INVALID_BINARY",
}

SUBMITTABLE = {"PREPARE_FOR_SUBMISSION", "READY_FOR_REVIEW"}

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
    def der_to_jose(sig: bytes) -> bytes:
        i = 0
        assert sig[i] == 0x30
        i += 2
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

def api(method, path, body=None, raise_http=True):
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
            return json.loads(raw) if raw else {}, res.status
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8", "replace")
        if raise_http:
            raise SystemExit(f"{method} {path} → {e.code}\n{err}") from e
        return {"_http_error": True, "code": e.code, "body": err}, e.code

print("Bundle:", bundle_id, "| App ID:", app_id)
print()

# --- Versione editable ---
versions, _ = api(
    "GET",
    f"/v1/apps/{app_id}/appStoreVersions?filter[platform]=IOS&limit=10",
)
rows = versions.get("data") or []
if not rows:
    raise SystemExit("Nessuna versione iOS su ASC")

print("Versioni iOS recenti:")
chosen = None
for v in rows:
    a = v["attributes"]
    state = a.get("appStoreState") or ""
    mark = ""
    if state in SUBMITTABLE and chosen is None:
        chosen = v
        mark = "  ← candidata submit"
    elif state in EDITABLE and chosen is None:
        chosen = v
        mark = "  ← candidata (stato editable)"
    print(f"  {a.get('versionString')}  {state}  {v['id']}{mark}")

if chosen is None:
    chosen = rows[0]
    print("Nessuna PREPARE/READY_FOR_REVIEW: uso la più recente per report.")

version_id = chosen["id"]
vattr = chosen["attributes"]
vstate = vattr.get("appStoreState")
print()
print("Versione selezionata:", vattr.get("versionString"), vstate, version_id)

# --- Build già attaccata ---
build_rel, _ = api("GET", f"/v1/appStoreVersions/{version_id}/build", raise_http=False)
attached_id = None
if not build_rel.get("_http_error") and build_rel.get("data"):
    attached_id = build_rel["data"]["id"]
    ba = build_rel["data"].get("attributes") or {}
    print(
        "Build già collegata:",
        ba.get("version"),
        ba.get("processingState"),
        attached_id,
    )
else:
    print("Build collegata: (nessuna)")

# --- Build processate disponibili ---
builds, _ = api(
    "GET",
    f"/v1/builds?filter[app]={app_id}&filter[processingState]=VALID&sort=-uploadedDate&limit=15",
)
ready = builds.get("data") or []
print()
print("Build VALID disponibili (ultime):")
if not ready:
    print("  (nessuna)")
selected_build = None
for b in ready:
    a = b["attributes"]
    mark = ""
    # Preferisci la più recente non scaduta
    if selected_build is None and not a.get("expired"):
        selected_build = b
        mark = "  ← sarebbe selezionata"
    print(
        f"  build {a.get('version')}  uploaded={a.get('uploadedDate')}  "
        f"expired={a.get('expired')}  {b['id']}{mark}"
    )
if selected_build is None and ready:
    selected_build = ready[0]
    print("  (nessuna non-expired: userei comunque la più recente)")

if attached_id:
    would_use = attached_id
    print()
    print("Per submit: si userà la build già collegata:", would_use)
elif selected_build:
    would_use = selected_build["id"]
    print()
    print("Per submit: si collegherebbe la build:", would_use)
else:
    would_use = None
    print()
    print("ATTENZIONE: nessuna build VALID da collegare.")

# --- Checklist grezza (informativa) ---
print()
print("Checklist (manuale / fuori da questo script se manca):")
print("  [ ] screenshot / preview video")
print("  [ ] Age Rating Individual")
print("  [ ] App Privacy")
print("  [ ] review notes + demo password Sign-In Required (ASC UI)")
print("  [ ] build VALID collegata alla versione")
if vstate not in SUBMITTABLE:
    print(f"  [!] stato versione={vstate} (serve PREPARE_FOR_SUBMISSION o READY_FOR_REVIEW)")
else:
    print(f"  [ok] stato versione submit-abile: {vstate}")

# Open review submissions
open_subs, status = api(
    "GET",
    f"/v1/apps/{app_id}/reviewSubmissions?filter[platform]=IOS&limit=5",
    raise_http=False,
)
if not open_subs.get("_http_error"):
    print()
    print("reviewSubmissions recenti:")
    for s in open_subs.get("data") or []:
        sa = s["attributes"]
        print(f"  {s['id']}  state={sa.get('state')}  submittedDate={sa.get('submittedDate')}")
else:
    print()
    print(f"(reviewSubmissions list → HTTP {status}; ok se scope limitato)")

if not do_submit:
    print()
    print("=== DRY-RUN: nessuna submission creata. Exit 0. ===")
    print("Submit reale: ASC_SUBMIT=1 bash scripts/asc-submit.sh  oppure  --yes")
    sys.exit(0)

# --- SUBMIT reale ---
if vstate not in SUBMITTABLE:
    raise SystemExit(f"Refuse submit: stato={vstate} non in {sorted(SUBMITTABLE)}")
if not would_use:
    raise SystemExit("Refuse submit: nessuna build VALID")

# Attach build se manca
if not attached_id:
    print()
    print("Collego build", would_use, "→ versione", version_id)
    body = {"data": {"type": "builds", "id": would_use}}
    attach_res, st = api(
        "PATCH",
        f"/v1/appStoreVersions/{version_id}/relationships/build",
        body,
        raise_http=False,
    )
    if attach_res.get("_http_error") or st >= 400:
        print(f"PATCH relationships/build → {st}")
        print(attach_res.get("body", attach_res))
        raise SystemExit("Attach build fallito — errori ASC stampati raw sopra.")
    print(f"OK attach build (HTTP {st})")
else:
    print()
    print("Build già collegata, skip attach.")

# Prefer modern reviewSubmissions flow; fall back to legacy appStoreVersionSubmissions.
print()
print("Creo reviewSubmission…")
create_body = {
    "data": {
        "type": "reviewSubmissions",
        "attributes": {"platform": "IOS"},
        "relationships": {
            "app": {"data": {"type": "apps", "id": app_id}},
        },
    }
}
created, code = api("POST", "/v1/reviewSubmissions", create_body, raise_http=False)
submission_id = None
if created.get("_http_error"):
    print(f"POST /v1/reviewSubmissions → {code}")
    print(created.get("body", ""))
    if not open_subs.get("_http_error"):
        for s in open_subs.get("data") or []:
            stt = (s.get("attributes") or {}).get("state")
            # Envelope ancora aprabile (non ancora in coda Apple)
            if stt in ("READY_FOR_REVIEW", "UNRESOLVED_ISSUES"):
                submission_id = s["id"]
                print("Riuso reviewSubmission esistente:", submission_id, stt)
                break
    if not submission_id:
        print("Fallback legacy POST /v1/appStoreVersionSubmissions …")
        legacy, lcode = api(
            "POST",
            "/v1/appStoreVersionSubmissions",
            {
                "data": {
                    "type": "appStoreVersionSubmissions",
                    "relationships": {
                        "appStoreVersion": {
                            "data": {"type": "appStoreVersions", "id": version_id}
                        }
                    },
                }
            },
            raise_http=False,
        )
        print(f"legacy → {lcode}")
        print(json.dumps(legacy, indent=2)[:4000] if isinstance(legacy, dict) else legacy)
        if legacy.get("_http_error"):
            raise SystemExit("Submit fallito (reviewSubmissions + legacy). Vedi errori ASC sopra.")
        print("OK legacy appStoreVersionSubmissions")
        sys.exit(0)
else:
    submission_id = created["data"]["id"]
    print(
        "OK reviewSubmission",
        submission_id,
        (created["data"].get("attributes") or {}).get("state"),
    )

# Add version item
print("Aggiungo appStoreVersion alla submission…")
item_body = {
    "data": {
        "type": "reviewSubmissionItems",
        "relationships": {
            "reviewSubmission": {
                "data": {"type": "reviewSubmissions", "id": submission_id}
            },
            "appStoreVersion": {
                "data": {"type": "appStoreVersions", "id": version_id}
            },
        },
    }
}
item, icode = api("POST", "/v1/reviewSubmissionItems", item_body, raise_http=False)
if item.get("_http_error"):
    print(f"POST /v1/reviewSubmissionItems → {icode}")
    print(item.get("body", ""))
    # 409 often means already attached — continue to submit
    if icode not in (409, 422):
        raise SystemExit("Impossibile aggiungere la versione alla submission")
    print("(item già presente o non richiesto — proseguo)")
else:
    print("OK reviewSubmissionItem", item.get("data", {}).get("id"))

# Submit
print("PATCH submitted=true …")
patched, pcode = api(
    "PATCH",
    f"/v1/reviewSubmissions/{submission_id}",
    {
        "data": {
            "type": "reviewSubmissions",
            "id": submission_id,
            "attributes": {"submitted": True},
        }
    },
    raise_http=False,
)
if patched.get("_http_error"):
    print(f"PATCH /v1/reviewSubmissions/{submission_id} → {pcode}")
    print(patched.get("body", ""))
    raise SystemExit("Submit fallito — errori ASC stampati raw sopra.")
print("OK submitted:", (patched.get("data") or {}).get("attributes"))
print()
print("=== Submit for Review inviato via API. ===")
PY
