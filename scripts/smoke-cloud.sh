#!/usr/bin/env bash
# Smoke test against the DEPLOYED cluster via the ingress NLB.
#   bash scripts/smoke-cloud.sh http://<nlb-hostname>
set -uo pipefail
BASE="${1:?usage: smoke-cloud.sh http://<nlb-hostname>}"
fail=0
note() { printf '  %-44s %s\n' "$1" "$2"; }
jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
api() { curl -s --max-time 20 --retry 4 --retry-all-errors --retry-delay 1 "$BASE$1" "${@:2}"; }
U="$RANDOM$RANDOM"

echo "== REST flow against $BASE =="
RA=$(api /api/auth/register -H 'content-type: application/json' \
  -d "{\"email\":\"a$U@t.io\",\"username\":\"a$U\",\"password\":\"pw123456\"}")
TA=$(echo "$RA" | jget "['token']" 2>/dev/null) || true
[ -n "${TA:-}" ] && note "register alice -> token" "OK" || { note "register" "FAIL ($RA)"; fail=1; }

TB=$(api /api/auth/register -H 'content-type: application/json' \
  -d "{\"email\":\"b$U@t.io\",\"username\":\"b$U\",\"password\":\"pw123456\"}" | jget "['token']" 2>/dev/null) || true
[ -n "${TB:-}" ] && note "register bob -> token" "OK" || fail=1

SLUG="r$U"
api /api/rooms -H "authorization: Bearer $TA" -H 'content-type: application/json' \
  -d "{\"slug\":\"$SLUG\",\"name\":\"Room $U\"}" | grep -q "$SLUG" \
  && note "create room (auth)" "OK" || { note "room"; fail=1; }

CODE=$(curl -s -o /dev/null -w '%{http_code}' --max-time 20 --retry 4 --retry-all-errors --retry-delay 1 -X POST "$BASE/api/rooms" \
  -H 'content-type: application/json' -d '{"slug":"x","name":"x"}')
[ "$CODE" = "401" ] && note "create room no token -> 401" "OK" || { note "auth enforce" "FAIL ($CODE)"; fail=1; }

PID=$(api "/api/rooms/$SLUG/posts" -H "authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"title":"hello","body":"world"}' | jget "['id']" 2>/dev/null) || true
[ -n "${PID:-}" ] && note "create post" "OK" || { note "post"; fail=1; }

api "/api/posts/$PID/comments" -H "authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"body":"nice"}' | grep -q nice && note "comment" "OK" || { note "comment"; fail=1; }

SC=$(api "/api/posts/$PID/vote" -H "authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"value":1}' | jget "['score']" 2>/dev/null) || true
[ "${SC:-}" = "1" ] && note "vote +1 -> score 1" "OK" || { note "vote" "FAIL ($SC)"; fail=1; }

sleep 3 # let the worker consume comment.created
NC=$(api /api/notifications -H "authorization: Bearer $TA" | python3 -c "import sys,json;print(len(json.load(sys.stdin)))" 2>/dev/null || echo 0)
[ "${NC:-0}" -ge 1 ] && note "async notification (worker/RabbitMQ)" "OK ($NC)" || { note "notification"; fail=1; }

echo
[ "$fail" = "0" ] && echo "✅ CLOUD SMOKE PASSED" || echo "❌ CLOUD SMOKE FAILED"
exit $fail
