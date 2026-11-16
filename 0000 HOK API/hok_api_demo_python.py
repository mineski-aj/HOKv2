import requests
import time
import hmac
import binascii
import hashlib
import json

app_id = "app_id"
app_secret = "app_secret"
ts = str(int(time.time()))
baseUrl = "https://hok-sg-match.playerinfinite.com"


def testSign(uri):
    
    sign_params = {"path": uri, "timestamp": ts, "nonce": "demo"}
    # Concatenate the signing string in the following format
    query_string = "{}\n{}\n{}\n{}".format(sign_params.get("path"), app_id, sign_params.get("timestamp"), sign_params.get("nonce"))
    print('query_string:', query_string)
    # Calculate the signature using HMAC algorithm and SHA256 algorithm
    h = hmac.new(app_secret.encode(), query_string.encode(), hashlib.sha256)
    signature = binascii.hexlify(h.digest()).decode()
    print('signature:', signature)
    return signature

def testHOKBanPickList():
    uri = "/match_data/api/HOKBanPickList"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "ObOpenId": '1715939203_74_236388632'
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKBanPickList()


def testHOKBattleList():
    uri = "/match_data/api/HOKBattleList"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "ObOpenId": '1715939203_74_236388632',
        "page_offset": 0,
        "page_size": 1
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKBattleList()


def testHOKBattleDetail():
    uri = "/match_data/api/HOKBattleDetail"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "BattleID": '1715939203_74_236388632'
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKBattleDetail()


def testHOKTeamList():
    uri = "/match_data/api/HOKTeamList"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "BattleID": '1715939203_74_236388632'
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKTeamList()


def testHOKPlayerList():
    uri = "/match_data/api/HOKPlayerList"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "BattleID": '1715939203_74_236388632'
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKPlayerList()


def testHOKEventList():
    uri = "/match_data/api/HOKEventList"    
    url = baseUrl + uri
    signature = testSign(uri)
    headers = {
        'Content-type': 'application/json',
        'X-AUTH-Appkey': app_id,
        'X-AUTH-Sign': signature,
        'X-AUTH-Timestamp': ts,
        'X-AUTH-Nonce': 'demo',
    }
    request_params = {
        "BattleID": '1715939203_74_236388632'
    }
    response = requests.post(url, headers=headers, data=json.dumps(request_params), timeout=15*60)
    
    print('HTTP Status Code:', response.status_code)
    print(response.json())
testHOKEventList()