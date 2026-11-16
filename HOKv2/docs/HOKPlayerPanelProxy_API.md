# HOKPlayerPanelProxy API

Raw passthrough proxy for the live match player panel data.

## Overview

`HOKPlayerPanelProxy` forwards the request to the upstream endpoint
`/hok/realtime/panel/player` and returns the **upstream response body as-is**.

The service does **no filtering, no aggregation, no field renaming, and no
field-level (de)serialization** of the payload. The JSON bytes received by the
caller are the bytes returned by the upstream service -- this is a raw data
straight pull, not a reshaped response. No response schema is maintained for
this method; `HOKPlayerPanelProxyRsp` in the protobuf definition is a placeholder
type only and must not be used to parse the response.

The RPC is registered under the `HOKRealTimeDataSvr` service and uses exactly
the same authentication chain as `HOKBattleList`.

## Endpoint

| Item | Value |
| --- | --- |
| Method | `POST` |
| URL | `https://hok-sg-match.playerinfinite.com/match_data/api/HOKPlayerPanelProxy` |
| Content-Type | `application/json` |
| Authentication | SignAuth (`X-AUTH-*` headers) |

This follows the same host and path convention as `HOKBattleList`
(`/match_data/api/HOKBattleList`). Note that `POST /api/HOKPlayerPanelProxy`
in the Swagger spec is the service-relative path; the public gateway mounts it
under the `/match_data` prefix.

## Authentication

### Credentials

An `app_id` / `app_secret` pair is required. Request one from the HOK API
platform owners listed in the *HOK-Esports Data API document*. Keep the
`app_secret` confidential -- it is the HMAC key.

### Headers

| Header | Description |
| --- | --- |
| `X-AUTH-Appkey` | Your `app_id` |
| `X-AUTH-Sign` | Signature, lowercase hex SHA-256 HMAC |
| `X-AUTH-Timestamp` | Unix timestamp in **seconds** (10 digits) at signing time |
| `X-AUTH-Nonce` | Arbitrary string; recommended not to exceed 128 bytes |

All four headers are mandatory in production. A missing or empty
`X-AUTH-Sign` is rejected immediately.

### Signature algorithm

```
sign = hex( HMAC-SHA256( app_secret,
                        sign_uri + "\n" + app_id + "\n" + timestamp + "\n" + nonce ) )
```

`sign_uri` is the request path used by the server-side check, built as
`admin-base-api + methodName`. It contains **no host, no query string, and no
trailing slash**. For the default deployment it is:

```
/match_data/api/HOKPlayerPanelProxy
```

> If a correctly signed request is rejected with `401`, the server may be
> configured with a different `admin-base-api`. Retry the signature with
> `/api/HOKPlayerPanelProxy` (keep the request URL unchanged). Reuse the
> `hok_api_demo_python.py` from the HOK-Esports Data API document where
> possible -- it already encodes the prefix that matches the live deployment.

### Timestamp rules

- Seconds, not milliseconds.
- Must not be ahead of the server clock (`Sign timestamp error`).
- Expires 24 hours after signing (`Sign is expired`). The public document also
  mentions a 1-hour validity in one example; generating a fresh signature for
  every request (or refreshing every ~30 minutes) satisfies either rule.

### Python reference

```python
import hashlib
import hmac
import json
import time
import uuid
import urllib.request

app_id = "<app_id>"
app_secret = "<app_secret>"
sign_uri = "/match_data/api/HOKPlayerPanelProxy"

ts = str(int(time.time()))
nonce = uuid.uuid4().hex
message = "\n".join((sign_uri, app_id, ts, nonce))
sign = hmac.new(app_secret.encode(), message.encode(), hashlib.sha256).hexdigest()

body = json.dumps({"ob_openid": "14518216980739862105"}).encode()
req = urllib.request.Request(
    "https://hok-sg-match.playerinfinite.com/match_data/api/HOKPlayerPanelProxy",
    data=body,
    method="POST",
    headers={
        "Content-Type": "application/json",
        "X-AUTH-Appkey": app_id,
        "X-AUTH-Timestamp": ts,
        "X-AUTH-Nonce": nonce,
        "X-AUTH-Sign": sign,
    },
)
with urllib.request.urlopen(req, timeout=10) as resp:
    print(resp.status, resp.read().decode("utf-8", errors="replace"))
```

### cURL reference

```bash
APP_ID='<app_id>'
APP_SECRET='<app_secret>'
URI='/match_data/api/HOKPlayerPanelProxy'
TS=$(date +%s)
NONCE=$(uuidgen | tr 'A-Z' 'a-z')
SIGN=$(python3 -c 'import hmac,hashlib,sys;print(hmac.new(sys.argv[1].encode(),"\n".join(sys.argv[2:]).encode(),hashlib.sha256).hexdigest())' \
  "$APP_SECRET" "$URI" "$APP_ID" "$TS" "$NONCE")

curl -sS -i -X POST \
  'https://hok-sg-match.playerinfinite.com/match_data/api/HOKPlayerPanelProxy' \
  -H 'Content-Type: application/json' \
  -H "X-AUTH-Appkey: $APP_ID" \
  -H "X-AUTH-Timestamp: $TS" \
  -H "X-AUTH-Nonce: $NONCE" \
  -H "X-AUTH-Sign: $SIGN" \
  --data-raw '{"ob_openid":"14518216980739862105"}'
```

