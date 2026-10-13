#!/usr/bin/env bash
#
# startup — bring up the whole Cadence stack for local development.
#
# Starts Postgres 16 (Docker), applies migrations, then launches the API and
# the site / app / internal dev servers. Press Ctrl-C to stop everything.
#
# Usage:
#   ./startup              start Postgres + all four services
#   ./startup api app      start only the named services (plus Postgres)
#
# Services: api (8000), site (3000), app (3001), internal (3002)
#
# Env: NO_COLOR=1 disables colours · PG_CONTAINER / PG_USER / PG_DB override Postgres

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOG_DIR="$ROOT/.logs"
SETUP_LOG="$LOG_DIR/setup.log"

PG_CONTAINER="${PG_CONTAINER:-cadence-postgres}"
PG_USER="${PG_USER:-chamoda}"
PG_DB="${PG_DB:-cadence}"
READY_TIMEOUT="${READY_TIMEOUT:-90}"

ALL_SERVICES=(api site app internal)

# --- Styling ---------------------------------------------------------------

if [ -t 1 ] && [ -z "${NO_COLOR:-}" ]; then
  RST=$'\033[0m'; BOLD=$'\033[1m'; DIM=$'\033[2m'
  RED=$'\033[31m'; GRN=$'\033[32m'; YLW=$'\033[33m'; BLU=$'\033[34m'
  MAG=$'\033[35m'; CYN=$'\033[36m'
  HIDE=$'\033[?25l'; SHOW=$'\033[?25h'; CLR=$'\033[2K'
  TTY=1
else
  RST=''; BOLD=''; DIM=''; RED=''; GRN=''; YLW=''; BLU=''; MAG=''; CYN=''
  HIDE=''; SHOW=''; CLR=''
  TTY=0
fi

OK="${GRN}✔${RST}"; BAD="${RED}✖${RST}"; WARN="${YLW}⚠${RST}"; ARROW="${CYN}▸${RST}"
SPIN_FRAMES=(⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏)

STEP_TOTAL=4
STEP_N=0

banner() {
  printf '\n'
  printf '%s   ____          _                          %s\n' "$CYN" "$RST"
  printf '%s  / ___|__ _  __| | ___ _ __   ___ ___      %s\n' "$CYN" "$RST"
  printf '%s | |   / _` |/ _` |/ _ \ `_ \ / __/ _ \     %s\n' "$BLU" "$RST"
  printf '%s | |__| (_| | (_| |  __/ | | | (_|  __/     %s\n' "$MAG" "$RST"
  printf '%s  \____\__,_|\__,_|\___|_| |_|\___\___|     %s\n' "$MAG" "$RST"
  printf '  %sLocal development stack%s\n\n' "$DIM" "$RST"
}

step() {
  STEP_N=$((STEP_N + 1))
  printf '%s[%d/%d]%s %s%s%s\n' "$DIM" "$STEP_N" "$STEP_TOTAL" "$RST" "$BOLD" "$*" "$RST"
}

ok()   { printf '  %s %s\n' "$OK" "$*"; }
info() { printf '  %s %s\n' "$ARROW" "$*"; }
warn() { printf '  %s %s\n' "$WARN" "$*" >&2; }
fail() { printf '  %s %s%s%s\n' "$BAD" "$RED" "$*" "$RST" >&2; }
die()  { printf '\n%s error:%s %s\n\n' "$RED$BOLD" "$RST" "$*" >&2; exit 1; }

# Animated spinner while a background pid is alive (plain line when not a TTY).
spin_pid() {
  local pid="$1" label="$2" i=0
  if [ "$TTY" -eq 0 ]; then printf '  … %s\n' "$label"; return 0; fi
  while kill -0 "$pid" 2>/dev/null; do
    printf '\r%s  %s%s%s %s' "$CLR" "$CYN" "${SPIN_FRAMES[$((i % 10))]}" "$RST" "$label"
    i=$((i + 1)); sleep 0.1
  done
  printf '\r%s' "$CLR"
}

