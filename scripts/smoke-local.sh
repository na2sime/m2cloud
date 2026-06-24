#!/usr/bin/env bash
# End-to-end smoke test against the local docker-compose stack.
# Starts the 3 bundled backends, exercises the full flow (auth -> room ->
# post -> comment -> async notification -> vote -> live WebSocket chat),
# prints a PASS/FAIL summary, then tears the servers down.
set -uo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source .env
set +a
export DATABASE_URL REDIS_URL RABBITMQ_URL JWT_SECRET

LOGDIR="$(mktemp -d)"
fail=0
note() { printf '  %-48s %s\n' "$1" "$2"; }

echo "== starting backends (bundled dist) =="
GATEWAY_PORT=3000 node apps/gateway-api/dist/index.js >"$LOGDIR/gw.log" 2>&1 & GW=$!
REALTIME_PORT=3001 node apps/realtime/dist/index.js >"$LOGDIR/rt.log" 2>&1 & RT=$!
WORKER_PORT=3002 node apps/worker/dist/index.js   >"$LOGDIR/wk.log" 2>&1 & WK=$!
cleanup() { kill "$GW" "$RT" "$WK" 2>/dev/null; }
trap cleanup EXIT

# wait for health
for i in $(seq 1 40); do curl -sf localhost:3000/health >/dev/null 2>&1 && break; sleep 0.5; done
for i in $(seq 1 40); do curl -sf localhost:3001/health >/dev/null 2>&1 && break; sleep 0.5; done
for i in $(seq 1 40); do curl -sf localhost:3002/health >/dev/null 2>&1 && break; sleep 0.5; done

jget() { python3 -c "import sys,json;print(json.load(sys.stdin)$1)"; }
api() { curl -s "http://localhost:3000$1" "${@:2}"; }
U="$RANDOM$RANDOM"

echo "== REST flow =="
RA=$(api /api/auth/register -H 'content-type: application/json' \
  -d "{\"email\":\"alice$U@t.io\",\"username\":\"alice$U\",\"password\":\"pw123456\"}")
TA=$(echo "$RA" | jget "['token']" 2>/dev/null) || { note "register alice" "FAIL ($RA)"; fail=1; }
[ -n "${TA:-}" ] && note "register alice -> token" "OK" || fail=1

RB=$(api /api/auth/register -H 'content-type: application/json' \
  -d "{\"email\":\"bob$U@t.io\",\"username\":\"bob$U\",\"password\":\"pw123456\"}")
TB=$(echo "$RB" | jget "['token']" 2>/dev/null)
[ -n "${TB:-}" ] && note "register bob -> token" "OK" || fail=1

SLUG="room$U"
RR=$(api /api/rooms -H "authorization: Bearer $TA" -H 'content-type: application/json' \
  -d "{\"slug\":\"$SLUG\",\"name\":\"Room $U\"}")
echo "$RR" | grep -q "$SLUG" && note "alice creates room" "OK" || { note "create room" "FAIL ($RR)"; fail=1; }

# auth enforcement
CODE=$(curl -s -o /dev/null -w '%{http_code}' -X POST http://localhost:3000/api/rooms \
  -H 'content-type: application/json' -d '{"slug":"x","name":"x"}')
[ "$CODE" = "401" ] && note "create room without token -> 401" "OK" || { note "auth enforce" "FAIL ($CODE)"; fail=1; }

RP=$(api "/api/rooms/$SLUG/posts" -H "authorization: Bearer $TA" -H 'content-type: application/json' \
  -d '{"title":"First post","body":"hello world"}')
PID=$(echo "$RP" | jget "['id']" 2>/dev/null)
[ -n "${PID:-}" ] && note "alice creates post" "OK" || { note "create post" "FAIL ($RP)"; fail=1; }

# bob comments on alice's post -> should trigger an async notification for alice
RC=$(api "/api/posts/$PID/comments" -H "authorization: Bearer $TB" -H 'content-type: application/json' \
  -d '{"body":"nice post!"}')
echo "$RC" | grep -q "nice post" && note "bob comments" "OK" || { note "comment" "FAIL ($RC)"; fail=1; }

# bob votes +1
RV=$(api "/api/posts/$PID/vote" -H "authorization: Bearer $TB" -H 'content-type: application/json' -d '{"value":1}')
SC=$(echo "$RV" | jget "['score']" 2>/dev/null)
[ "${SC:-}" = "1" ] && note "bob votes +1 -> score 1" "OK" || { note "vote" "FAIL ($RV)"; fail=1; }

# re-vote -1 -> score -1 (upsert, not double)
RV2=$(api "/api/posts/$PID/vote" -H "authorization: Bearer $TB" -H 'content-type: application/json' -d '{"value":-1}')
SC2=$(echo "$RV2" | jget "['score']" 2>/dev/null)
[ "${SC2:-}" = "-1" ] && note "bob re-votes -1 -> score -1 (upsert)" "OK" || { note "re-vote" "FAIL ($RV2)"; fail=1; }

# wait for the worker to consume comment.created and write the notification
sleep 2
NOTIF=$(api /api/notifications -H "authorization: Bearer $TA")
NCOUNT=$(echo "$NOTIF" | jget "" 2>/dev/null | python3 -c "import sys;print(len(eval(sys.stdin.read())))" 2>/dev/null || echo 0)
[ "${NCOUNT:-0}" -ge 1 ] && note "async notification for alice (worker)" "OK ($NCOUNT)" || { note "notification" "FAIL ($NOTIF)"; fail=1; }

echo "== WebSocket live chat =="
TOKEN="$TA" SLUG="$SLUG" node "$(dirname "$0")/ws-check.mjs" && note "ws join+send+receive roundtrip" "OK" || { note "websocket" "FAIL"; fail=1; }

echo
if [ "$fail" = "0" ]; then
  echo "✅ SMOKE PASSED"
else
  echo "❌ SMOKE FAILED — server logs:"
  echo "--- gateway ---"; tail -8 "$LOGDIR/gw.log"
  echo "--- realtime ---"; tail -8 "$LOGDIR/rt.log"
  echo "--- worker ---"; tail -8 "$LOGDIR/wk.log"
fi
exit $fail
