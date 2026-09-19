#!/usr/bin/env bash
#
# stream-watch.sh — catch the intermittent stream connection failure in the act.
#
# WHY THIS EXISTS
#
# Listeners intermittently can't start the stream. In the browser it is silent:
# the <audio> element sits at readyState 0 with no 'error' event, forever.
# Measured from outside, a failing request completes DNS, TCP and the TLS
# handshake to the Cloudflare edge, and then the HTTP response simply never
# arrives (curl reports code 000 with time_starttransfer 0).
#
# The fault is episodic — roughly 7 failures inside one 20-minute window, then
# several hundred clean requests over the following hours. That is why it can't
# be chased interactively: by the time you go looking, it isn't happening.
#
# What has ALREADY been ruled out (don't re-litigate these without new evidence):
#   - The Icecast origin itself. Clean 30/30 sequentially AND 30/30 in a
#     parallel burst, ~60ms, while the CDN path was failing.
#   - nginx on beachyhead/adrenalin. Both 404 for Host: stream.wxdu.art, so
#     neither fronts the stream.
#   - A Cloudflare Tunnel. Zero Trust isn't set up on the account.
#   - A firewall on weeping:443. Nothing listens on 443 at all.
#   - Icecast's listen backlog of 5. A 30-way parallel burst didn't dent it.
#   - Per-IP connection limits. Holding 6 concurrent streams open changed nothing.
#
# WHAT THIS DOES
#
# Every INTERVAL seconds it probes, in parallel, the three points of the chain:
#
#   cf      https://stream.wxdu.art/...      via Cloudflare  (what listeners use)
#   tls     https://weeping...:8443/...      Icecast direct, TLS
#   plain   http://weeping...:8000/...       Icecast direct, plain
#
# plus the actual audio mount over Cloudflare, because that — not the status
# endpoint — is what listeners are failing to open.
#
# It logs ONLY failures, each with full per-phase timings, so the answer is
# readable at a glance rather than buried in noise:
#
#   - cf fails while tls/plain stay clean  ->  the Cloudflare<->origin hop
#   - all three fail together              ->  the origin or its network
#   - only the mount fails, not status     ->  something specific to streaming
#
# On any failure it immediately re-probes all three and records the Icecast
# listener counts, so you see whether the origin was under load at that moment.
# It also captures cf-ray on Cloudflare failures — that is the identifier
# Cloudflare support needs to trace a single request.
#
# RUNNING IT
#
# Start it in the background and walk away:
#
#   nohup ./scripts/stream-watch.sh > /dev/null 2>&1 &
#
# Nothing is printed to the terminal — everything goes to $LOG. Closing the
# terminal won't kill it. It does NOT survive a reboot; see the systemd unit
# at the bottom of this comment if you want that.
#
# Tuning, all optional:
#
#   INTERVAL=60 LOG=~/flare.log nohup ./scripts/stream-watch.sh >/dev/null 2>&1 &
#
#   INTERVAL        seconds between rounds (default 30)
#   TIMEOUT         per-probe timeout (default 10)
#   MOUNT_TIMEOUT   how long to hold the audio mount open (default 8)
#   LOG             log file (default ~/stream-watch.log)
#   HEARTBEAT_EVERY rounds between "still alive" lines (default 120)
#   CF_STATUS / CF_MOUNT / TLS_STATUS / PLAIN_STATUS   probe URLs
#
# Cost is about one intermittent listener slot: each round holds the mount
# open for MOUNT_TIMEOUT seconds and is idle the rest of the interval.
#
# STOPPING IT
#
#   pkill -f stream-watch.sh
#
# Confirm it's gone (should print nothing):
#
#   pgrep -af stream-watch.sh
#
# If you'd rather kill it precisely, pgrep first and kill the PID it reports.
# There's no cleanup to do: the log is closed after every write, so whatever
# has been recorded is already safely on disk, and the temp dir removes itself
# on exit. Stopping mid-round at worst loses that one round.
#
# READING THE LOG
#
#   grep FAILURE ~/stream-watch.log     # did it flare, and when
#   tail -40 ~/stream-watch.log         # full detail of the most recent one
#
# An empty log means nothing went wrong — this is the expected state. Only
# failures and the periodic heartbeat are written.
#
# Each failure block probes all four paths at once, so the pattern names the
# broken hop:
#
#   failed: cf (and/or mount), tls+plain clean -> the Cloudflare<->origin hop
#   all four failed together                   -> the origin or its network
#   mount failed but cf status fine            -> specific to streaming
#   tls failed but plain fine                  -> Icecast's TLS listener (8443)
#
# Within a line, the phase timings say WHERE it died. `tls=0.08s ttfb=0.000000s`
# is this bug's signature: the handshake completed and the response never came.
# `code=000` means no HTTP response at all. The `icecast:` line is the listener
# count at that instant, for checking whether load correlated. On Cloudflare
# failures the cf-ray is captured — that's the ID Cloudflare support needs to
# trace one specific request.
#
# The `-- recheck 2s later --` block distinguishes a one-off blip from a
# sustained window: still failing means you caught a real flare in progress.
#
# RUNNING IT ACROSS REBOOTS (optional)
#
# ~/.config/systemd/user/stream-watch.service:
#
#   [Unit]
#   Description=WXDU stream connection watchdog
#
#   [Service]
#   ExecStart=%h/codetools/wxdnew/scripts/stream-watch.sh
#   Restart=always
#
#   [Install]
#   WantedBy=default.target
#
#   systemctl --user daemon-reload
#   systemctl --user enable --now stream-watch
#   loginctl enable-linger $USER        # keep running while logged out
#   systemctl --user stop stream-watch  # stop it
#
set -uo pipefail