# run_step "label" cmd args... — runs quietly, logs to setup.log, shows spinner.
run_step() {
  local label="$1"; shift
  local rc=0 pid
  printf '\n$ %s\n' "$*" >>"$SETUP_LOG"
  "$@" >>"$SETUP_LOG" 2>&1 &
  pid=$!
  spin_pid "$pid" "$label"
  wait "$pid" || rc=$?
  if [ "$rc" -eq 0 ]; then
    ok "$label"
  else
    fail "$label (exit $rc)"
    printf '%s    last log lines (%s):%s\n' "$DIM" ".logs/setup.log" "$RST" >&2
    tail -n 12 "$SETUP_LOG" | sed "s/^/    ${DIM}│${RST} /" >&2
    exit "$rc"
  fi
}

# wait_until "label" timeout cmd args... — polls with a spinner.
wait_until() {
  local label="$1" timeout="$2"; shift 2
  local start=$SECONDS i=0
  while ! "$@" >/dev/null 2>&1; do
    if [ $((SECONDS - start)) -ge "$timeout" ]; then
      printf '\r%s' "$CLR"; return 1
    fi
    if [ "$TTY" -eq 1 ]; then
      printf '\r%s  %s%s%s %s %s(%ds)%s' "$CLR" "$CYN" "${SPIN_FRAMES[$((i % 10))]}" "$RST" \
        "$label" "$DIM" $((SECONDS - start)) "$RST"
    fi
    i=$((i + 1)); sleep 0.2
  done
  printf '\r%s' "$CLR"
}

service_dir() {
  case "$1" in
    api)      printf '%s' "$ROOT/api" ;;
    site)     printf '%s' "$ROOT/site" ;;
    app)      printf '%s' "$ROOT/app" ;;
    internal) printf '%s' "$ROOT/internal" ;;
    *)        return 1 ;;
  esac
}

service_port() {
  case "$1" in
    api)      printf '8000' ;;
    site)     printf '3000' ;;
    app)      printf '3001' ;;
    internal) printf '3002' ;;
    *)        return 1 ;;
  esac
}

port_open() { (exec 3<>"/dev/tcp/127.0.0.1/$1") 2>/dev/null; }

# --- Pick which services to run -------------------------------------------

if [ "$#" -gt 0 ]; then
  SERVICES=()
  for svc in "$@"; do
    service_port "$svc" >/dev/null || die "unknown service '$svc' (choose: ${ALL_SERVICES[*]})"
    SERVICES+=("$svc")
  done
else
  SERVICES=("${ALL_SERVICES[@]}")
fi

has_service() {
  local want="$1" svc
  for svc in "${SERVICES[@]}"; do
    [ "$svc" = "$want" ] && return 0
  done
  return 1
}

mkdir -p "$LOG_DIR"
: >"$SETUP_LOG"
PIDS=()
STATUS=()

cleanup() {
  printf '%s' "$SHOW"
  printf '\n%s Shutting down...\n' "$ARROW"
  local pid
  for pid in ${PIDS[@]+"${PIDS[@]}"}; do
    kill "$pid" 2>/dev/null || true
  done
  wait 2>/dev/null || true
  printf '  %s Stopped. Postgres container left running (%s).\n\n' "$OK" "$PG_CONTAINER"
}
trap 'cleanup; exit 0' INT TERM
trap 'printf "%s" "$SHOW"' EXIT
printf '%s' "$HIDE"

banner

# --- 1. Preflight ----------------------------------------------------------

step "Preflight checks"

if ! command -v node >/dev/null 2>&1; then
  NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  # shellcheck disable=SC1091
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
fi

command -v uv >/dev/null 2>&1 || die "'uv' not found — install it from https://docs.astral.sh/uv/"
ok "uv $(uv --version 2>/dev/null | awk '{print $2}')"
command -v docker >/dev/null 2>&1 || die "'docker' not found — needed to run Postgres 16"
ok "docker $(docker --version 2>/dev/null | sed 's/Docker version //; s/,.*//')"

