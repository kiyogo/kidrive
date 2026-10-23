import sys
import urllib.request
import json
import time

sys.stdout.reconfigure(encoding='utf-8')

def api_call(path, method='GET', data=None, token=None):
    url = f"http://localhost:7443/api/v1{path}"
    headers = {'Content-Type': 'application/json'}
    if token:
        headers['Authorization'] = f"Bearer {token}"
    
    req_body = json.dumps(data).encode('utf-8') if data else None
    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    with urllib.request.urlopen(req) as resp:
        if resp.status == 204:
            return None
        return json.loads(resp.read().decode('utf-8'))

# 1. Login
auth = api_call('/auth/login', 'POST', {'username': 'admin', 'password': 'admin123'})
token = auth['access_token']
print("TOKEN OK:", bool(token))

suffix = int(time.time())

# 2. Test Datasets CRUD
ds_name = f'DATA/Projects_{suffix}'
created_ds = api_call('/admin/datasets', 'POST', {
    'name': ds_name,
    'pool': 'tank',
    'mount': f'E:\\DATA\\Projects_{suffix}',
    'quota_bytes': 107374182400
}, token)['dataset']
print("CREATED DATASET:", created_ds['id'], created_ds['name'])

updated_ds = api_call(f"/admin/datasets/{created_ds['id']}", 'PATCH', {
    'quota_bytes': 214748364800,
    'recordsize': '64K'
}, token)['dataset']
print("UPDATED DATASET:", updated_ds['quota_bytes'], updated_ds['recordsize'])

api_call(f"/admin/datasets/{created_ds['id']}", 'DELETE', None, token)
print("DELETED DATASET OK")

# 3. Test Network Shares CRUD
sh_name = f'Projects_{suffix}'
created_sh = api_call('/admin/shares', 'POST', {
    'name': sh_name,
    'purpose': 'Dự án nội bộ',
    'path': f'E:\\DATA\\Projects_{suffix}',
    'description': 'Chia sẻ dự án',
    'read_only': False,
    'browseable': True
}, token)['share']
print("CREATED SHARE:", created_sh['id'], created_sh['name'])

updated_sh = api_call(f"/admin/shares/{created_sh['id']}", 'PATCH', {
    'description': 'Chia sẻ dự án đã cập nhật',
    'read_only': True
}, token)['share']
print("UPDATED SHARE:", updated_sh['read_only'], updated_sh['description'])

api_call(f"/admin/shares/{created_sh['id']}", 'DELETE', None, token)
print("DELETED SHARE OK")

# 4. Test Pools & Maintenance
scrub = api_call('/admin/pools/pool-tank/scrub', 'POST', None, token)
print("SCRUB OK:", scrub['status'], "-", scrub['message'])

trim = api_call('/admin/pools/pool-tank/trim', 'POST', None, token)
print("TRIM OK:", trim['status'], "-", trim['message'])

# 5. Test SMART Check
smart = api_call('/admin/drives/drive_E/smart', 'POST', None, token)
print("SMART OK:", smart['health'], "-", smart['model'], "-", smart['message'])