INTERVAL="${INTERVAL:-30}"          # seconds between rounds
TIMEOUT="${TIMEOUT:-10}"            # per-probe timeout
MOUNT_TIMEOUT="${MOUNT_TIMEOUT:-8}" # audio mount probe duration
LOG="${LOG:-$HOME/stream-watch.log}"
HEARTBEAT_EVERY="${HEARTBEAT_EVERY:-120}"  # rounds between "still alive" lines

# Overridable so you can point this at stream.wxdu.org once that record is
# proxied, or at a deliberately broken endpoint to test the alerting itself.
CF_STATUS="${CF_STATUS:-https://stream.wxdu.art/status-json.xsl}"
CF_MOUNT="${CF_MOUNT:-https://stream.wxdu.art/wxdu192.mp3}"
TLS_STATUS="${TLS_STATUS:-https://weeping.wxdu.duke.edu:8443/status-json.xsl}"
PLAIN_STATUS="${PLAIN_STATUS:-http://weeping.wxdu.duke.edu:8000/status-json.xsl}"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

ts() { date '+%Y-%m-%dT%H:%M:%S%z'; }
log() { printf '%s\n' "$*" >> "$LOG"; }

# Phase timings, tab separated. code=000 means no response at all.
FMT='%{http_code}\t%{time_namelookup}\t%{time_connect}\t%{time_appconnect}\t%{time_starttransfer}\t%{time_total}\t%{size_download}\t%{remote_ip}'

probe() { # probe <name> <url> <outfile>
  curl -sS -o /dev/null --max-time "$TIMEOUT" -w "$FMT" "$2" > "$3" 2>/dev/null || true
}

# The audio mount never ends, so max-time always trips. Success is "bytes
# actually arrived", not exit status.
probe_mount() {
  curl -sS -o /dev/null --max-time "$MOUNT_TIMEOUT" -w "$FMT" "$CF_MOUNT" > "$1" 2>/dev/null || true
}

field() { cut -f"$2" < "$1" 2>/dev/null; }