if has_service api && [ ! -f "$ROOT/api/.env" ]; then
  warn "api/.env missing — copying api/.env.example (edit it if needed)"
  cp "$ROOT/api/.env.example" "$ROOT/api/.env"
fi

if has_service site || has_service app || has_service internal; then
  command -v npm >/dev/null 2>&1 \
    || die "'npm' not found — install Node.js 24+ (try 'nvm use' in a front-end folder)"
  NODE_MAJOR="$(node -v | sed 's/^v//; s/\..*//')"
  if [ "$NODE_MAJOR" -ge 24 ]; then
    ok "node $(node -v)"
  else
    warn "Node $NODE_MAJOR detected; the front ends expect 24+"
  fi
fi

for svc in "${SERVICES[@]}"; do
  p="$(service_port "$svc")"
  if port_open "$p"; then
    die "port $p is already in use (needed by '$svc') — stop whatever is listening on it"
  fi
done
ok "ports free: $(for s in "${SERVICES[@]}"; do printf '%s ' "$(service_port "$s")"; done)"

# --- 2. Postgres -----------------------------------------------------------

step "Postgres 16"

if docker ps --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  ok "already running ($PG_CONTAINER)"
elif docker ps -a --format '{{.Names}}' | grep -qx "$PG_CONTAINER"; then
  run_step "Starting container ($PG_CONTAINER)" docker start "$PG_CONTAINER"
else
  run_step "Creating container ($PG_CONTAINER)" \
    docker run -d --name "$PG_CONTAINER" \
      -e "POSTGRES_USER=$PG_USER" \
      -e "POSTGRES_DB=$PG_DB" \
      -e POSTGRES_HOST_AUTH_METHOD=trust \
      -p 5432:5432 \
      postgres:16
fi

pg_ready() { docker exec "$PG_CONTAINER" pg_isready -U "$PG_USER" -d "$PG_DB"; }
wait_until "Waiting for Postgres to accept connections" 30 pg_ready \
  || die "Postgres did not become ready in time"
ok "accepting connections  ${DIM}(db: $PG_DB, user: $PG_USER)${RST}"

# --- 3. Dependencies & migrations -----------------------------------------

step "Dependencies & migrations"

for svc in "${SERVICES[@]}"; do
  dir="$(service_dir "$svc")"
  if [ "$svc" = "api" ]; then
    if [ -d "$dir/.venv" ]; then
      ok "api dependencies present"
    else
      run_step "Installing API dependencies (uv sync)" bash -c "cd '$dir' && uv sync"
    fi
    run_step "Applying migrations (alembic upgrade head)" \
      bash -c "cd '$dir' && uv run alembic upgrade head"
  else
    if [ -d "$dir/node_modules" ]; then
      ok "$svc dependencies present"
    else
      run_step "Installing $svc dependencies (npm install)" bash -c "cd '$dir' && npm install"
    fi
  fi
done

# --- 4. Launch -------------------------------------------------------------

step "Launching services"

start_service() {
  local name="$1" dir
  dir="$(service_dir "$name")"
  case "$name" in
    api) ( cd "$dir" && exec uv run fastapi dev --reload-dir app ) >"$LOG_DIR/$name.log" 2>&1 & ;;
    *)   ( cd "$dir" && exec npm run dev -- --port "$(service_port "$name")" ) >"$LOG_DIR/$name.log" 2>&1 & ;;
  esac
  PIDS+=("$!")
}

for svc in "${SERVICES[@]}"; do
  start_service "$svc"
  STATUS+=("starting")
done

# Wait for every service to listen on its port (fail fast if the process dies).
service_up() {
  local idx="$1" port="$2"
  kill -0 "${PIDS[$idx]}" 2>/dev/null || return 2
  port_open "$port"
}

