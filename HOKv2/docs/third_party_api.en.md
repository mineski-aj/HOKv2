# Data Center Third-Party Query API

> Applies to: `hok_data_center_admin_svr` master, protocol `git.woa.com/trpcprotocol/esports_center/hok_data_center_svr v1.2.44`.
> Implementation: `services/third_party_stats.go` (entry) → `logic/third_party_stats.go` (logic); authentication is handled by `loginFilter` registered in `filter/filter.go` (shared library `go-common-module/trpc_filter.checkSign`).

| API | Purpose |
|---|---|
| [GetHeroWinRate](#1-getherowinrate--hero-win-rate) | Wins / losses and win rate of a hero within the given seasons |
| [GetPlayerHeroWinRate](#2-getplayerherowinrate--player-hero-win-rate) | Wins / losses, total appearances and win rate of a player account (OpenID) on a hero |
| [GetTeamVsTeam](#3-getteamvsteam--head-to-head-record) | Series / game wins, losses and win rates of Team A against Team B (from Team A's perspective) |

---

## 0. General Conventions

### 0.1 Endpoint

```
POST https://hok-esports.playerinfinite.com/datacenter/admin/api/{MethodName}
Content-Type: application/json
```

> Requests must go through the gateway. The server only verifies signatures on requests forwarded by the gateway; Pod ports are not exposed externally.

### 0.2 Signature Authentication (required headers)

All three APIs are marked `login_type: 3` in the proto (no login session check, signature check only). No Portal login ticket or cookie is required.

| Header | Required | Description |
|---|---|---|
| `X-AUTH-Appkey` | Yes | AppKey issued by Data Center |
| `X-AUTH-Timestamp` | Yes | Unix timestamp (seconds) |
| `X-AUTH-Nonce` | Recommended | Random string, included in the signature |
| `X-AUTH-Sign` | Yes | Signature, see algorithm below |

**Signature algorithm (HMAC-SHA256, lowercase hex):**

```
StringToSign = RequestURI + "\n" + AppKey + "\n" + Timestamp + "\n" + Nonce
Sign         = hex( HMAC_SHA256( key = AppSecret, data = StringToSign ) )
```

- `RequestURI` is always `/datacenter/admin/api/{MethodName}`, without the host or query string, e.g. `/datacenter/admin/api/GetHeroWinRate`.
- The four parts are joined by a single newline `\n`, with no trailing newline. If `Nonce` is omitted, it is treated as an empty string (the separating newline is still kept).

**Timestamp rules:**

- `Timestamp` must not be later than the server's current time (**no forward tolerance** — a client clock that is 1 second fast will fail; use the current time or subtract 1–2 seconds).
- `now - Timestamp` must be less than 24 hours.
- The server does not perform nonce-based replay protection; keep your AppSecret secure.

**Example (shell):**

```bash
APPKEY="your-app-key"
SECRET="your-app-secret"
METHOD="GetHeroWinRate"
URI="/datacenter/admin/api/${METHOD}"
TS=$(( $(date +%s) - 1 ))
NONCE=$(openssl rand -hex 8)
SIGN=$(printf '%s\n%s\n%s\n%s' "$URI" "$APPKEY" "$TS" "$NONCE" \
       | openssl dgst -sha256 -hmac "$SECRET" | awk '{print $NF}')

curl -X POST "https://hok-esports.playerinfinite.com${URI}" \
  -H "Content-Type: application/json" \
  -H "X-AUTH-Appkey: ${APPKEY}" \
  -H "X-AUTH-Timestamp: ${TS}" \
  -H "X-AUTH-Nonce: ${NONCE}" \
  -H "X-AUTH-Sign: ${SIGN}" \
  -d '{"hero_id":105,"season_ids":["MKL2026Spring"]}'
```

**Example (Go):**

```go
func sign(uri, appKey, appSecret, ts, nonce string) string {
	h := hmac.New(sha256.New, []byte(appSecret))
	h.Write([]byte(fmt.Sprintf("%s\n%s\n%s\n%s", uri, appKey, ts, nonce)))
	return hex.EncodeToString(h.Sum(nil))
}
```

**Example (Python):**

```python
import hmac, hashlib
def sign(uri, app_key, app_secret, ts, nonce=""):
    msg = f"{uri}\n{app_key}\n{ts}\n{nonce}".encode()
    return hmac.new(app_secret.encode(), msg, hashlib.sha256).hexdigest()
```

### 0.3 `season_ids` (Season Identifier)

- Format: `BrandName + SeasonName + StageName` concatenated directly (must exactly match the brand / season / stage names in the admin tournament configuration, case-sensitive), e.g. `MKL2026Spring` = `MKL` + `2026` + `Spring`.
- Multiple values are supported; the result is aggregated across all given seasons. The server trims leading / trailing whitespace and removes duplicates.
- If **any** season id does not match a tournament, the whole request fails with a parameter error (it is not silently ignored).

### 0.4 Statistics Rules (shared by all three APIs)

- Only **finished** games are counted (game status `Status = 4`), and the game must be configured in the admin schedule (not deleted).
- Win rate = wins ÷ total games (total includes games with no winner), rounded to 3 decimal places; returns `0` when the total is 0.
- If the season exists but contains no finished games: the request succeeds and all counts and rates are `0`.

### 0.5 Response Format

All responses below return **HTTP 200**; distinguish outcomes by the `ret` field in the body.

**Success**: the body is JSON (field names in snake_case; zero-value fields are always included):

```json
{ "ret": 0, "msg": "", ... }
```

> Note: `int64` fields (all `*_count`) are **serialized as strings** per the protobuf JSON mapping, e.g. `"win_count": "12"`; `double` fields (all `*_rate`) are numbers. Parse accordingly.

**Signature failure**:

```json
{ "ret": 401, "msg": "401 Unsigned", "auth_url": "" }
```

| msg | Cause |
|---|---|
| `401 Unsigned` | Missing `X-AUTH-Sign`, unregistered AppKey, or signature mismatch |
| `Sign timestamp error` | `X-AUTH-Timestamp` is later than the server's current time |
| `Sign is expired` | Timestamp is older than 24 hours, or timestamp is missing |

**Business error**: the body carries the error code, and the same information is also returned in response headers:

```json
{ "ret": 30055, "msg": "Parameter error.(30055)", "traceid": "3fc4cb2ae45143a4ad3211ee11f6c6d8" }
```

| Response header | Description |
|---|---|
| `trpc-func-ret` | Business error code (same as `ret`) |
| `trpc-error-msg` | Error message (localized text, with `(error code)` appended) |

| Error code | Meaning |
|---|---|
| `30055` | Invalid third-party query parameters (see "Parameter error conditions" for each API) |
| `10002` | System error (DB / internal exception), retryable |

> How to determine success: HTTP 200 **and** `ret == 0` in the body. When reporting an issue, please include the `traceid`.

---

## 1. GetHeroWinRate — Hero Win Rate

Wins / losses and win rate of a hero across all finished games within the given seasons (regardless of player or team).

`POST /datacenter/admin/api/GetHeroWinRate`

### Request Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `hero_id` | uint32 | Yes | Hero ID (in-game hero ID), must not be 0 |
| `season_ids` | string[] | Yes | Array of season identifiers, see [0.3](#03-season_ids-season-identifier) |

### Response Parameters

| Field | Type | Description |
|---|---|---|
| `ret` | int32 | 0 = success |
| `msg` | string | Message |
| `win_count` | int64 (string) | Wins: games in which the hero's team won |
| `lose_count` | int64 (string) | Losses: decided games in which the hero's team did not win |
| `win_rate` | double | Win rate = `win_count / total appearances`, 3 decimal places |

> Total appearances = all appearances of the hero within the range (including games with no winner), so `win_count + lose_count` may be less than total appearances.

### Parameter Error Conditions (30055)

- `hero_id` is 0
- `season_ids` is empty, all blank, or contains an id that matches no tournament

### Example

```json
// Request
{ "hero_id": 105, "season_ids": ["MKL2026Spring"] }

// Response
{ "ret": 0, "msg": "", "win_count": "5", "lose_count": "12", "win_rate": 0.294 }
```

---

## 2. GetPlayerHeroWinRate — Player Hero Win Rate

Wins / losses, total appearances and win rate of a player's game account (OpenID) on a hero within the given seasons.

`POST /datacenter/admin/api/GetPlayerHeroWinRate`

### Request Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `openid` | string | Yes | Player's game account OpenID; trimmed by the server and matched exactly against the player UID in game data |
| `hero_id` | uint32 | Yes | Hero ID, must not be 0 |
| `season_ids` | string[] | Yes | Array of season identifiers, see [0.3](#03-season_ids-season-identifier) |

> Statistics are per **single account**: the player table is not consulted, and multiple / changed accounts of the same player are not merged.

### Response Parameters

| Field | Type | Description |
|---|---|---|
| `ret` | int32 | 0 = success |
| `msg` | string | Message |
| `win_count` | int64 (string) | Wins |
| `lose_count` | int64 (string) | Losses (decided games only) |
| `win_rate` | double | Win rate = `win_count / total_count`, 3 decimal places |
| `total_count` | int64 (string) | Total appearances (including games with no winner) |

### Parameter Error Conditions (30055)

- `openid` is empty or all blank
- `hero_id` is 0
- `season_ids` is empty, all blank, or contains an id that matches no tournament

> If the OpenID does not exist or the account has never played the hero: the request succeeds, and all counts and rates are 0.

### Example (illustrative values)

```json
// Request
{ "openid": "1234567890123456789", "hero_id": 105, "season_ids": ["MKL2026Spring"] }

// Response
{ "ret": 0, "msg": "", "win_count": "6", "lose_count": "3", "win_rate": 0.667, "total_count": "9" }
```

---

## 3. GetTeamVsTeam — Head-to-Head Record

Head-to-head record of Team A against Team B within the given seasons, counted **from Team A's perspective** (A wins count as win, A losses count as lose); swap A and B to get Team B's perspective.

`POST /datacenter/admin/api/GetTeamVsTeam`

### Request Parameters

| Field | Type | Required | Description |
|---|---|---|---|
| `team_a` | string | Yes | Team A short name (the "short name" in the admin team configuration; exact match, trimmed) |
| `team_b` | string | Yes | Team B short name; must differ from `team_a` |
| `season_ids` | string[] | Yes | Array of season identifiers, see [0.3](#03-season_ids-season-identifier) |

### Response Parameters

| Field | Type | Description |
|---|---|---|
| `ret` | int32 | 0 = success |
| `msg` | string | Message |
| `match_win_count` | int64 (string) | Series (BO) wins for Team A |
| `match_lose_count` | int64 (string) | Series losses for Team A |
| `battle_win_count` | int64 (string) | Game (single match) wins for Team A |
| `battle_lose_count` | int64 (string) | Game losses for Team A |
| `match_win_rate` | double | Series win rate = series wins / total finished series, 3 decimal places |
| `battle_win_rate` | double | Game win rate = game wins / total games, 3 decimal places |

**Counting rules:**

- Series: only BOs between Team A and Team B are counted; the result is determined by the winning team configured in the schedule. Only finished BOs are counted (all games played, or either side has won more than half, or the end time has passed); ongoing BOs are excluded.
- Games: only single games between Team A and Team B are counted; the result is determined by the winning side combined with each side's team.
- Home / away and side order do not matter; both directions are counted.

### Parameter Error Conditions (30055)

- `team_a` or `team_b` is empty / all blank
- `team_a` equals `team_b`
- Either short name does not exist in the team configuration, or matches multiple teams (duplicate short name)
- `season_ids` is empty, all blank, or contains an id that matches no tournament

### Example (illustrative values)

```json
// Request
{ "team_a": "AG", "team_b": "EStar", "season_ids": ["MKL2026Spring"] }

// Response
{
  "ret": 0, "msg": "",
  "match_win_count": "2", "match_lose_count": "1",
  "battle_win_count": "7", "battle_lose_count": "5",
  "match_win_rate": 0.667, "battle_win_rate": 0.583
}
```

---

## 4. Onboarding and Configuration (server side)

- AppKey / AppSecret are registered in the service configuration `third-party.app_keys` (an `AppKey: Secret` map; each third party gets its own key). They take effect when `third-party.enable: 1`; if `enable` is not 1, all signatures fail.
- Keys are loaded once at process startup — **adding / rotating keys or toggling the switch requires a service restart**.
- Authentication failures are reported to monitoring by AppKey (unregistered AppKeys are grouped as `unknown`).
