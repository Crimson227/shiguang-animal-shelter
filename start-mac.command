#!/bin/bash
set -euo pipefail
umask 077
cd "$(dirname "$0")"
project=$(pwd -P)
fail() { printf '%s\n' "$*" >&2; exit 1; }
[[ $(uname -s) == Darwin ]] || fail '这个启动文件用于 macOS。'

# Finder may start Terminal without Homebrew on PATH.
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
if command -v brew >/dev/null; then
  export PATH="$(brew --prefix node@22)/bin:$PATH"
  brew_mysql="$(brew --prefix mysql@8.4)/bin"
  if [[ -x "$brew_mysql/mysqld" ]]; then MYSQL_BIN="${MYSQL_BIN:-$brew_mysql}"; fi
fi
export MYSQL_BIN="${MYSQL_BIN:-/usr/local/mysql/bin}"
command -v node >/dev/null && command -v npm >/dev/null && [[ -x "$MYSQL_BIN/mysqld" ]] ||
  fail '请先安装 Node.js 和 MySQL，在终端执行 brew install node@22 mysql@8.4 后再启动。'
node -e 'const [a,b]=process.versions.node.split(".").map(Number); process.exit(a>22||a===22&&b>=12?0:1)' ||
  fail '请安装 Node.js 22.12 或更新版本。'
"$MYSQL_BIN/mysqld" --no-defaults --version | grep -q ' 8\.4\.' || fail '此启动器需要 MySQL 8.4。'

state="${SHELTER_DATA_HOME:-$HOME/Library/Application Support/ShiguangShelter}"
instance="$state/instance"
export PORT="${PORT:-27470}" DB_PORT="${DB_PORT:-27472}" DB_HOST=127.0.0.1 DB_NAME=shiguang_shelter DB_USER=shelter_app
for port in "$PORT" "$DB_PORT"; do
  [[ "$port" =~ ^[1-9][0-9]{0,4}$ ]] && ((port <= 65535)) || fail '端口应为 1 到 65535 之间的整数。'
done
[[ "$PORT" != "$DB_PORT" ]] || fail '网页和数据库需要两个不同的端口。'
url="http://127.0.0.1:$PORT"
health="$url/api/health?dbHost=$DB_HOST&dbPort=$DB_PORT&dbName=$DB_NAME"
ready() { curl -fsS --max-time 2 "$health" 2>/dev/null | node -e 'let s="";process.stdin.on("data",v=>s+=v).on("end",()=>{try{const j=JSON.parse(s);process.exit(j.ok&&j.targetVerified&&j.service==="shiguang-animal-shelter"?0:1)}catch{process.exit(1)}})'; }
show_site() {
  printf '领养大厅：%s/catalog\n管理后台：%s/\n' "$url" "$url"
  if [[ "${SHELTER_OPEN_BROWSER:-1}" == 1 ]]; then open "$url/catalog" || true; fi
}
if [[ -d "$instance" ]] && ready; then show_site; exit 0; fi
mkdir -p "$state"
for dir in server client; do
  stamp="$dir/node_modules/.shiguang-lock"
  digest="$(node -p "process.version+'-'+process.arch")-$(shasum -a 256 "$dir/package-lock.json" | cut -d' ' -f1)"
  if [[ ! -f "$stamp" ]] || [[ $(cat "$stamp") != "$digest" ]]; then
    npm ci --prefix "$dir" --no-audit --no-fund
    printf '%s\n' "$digest" > "$stamp"
  fi
done
npm --prefix client run build