for i in "${!SERVICES[@]}"; do
  svc="${SERVICES[$i]}"; port="$(service_port "$svc")"
  start=$SECONDS; n=0; state=""
  while :; do
    if ! kill -0 "${PIDS[$i]}" 2>/dev/null; then state="died"; break; fi
    if port_open "$port"; then state="up"; break; fi
    if [ $((SECONDS - start)) -ge "$READY_TIMEOUT" ]; then state="timeout"; break; fi
    if [ "$TTY" -eq 1 ]; then
      printf '\r%s  %s%s%s %s %s:%s%s' "$CLR" "$CYN" "${SPIN_FRAMES[$((n % 10))]}" "$RST" \
        "$svc" "$DIM" "$port" "$RST"
    fi
    n=$((n + 1)); sleep 0.2
  done
  printf '\r%s' "$CLR"
  case "$state" in
    up)      STATUS[$i]="up";   ok "$svc ${DIM}ready on :$port in $((SECONDS - start))s${RST}" ;;
    died)    STATUS[$i]="down"; fail "$svc exited during startup" ;;
    timeout) STATUS[$i]="slow"; warn "$svc not listening on :$port after ${READY_TIMEOUT}s (still running)" ;;
  esac
  if [ "$state" = "died" ]; then
    tail -n 10 "$LOG_DIR/$svc.log" | sed "s/^/    ${DIM}│${RST} /" >&2
  fi
done

# --- Summary ---------------------------------------------------------------

service_url() {
  case "$1" in
    api) printf 'http://localhost:8000' ;;
    *)   printf 'http://localhost:%s' "$(service_port "$1")" ;;
  esac
}

printf '\n%s┌──────────────────────────────────────────────────────┐%s\n' "$CYN" "$RST"
printf '%s│%s  %sCadence stack%s  %s— up in %ss%s%*s%s│%s\n' "$CYN" "$RST" "$BOLD" "$RST" "$DIM" "$SECONDS" "$RST" \
  $((30 - ${#SECONDS})) "" "$CYN" "$RST"
printf '%s├──────────────────────────────────────────────────────┤%s\n' "$CYN" "$RST"
for i in "${!SERVICES[@]}"; do
  svc="${SERVICES[$i]}"
  case "${STATUS[$i]}" in
    up)   icon="$OK" ;;
    slow) icon="$WARN" ;;
    *)    icon="$BAD" ;;
  esac
  printf '%s│%s  %s  %s%-9s%s %s%-27s%s %s│%s\n' "$CYN" "$RST" "$icon" "$BOLD" "$svc" "$RST" \
    "$BLU" "$(service_url "$svc")" "$RST" "$CYN" "$RST"
done
printf '%s│%s  %s  %s%-9s%s %s%-27s%s %s│%s\n' "$CYN" "$RST" "$OK" "$BOLD" "postgres" "$RST" \
  "$DIM" "localhost:5432" "$RST" "$CYN" "$RST"
printf '%s└──────────────────────────────────────────────────────┘%s\n' "$CYN" "$RST"
if has_service api; then
  printf '  %sAPI docs:%s  http://localhost:8000/app/docs\n' "$DIM" "$RST"
fi
printf '  %sTail logs:%s tail -f %s/*.log\n' "$DIM" "$RST" "$LOG_DIR"
printf '  %sPress Ctrl-C to stop.%s\n\n' "$DIM" "$RST"

# --- Monitor ---------------------------------------------------------------

while :; do
  alive=0
  for i in "${!SERVICES[@]}"; do
    if kill -0 "${PIDS[$i]}" 2>/dev/null; then
      alive=1
    elif [ "${STATUS[$i]}" != "down" ]; then
      STATUS[$i]="down"
      fail "${SERVICES[$i]} stopped unexpectedly — see .logs/${SERVICES[$i]}.log"
      tail -n 8 "$LOG_DIR/${SERVICES[$i]}.log" | sed "s/^/    ${DIM}│${RST} /" >&2
    fi
  done
  [ "$alive" -eq 1 ] || break
  sleep 2
done

die "all services have stopped"
