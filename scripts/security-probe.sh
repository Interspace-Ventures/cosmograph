#!/bin/bash
# Live probe of the security hardening against a local api-server.
set -u
B=http://127.0.0.1:5099
OK=https://cosmograph.space
pass=0; fail=0
check() { # name expected actual
  if [ "$2" = "$3" ]; then echo "PASS  $1 ($3)"; pass=$((pass+1)); else echo "FAIL  $1 expected $2 got $3"; fail=$((fail+1)); fi
}
code() { curl -s -o /dev/null -w '%{http_code}' "$@"; }

H=$(curl -s -D - -o /dev/null $B/api/health)
echo "$H" | grep -qi '^content-security-policy: .*frame-ancestors' && check "CSP frame-ancestors header" y y || check "CSP frame-ancestors header" y n
echo "$H" | grep -qi '^x-content-type-options: nosniff' && check "nosniff" y y || check "nosniff" y n
echo "$H" | grep -qi '^x-powered-by' && check "x-powered-by hidden" y n || check "x-powered-by hidden" y y
echo "$H" | grep -qi '^cache-control: no-store' && check "API no-store" y y || check "API no-store" y n

A=$(curl -s -D - -o /dev/null -H "Origin: https://evil.example" $B/api/health | grep -i '^access-control-allow-origin' | tr -d '\r')
check "CORS does not reflect evil origin" "" "$A"
A=$(curl -s -D - -o /dev/null -H "Origin: $OK" $B/api/health | grep -i '^access-control-allow-origin' | tr -d '\r' | awk '{print $2}')
check "CORS allows our origin" "$OK" "$A"

check "POST with no Origin blocked" 403 "$(code -X POST -H 'content-type: application/json' -d '{}' $B/api/me/referral/claim)"
check "POST from evil origin blocked" 403 "$(code -X POST -H 'Origin: https://evil.example' -H 'content-type: application/json' -d '{}' $B/api/billing/checkout)"
check "POST look-alike origin blocked" 403 "$(code -X POST -H 'Origin: https://cosmograph.space.evil.example' -H 'content-type: application/json' -d '{}' $B/api/ship/skin)"
check "POST our origin reaches auth (401)" 401 "$(code -X POST -H "Origin: $OK" -H 'content-type: application/json' -d '{}' $B/api/billing/checkout)"
check "Forged Host cannot pass origin check" 403 "$(code -X POST -H 'Host: evil.example' -H 'Origin: https://evil.example' -H 'content-type: application/json' -d '{}' $B/api/billing/checkout)"

head -c 100000 /dev/zero | tr '\0' 'a' > "$TMPDIR/big.json"; printf '{"q":"' > "$TMPDIR/b2"; cat "$TMPDIR/big.json" >> "$TMPDIR/b2"; printf '"}' >> "$TMPDIR/b2"
check "100KB body rejected" 413 "$(code -X POST -H "Origin: $OK" -H 'content-type: application/json' --data-binary @"$TMPDIR/b2" $B/api/ask/chat)"
check "Unknown API path is JSON 404" 404 "$(code $B/api/does-not-exist)"
check "Webhook without signature rejected" 400 "$(code -X POST -H 'content-type: application/json' -d '{"type":"checkout.session.completed"}' $B/api/stripe/webhook)"
check "Webhook with fake signature rejected" 400 "$(code -X POST -H 'stripe-signature: t=1,v1=deadbeef' -H 'content-type: application/json' -d '{"type":"checkout.session.completed","data":{"object":{"payment_status":"paid","metadata":{"userId":"x"}}}}' $B/api/stripe/webhook)"

WS=$(curl -s -o /dev/null -w '%{http_code}' --http1.1 -H 'Connection: Upgrade' -H 'Upgrade: websocket' -H 'Sec-WebSocket-Version: 13' -H 'Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==' -H 'Origin: https://evil.example' $B/api/presence)
check "Presence socket from evil origin refused" 403 "$WS"
echo "---- $pass passed, $fail failed"