ok_status() { [ "$(field "$1" 1)" = "200" ]; }
ok_mount()  { [ "$(field "$1" 7)" -gt 0 ] 2>/dev/null; }

pretty() { # pretty <label> <file>
  local f="$2"
  printf '    %-6s code=%s dns=%ss conn=%ss tls=%ss ttfb=%ss total=%ss bytes=%s ip=%s\n' \
    "$1" "$(field "$f" 1)" "$(field "$f" 2)" "$(field "$f" 3)" \
    "$(field "$f" 4)" "$(field "$f" 5)" "$(field "$f" 6)" \
    "$(field "$f" 7)" "$(field "$f" 8)"
}

listeners() {
  # Note: no backslash escaping inside this Python. It is already inside shell
  # single quotes, so double quotes are literal, and backslashes inside an
  # f-string expression are a syntax error before 3.12.
  curl -sS --max-time 6 "$PLAIN_STATUS" 2>/dev/null | python3 -c '
import json,sys
try:
    d = json.load(sys.stdin)["icestats"]
    src = d.get("source", [])
    if not isinstance(src, list):
        src = [src]
    parts = []
    for s in src:
        mount = s["listenurl"].rsplit("/", 1)[-1]
        parts.append(mount + "=" + str(s.get("listeners", "?")))
    print(" ".join(parts) if parts else "(no sources)")
except Exception as e:
    print("(status unavailable: %s)" % e)
' 2>/dev/null || echo "(status unavailable)"
}

cf_ray() {
  curl -sS -o /dev/null -D - --max-time "$TIMEOUT" "$CF_STATUS" 2>/dev/null \
    | grep -i '^cf-ray:' | tr -d '\r' || echo "cf-ray: (none returned)"
}

round=0
fail_rounds=0
started="$(ts)"
log ""
log "=== stream-watch started $started  interval=${INTERVAL}s timeout=${TIMEOUT}s"
log "=== logging failures only; heartbeat every $HEARTBEAT_EVERY rounds"

while true; do
  round=$((round + 1))

  probe cf    "$CF_STATUS"    "$TMP/cf"    &
  probe tls   "$TLS_STATUS"   "$TMP/tls"   &
  probe plain "$PLAIN_STATUS" "$TMP/plain" &
  probe_mount "$TMP/mount"    &
  wait

  bad=""
  ok_status "$TMP/cf"    || bad="$bad cf"
  ok_status "$TMP/tls"   || bad="$bad tls"
  ok_status "$TMP/plain" || bad="$bad plain"
  ok_mount  "$TMP/mount" || bad="$bad mount"

  if [ -n "$bad" ]; then
    fail_rounds=$((fail_rounds + 1))
    {
      echo ""
      echo "[$(ts)] FAILURE round=$round failed:$bad"
      pretty "cf"    "$TMP/cf"
      pretty "tls"   "$TMP/tls"
      pretty "plain" "$TMP/plain"
      pretty "mount" "$TMP/mount"
      echo "    icecast: $(listeners)"
      case "$bad" in *cf*|*mount*) echo "    $(cf_ray)" ;; esac
    } >> "$LOG"

    # Immediate re-probe: distinguishes a one-off from a sustained window.
    sleep 2
    probe cf    "$CF_STATUS"    "$TMP/cf2"    &
    probe tls   "$TLS_STATUS"   "$TMP/tls2"   &
    probe plain "$PLAIN_STATUS" "$TMP/plain2" &
    wait
    {
      echo "    -- recheck 2s later --"
      pretty "cf"    "$TMP/cf2"
      pretty "tls"   "$TMP/tls2"
      pretty "plain" "$TMP/plain2"
    } >> "$LOG"
  fi

  if [ $((round % HEARTBEAT_EVERY)) -eq 0 ]; then
    log "[$(ts)] alive: $round rounds, $fail_rounds with failures"
  fi

  sleep "$INTERVAL"
done
