#!/usr/bin/env bash
# 在 Google Cloud Shell 執行，一次完成分帳網頁需要的 Firebase 設定：
#   curl -sL https://raw.githubusercontent.com/andy20060520-jpg/travel-itinerary/master/split-bill/setup-firebase.sh | bash
# 指定專案 ID：... | bash -s -- <專案ID>
# 可以重複執行，已完成的步驟會略過。
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/andy20060520-jpg/travel-itinerary/master/split-bill"
PAGES_DOMAIN="andy20060520-jpg.github.io"
LOCATION="europe-west1"

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok() { printf '  \033[32m✓ %s\033[0m\n' "$*"; }
fail() { printf '\n\033[1;31m✗ %s\033[0m\n' "$*" >&2; exit 1; }

PROJECT="${1:-}"
if [ -z "$PROJECT" ]; then
  PROJECT="$(gcloud projects list --filter='name:split-bill' --format='value(projectId)' | head -n1)"
fi
[ -n "$PROJECT" ] || fail "找不到名稱為 split-bill 的專案，請改用：bash -s -- <專案ID>"
gcloud config set project "$PROJECT" >/dev/null 2>&1
echo "專案：$PROJECT"

TOKEN="$(gcloud auth print-access-token)"
api() {
  # api <METHOD> <URL> [JSON body]
  local method="$1" url="$2" body="${3:-}"
  curl -sS -X "$method" "$url" \
    -H "Authorization: Bearer $TOKEN" \
    -H "X-Goog-User-Project: $PROJECT" \
    -H "Content-Type: application/json" \
    ${body:+--data "$body"}
}
json() { python3 -c "import json,sys; d=json.load(sys.stdin); print($1)"; }

step "1/6 啟用需要的 API（約 1 分鐘）"
gcloud services enable firebase.googleapis.com firestore.googleapis.com \
  firebaserules.googleapis.com identitytoolkit.googleapis.com --quiet
ok "API 已啟用"

step "2/6 建立 Firestore 資料庫（$LOCATION）"
if gcloud firestore databases describe --database='(default)' >/dev/null 2>&1; then
  ok "資料庫已存在，略過"
else
  gcloud firestore databases create --database='(default)' --location="$LOCATION" --type=firestore-native --quiet
  ok "資料庫建立完成"
fi

step "3/6 套用安全規則"
RULES="$(curl -sfL "$REPO_RAW/firestore.rules")" || fail "下載 firestore.rules 失敗"
RULESET_BODY="$(RULES="$RULES" python3 -c 'import json,os; print(json.dumps({"source":{"files":[{"name":"firestore.rules","content":os.environ["RULES"]}]}}))')"
RULESET="$(api POST "https://firebaserules.googleapis.com/v1/projects/$PROJECT/rulesets" "$RULESET_BODY" | json 'd.get("name") or d')"
case "$RULESET" in projects/*) ;; *) fail "建立規則失敗：$RULESET" ;; esac
RELEASE="projects/$PROJECT/releases/cloud.firestore"
RELEASE_BODY="{\"release\":{\"name\":\"$RELEASE\",\"rulesetName\":\"$RULESET\"}}"
RESULT="$(api PATCH "https://firebaserules.googleapis.com/v1/$RELEASE" "$RELEASE_BODY")"
if echo "$RESULT" | grep -q '"error"'; then
  RESULT="$(api POST "https://firebaserules.googleapis.com/v1/projects/$PROJECT/releases" "{\"name\":\"$RELEASE\",\"rulesetName\":\"$RULESET\"}")"
  echo "$RESULT" | grep -q '"error"' && fail "發布規則失敗：$RESULT"
fi
ok "規則已發布"

step "4/6 開啟匿名登入"
AUTH_CONFIG_URL="https://identitytoolkit.googleapis.com/admin/v2/projects/$PROJECT/config"
RESULT="$(api PATCH "$AUTH_CONFIG_URL?updateMask=signIn.anonymous.enabled" '{"signIn":{"anonymous":{"enabled":true}}}')"
if echo "$RESULT" | grep -q 'CONFIGURATION_NOT_FOUND'; then
  fail "Authentication 還沒初始化：請在 Firebase 主控台左側「建構 → Authentication」按一次「開始使用」，再重新執行這行指令。"
fi
echo "$RESULT" | grep -q '"error"' && fail "開啟匿名登入失敗：$RESULT"
ok "匿名登入已開啟"

step "5/6 授權網域 $PAGES_DOMAIN"
DOMAINS="$(api GET "$AUTH_CONFIG_URL" | json '",".join(d.get("authorizedDomains", []))')"
if echo ",$DOMAINS," | grep -q ",$PAGES_DOMAIN,"; then
  ok "已在授權清單中，略過"
else
  BODY="$(DOMAINS="$DOMAINS" NEW="$PAGES_DOMAIN" python3 -c 'import json,os; d=[x for x in os.environ["DOMAINS"].split(",") if x]; d.append(os.environ["NEW"]); print(json.dumps({"authorizedDomains":d}))')"
  RESULT="$(api PATCH "$AUTH_CONFIG_URL?updateMask=authorizedDomains" "$BODY")"
  echo "$RESULT" | grep -q '"error"' && fail "加入授權網域失敗：$RESULT"
  ok "已加入"
fi

step "6/6 建立網頁應用程式並取得設定碼"
APPS_URL="https://firebase.googleapis.com/v1beta1/projects/$PROJECT/webApps"
APP_ID="$(api GET "$APPS_URL" | json '(d.get("apps") or [{}])[0].get("appId","")')"
if [ -z "$APP_ID" ]; then
  OP="$(api POST "$APPS_URL" '{"displayName":"split-bill-web"}' | json 'd.get("name","")')"
  [ -n "$OP" ] || fail "建立網頁應用程式失敗"
  for _ in $(seq 1 30); do
    sleep 2
    APP_ID="$(api GET "https://firebase.googleapis.com/v1beta1/$OP" | json '(d.get("response") or {}).get("appId","")')"
    [ -n "$APP_ID" ] && break
  done
  [ -n "$APP_ID" ] || fail "等待網頁應用程式建立逾時，請重新執行"
fi
CONFIG="$(api GET "$APPS_URL/$APP_ID/config")"
ok "完成"

printf '\n\033[1;33m===== 請把下面這段整個複製，貼回給 Claude =====\033[0m\n'
echo "$CONFIG" | python3 -c '
import json, sys
d = json.load(sys.stdin)
keys = ["apiKey", "authDomain", "projectId", "storageBucket", "messagingSenderId", "appId"]
print("export const firebaseConfig = {")
for k in keys:
    print("  %s: %s," % (k, json.dumps(d.get(k) or "")))
print("};")
'
printf '\033[1;33m================================================\033[0m\n'