### Ready-to-use script

`docs/testing/call_hok_player_panel_proxy.py` implements the above with no
third-party dependencies:

```bash
export HOK_APP_ID='<app_id>' HOK_APP_SECRET='<app_secret>'
python3 docs/testing/call_hok_player_panel_proxy.py --ob-openid 14518216980739862105

# print the request without sending it
python3 docs/testing/call_hok_player_panel_proxy.py --dry-run --ob-openid 14518216980739862105
```

Useful flags: `--sign-uri` (override the signature path), `--raw` (print the
response body verbatim for byte comparison), `--istest` (test environment,
appends `?istest=1` and skips signing), `--direct` + `--no-sign` (call a Pod
directly on port 8000 using the fully qualified tRPC RPC name).

## Request body

A JSON object. All five fields are **optional**. Only non-empty / non-zero
values are forwarded to the upstream query string; the service does not apply
any default values.

| Field | Type | Upstream query key | Description |
| --- | --- | --- | --- |
| `ob_openid` | string | `ob_openid` | Observer openid |
| `timestamp` | uint32 | `timestamp` | Timestamp |
| `player_openid` | string | `player_openid` | Player openid |
| `scheduleid` | string | `scheduleid` | Schedule ID |
| `round` | uint32 | `round` | Round / game number |

Example:

```json
{
  "ob_openid": "14518216980739862105",
  "player_openid": "<player_openid>",
  "scheduleid": "<scheduleid>",
  "round": 3,
  "timestamp": 1730000000
}
```

> **Field naming matters.** The protobuf field names are lower snake case
> (`ob_openid`, `player_openid`). JSON names (`obOpenid`, `playerOpenid`) are
> also accepted. The `ObOpenId` spelling used by `HOKBattleList` in the public
> document is **not** a field of this method: unknown fields are silently
> ignored, so sending `{"ObOpenId": "..."}` produces an empty request and the
> upstream is called without any query parameter. No error is raised.

An empty body `{}` is valid; the upstream then applies its own default
selection. In practice, supply at least one real identifier (`ob_openid` or
`player_openid`) to get a deterministic result.

## Response

- **Success**: HTTP `200` with the upstream `/hok/realtime/panel/player`
  response body, byte-for-byte, and `Content-Type: application/json`.
- The body is **not** wrapped. A response such as `{"rawBody":"<base64>"}`
  means the passthrough serialization did not take effect and should be
  reported.

```json
{
  "...": "upstream player panel fields, unmodified"
}
```

### Known limitations

- The upstream HTTP status code and response headers are not propagated.
  Upstream `4xx` / `5xx` bodies are returned with HTTP `200`. **Inspect the
  response body, not only the status code**, and treat HTML or an upstream
  error object as a failure.
- Go's default HTTP transport transparently decompresses gzip responses while
  the `Content-Encoding` header is dropped, so strict byte equality does not
  hold for compressed upstream responses.
- No response schema is published. Consumers must follow the upstream
  `/hok/realtime/panel/player` contract directly.

## Errors and rate limits

| Case | Behaviour |
| --- | --- |
| Missing / invalid signature | `401`, body `{"Ret":401,"Msg":"401 Unsigned"}` |
| Timestamp in the future | `401`, `Sign timestamp error` |
| Expired timestamp (>24h) | `401`, `Sign is expired` |
| Rate limit exceeded | Rate-limit error from the service error pipeline |
| Upstream failure | Currently surfaced as `200` (see Known limitations) |

Rate limiting is applied per method with a dedicated key
(`api_HOKPlayerPanelProxy`), so this method does not consume the quota of
`HOKBattleList` or other APIs. The threshold is the service-wide
`interface-limit-num` setting (defaults to 200 requests/second when unset).
The public document recommends a polling interval greater than 300 ms.

## Differences from HOKBattleList

| Item | HOKBattleList | HOKPlayerPanelProxy |
| --- | --- | --- |
| Public path | `/match_data/api/HOKBattleList` | `/match_data/api/HOKPlayerPanelProxy` |
| Authentication | SignAuth, same `app_id`/`app_secret` | Identical -- reuse the same credentials |
| Body fields | `ObOpenId`, `page_offset`, `page_size` | `ob_openid`, `player_openid`, `scheduleid`, `timestamp`, `round` |
| Response | Protobuf-defined typed JSON | Upstream raw JSON passthrough, no schema |
| Rate-limit key | `api_HOKBattleList` | `api_HOKPlayerPanelProxy` |

## Troubleshooting

1. `401 Unsigned` -- verify `app_id`/`app_secret` against the live
   `auth-sign-map`, check the client clock, then try the alternate
   `--sign-uri /api/HOKPlayerPanelProxy`.
2. `404` -- the public gateway path requires the `/match_data` prefix. When
   calling a Pod directly, use
   `/trpc.esports_center.hok_realtime_data_svr.HOKRealTimeDataSvr/HOKPlayerPanelProxy`
   instead.
3. Unexpected or empty data -- confirm the body uses `ob_openid` (not
   `ObOpenId`) and that at least one identifier has a real value.
4. `{"rawBody": ...}` or an HTML error page -- see Response / Known
   limitations.