session=$(mktemp -d /tmp/shiguang.XXXXXXXX)
socket="$session/mysql.sock"
db_pid='' app_pid=''
stop_db() { if [[ -n "$db_pid" ]]; then kill -TERM "$db_pid" 2>/dev/null || true; wait "$db_pid" 2>/dev/null || true; db_pid=''; fi; }
cleanup() {
  if [[ -n "$app_pid" ]]; then kill -TERM "$app_pid" 2>/dev/null || true; wait "$app_pid" 2>/dev/null || true; fi
  stop_db
  rm -f "$session/initialize.sql" "$session/mysql.sock" "$session/mysql.sock.lock" "$session/mysql.pid"
  rmdir "$session" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 0' HUP INT TERM
root_sql() { MYSQL_PWD="$root_password" "$MYSQL_BIN/mysql" --no-defaults --protocol=SOCKET --socket="$socket" --user=root --default-character-set=utf8mb4 "$@"; }
start_db() {
  "$MYSQL_BIN/mysqld" --no-defaults --basedir="$(dirname "$MYSQL_BIN")" --datadir="$LOCALAPPDATA/mysql" \
    --socket="$socket" --pid-file="$session/mysql.pid" --log-error="$LOCALAPPDATA/mysql.log" \
    --bind-address=127.0.0.1 --port="$DB_PORT" --mysqlx=OFF --skip-log-bin "$@" &
  db_pid=$!
  for ((i=0; i<90; i++)); do
    kill -0 "$db_pid" 2>/dev/null || fail "数据库未能启动，请查看 $LOCALAPPDATA/mysql.log（数据库端口 $DB_PORT）。"
    if root_sql -Nse 'SELECT 1' >/dev/null 2>&1; then return; fi
    sleep 1
  done
  fail "数据库启动超时，请查看 $LOCALAPPDATA/mysql.log。"
}

if [[ ! -d "$instance" ]]; then
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    [[ -t 0 ]] || fail '首次启动需要在终端输入管理员密码。'
    IFS= read -r -s -p '为本机管理员 admin 设置密码（至少 8 个字符，输入时不显示）：' ADMIN_PASSWORD
    printf '\n'
    IFS= read -r -s -p '请再输入一次：' confirmation
    printf '\n'
    [[ "$ADMIN_PASSWORD" == "$confirmation" ]] || fail '两次密码不同，请重新启动。'
    unset confirmation
  fi
  export ADMIN_USERNAME=admin ADMIN_PASSWORD
  node -e 'const s=process.env.ADMIN_PASSWORD;process.exit(s.length>=8&&Buffer.byteLength(s)<=72?0:1)' ||
    fail '管理员密码至少 8 个字符，最多 72 个 UTF-8 字节。'
  export LOCALAPPDATA
  LOCALAPPDATA=$(mktemp -d "$state/install.XXXXXXXX")
  runtime="$LOCALAPPDATA/AnimalShelterMySQL"
  mkdir "$runtime"
  root_password=$(openssl rand -hex 32)
  export ANIMAL_SHELTER_DB_PASSWORD
  ANIMAL_SHELTER_DB_PASSWORD=$(openssl rand -hex 32)
  printf '{"rootPassword":"%s","appPassword":"%s"}\n' "$root_password" "$ANIMAL_SHELTER_DB_PASSWORD" > "$runtime/credentials.json"
  openssl rand -base64 32 > "$runtime/backup.key"
  cat > "$session/initialize.sql" <<SQL
ALTER USER 'root'@'localhost' IDENTIFIED BY '$root_password';
CREATE USER 'root'@'127.0.0.1' IDENTIFIED BY '$root_password';
GRANT ALL PRIVILEGES ON *.* TO 'root'@'127.0.0.1' WITH GRANT OPTION;
CREATE DATABASE shiguang_shelter CHARACTER SET utf8mb4;
CREATE USER 'shelter_app'@'127.0.0.1' IDENTIFIED BY '$ANIMAL_SHELTER_DB_PASSWORD';
GRANT ALL PRIVILEGES ON shiguang_shelter.* TO 'shelter_app'@'127.0.0.1';
SQL
  printf '正在建立本机数据库和示例档案…\n'
  "$MYSQL_BIN/mysqld" --no-defaults --initialize-insecure --basedir="$(dirname "$MYSQL_BIN")" --datadir="$LOCALAPPDATA/mysql" --log-error="$LOCALAPPDATA/mysql.log"
  start_db --init-file="$session/initialize.sql"
  rm -f "$session/initialize.sql"
  root_sql "$DB_NAME" < database/init.sql
  (cd server && node setup.js && node --input-type=module -e 'import {migrate} from "./migrations.js"; import {pool} from "./db.js"; try { await migrate(); } finally { await pool.end(); }' &&
    node seed-community-content.js && node enrich-sample-data.js && node curate-animal-profiles.js)
  unset ADMIN_PASSWORD
  stop_db
  node -e 'require("node:fs").renameSync(process.argv[1],process.argv[2])' "$LOCALAPPDATA" "$instance"
fi
export LOCALAPPDATA="$instance"
credentials="$instance/AnimalShelterMySQL/credentials.json"
root_password=$(node -p 'require(process.argv[1]).rootPassword' "$credentials")
export ANIMAL_SHELTER_DB_PASSWORD
ANIMAL_SHELTER_DB_PASSWORD=$(node -p 'require(process.argv[1]).appPassword' "$credentials")
start_db
unset root_password
node "$project/server/index.js" &
app_pid=$!
for ((i=0; i<90; i++)); do
  kill -0 "$app_pid" 2>/dev/null || fail "网站未能启动，请检查端口 $PORT 是否被占用。"
  if ready; then
    show_site
    printf '保留这个窗口即可使用。按 Control+C 停止。\n'
    wait "$app_pid"
    exit $?
  fi
  sleep 1
done
fail '网站启动超时，请查看上面的错误信息。'
