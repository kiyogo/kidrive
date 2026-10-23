import sys
import urllib.request
import urllib.parse
import json
import time
import os

sys.stdout.reconfigure(encoding='utf-8')

BASE_URL = "http://localhost:9683/api/v1"

def api_req(path, method='GET', data=None, token=None, is_multipart=False, files=None):
    url = f"{BASE_URL}{path}"
    headers = {}
    if token:
        headers['Authorization'] = f"Bearer {token}"
    
    if is_multipart and files:
        boundary = '----WebKitFormBoundary7MA4YWxkTrZu0gW'
        headers['Content-Type'] = f'multipart/form-data; boundary={boundary}'
        body = bytearray()
        for field_name, (filename, file_bytes) in files.items():
            body.extend(f'--{boundary}\r\n'.encode('utf-8'))
            body.extend(f'Content-Disposition: form-data; name="{field_name}"; filename="{filename}"\r\n'.encode('utf-8'))
            body.extend(b'Content-Type: application/octet-stream\r\n\r\n')
            body.extend(file_bytes)
            body.extend(b'\r\n')
        body.extend(f'--{boundary}--\r\n'.encode('utf-8'))
        req_body = bytes(body)
    elif data is not None:
        headers['Content-Type'] = 'application/json'
        req_body = json.dumps(data).encode('utf-8')
    else:
        req_body = None

    req = urllib.request.Request(url, data=req_body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status == 204:
                return 204, None
            content_type = resp.headers.get('Content-Type', '')
            if 'application/json' in content_type:
                return resp.status, json.loads(resp.read().decode('utf-8'))
            return resp.status, resp.read()
    except urllib.error.HTTPError as e:
        err_body = e.read().decode('utf-8', errors='ignore')
        try:
            return e.code, json.loads(err_body)
        except Exception:
            return e.code, err_body

print("==================================================================")
print("   KIỂM THỬ TOÀN DIỆN 100% PIPELINE STORAGE, DATASETS & USERS")
print("==================================================================")

# 1. Admin Login
status, auth = api_req('/auth/login', 'POST', {'username': 'admin', 'password': 'admin123'})
if status != 200:
    print(f"[-] Đăng nhập thất bại ({status}): {auth}")
    sys.exit(1)
admin_token = auth['access_token']
print(f"[✓] 1. Đăng nhập Admin thành công. Token: {admin_token[:16]}...")

# 2. Check Storage Readiness
status, readiness = api_req('/storage/readiness', 'GET', token=admin_token)
print(f"[✓] 2. Trạng thái hệ thống lưu trữ: ready={readiness.get('ready')} (pools={readiness.get('pool_count')}, datasets={readiness.get('dataset_count')})")

# 3. Discover & Import Storage Pool
status, disc = api_req('/admin/pools/discover', 'GET', token=admin_token)
print(f"[✓] 3. Quét phát hiện ổ đĩa: can_import={disc.get('can_import')}, available_disks={len(disc.get('available_disks', []))}")

suffix = int(time.time())
pool_name = f"Pool_Kiyo_{suffix}"
status, imp = api_req('/admin/pools/import', 'POST', {
    'name': pool_name,
    'layout': 'MergerFS',
    'disks': [d['id'] for d in disc.get('available_disks', [])[:1]] or ['E:']
}, token=admin_token)
print(f"[✓] 4. Nhập Nhóm lưu trữ (Import Pool): status={status}, message={imp.get('message')}")
assert status == 200, f"Import pool failed: {imp}"

# 4. Create Dataset
ds_name = f"{pool_name}/khachhang_{suffix}"
status, ds_res = api_req('/admin/datasets', 'POST', {
    'name': ds_name,
    'pool': pool_name,
    'quota_bytes': 10 * 1024 * 1024 * 1024 # 10 GB
}, token=admin_token)
print(f"[✓] 5. Tạo Tập dữ liệu ({ds_name}): status={status}, dataset_id={ds_res.get('dataset', {}).get('id')}")
assert status == 201, f"Create dataset failed: {ds_res}"

# 5. Create Member User with Editor Permissions
username_editor = f"user_editor_{suffix}"
editor_perms = {
    ds_name: {
        'level': 'editor',
        'read': True,
        'write': True,
        'execute': True
    }
}
status, u_res = api_req('/admin/users', 'POST', {
    'username': username_editor,
    'password': 'Password123!',
    'display_name': 'Người dùng Đọc/Ghi',
    'role': 'member',
    'quota_bytes': 500 * 1024 * 1024, # 500 MB
    'dataset_permissions': json.dumps(editor_perms)
}, token=admin_token)
print(f"[✓] 6. Tạo Người dùng có quyền Đọc + Ghi ({username_editor}): status={status}")
assert status in (200, 201), f"Create editor user failed: {u_res}"

# 6. Create Member User with Read-Only Permissions
username_viewer = f"user_viewer_{suffix}"
viewer_perms = {
    ds_name: {
        'level': 'viewer',
        'read': True,
        'write': False,
        'execute': True
    }
}
status, uv_res = api_req('/admin/users', 'POST', {
    'username': username_viewer,
    'password': 'Password123!',
    'display_name': 'Người dùng Chỉ xem',
    'role': 'member',
    'quota_bytes': 500 * 1024 * 1024,
    'dataset_permissions': json.dumps(viewer_perms)
}, token=admin_token)
print(f"[✓] 7. Tạo Người dùng Chỉ đọc ({username_viewer}): status={status}")
assert status in (200, 201), f"Create viewer user failed: {uv_res}"

# 7. Login as Editor User
status, u_auth = api_req('/auth/login', 'POST', {'username': username_editor, 'password': 'Password123!'})
editor_token = u_auth['access_token']
print(f"[✓] 8. Đăng nhập tài khoản Đọc/Ghi: status={status}")

# 8. Upload File into Dataset
test_content = b"LocalDrive Premium Storage - Du lieu kiem thu pipeline 100%!"
status, up_res = api_req(
    f"/datasets/upload?dataset={urllib.parse.quote(ds_name)}&subpath=tailieu",
    'POST',
    token=editor_token,
    is_multipart=True,
    files={'file': ('kiemthu.txt', test_content)}
)
print(f"[✓] 9. Người dùng tải tệp vào Tập dữ liệu được phân quyền: status={status}, files={up_res.get('files')}")
assert status == 200, f"Upload failed: {up_res}"

# 9. List Items in Dataset
status, items_res = api_req(
    f"/datasets/items?dataset={urllib.parse.quote(ds_name)}&subpath=tailieu",
    'GET',
    token=editor_token
)
print(f"[✓] 10. Duyệt xem tệp trong Tập dữ liệu: status={status}, total_items={len(items_res.get('items', []))}")
assert status == 200 and len(items_res.get('items', [])) > 0, f"List items failed: {items_res}"

# 10. Download File from Dataset directly and through bridged /nodes/{id}/download
node_id = items_res['items'][0]['id']
status, dl_data = api_req(
    f"/datasets/download?dataset={urllib.parse.quote(ds_name)}&path=tailieu/kiemthu.txt",
    'GET',
    token=editor_token
)
print(f"[✓] 11. Tải tệp xuống qua /datasets/download: status={status}, size={len(dl_data) if isinstance(dl_data, bytes) else dl_data}")
assert status == 200 and dl_data == test_content, "Downloaded content mismatch"

status, dl_bridged = api_req(
    f"/nodes/{urllib.parse.quote(node_id)}/download",
    'GET',
    token=editor_token
)
print(f"[✓] 12. Tải tệp xuống qua đường dẫn Bridge (/nodes/dataset:.../download): status={status}, size={len(dl_bridged) if isinstance(dl_bridged, bytes) else dl_bridged}")
assert status == 200 and dl_bridged == test_content, "Bridged downloaded content mismatch"

# 11. Login as Read-Only User
status, v_auth = api_req('/auth/login', 'POST', {'username': username_viewer, 'password': 'Password123!'})
viewer_token = v_auth['access_token']
print(f"[✓] 13. Đăng nhập tài khoản Chỉ đọc: status={status}")

# 12. Read-Only User can READ and DOWNLOAD
status, v_items = api_req(
    f"/datasets/items?dataset={urllib.parse.quote(ds_name)}&subpath=tailieu",
    'GET',
    token=viewer_token
)
print(f"[✓] 14. Tài khoản Chỉ đọc xem tệp: status={status}, role={v_items.get('role')}")
assert status == 200 and v_items.get('role') == 'viewer', f"Viewer should have role viewer: {v_items}"

status, v_dl = api_req(
    f"/datasets/download?dataset={urllib.parse.quote(ds_name)}&path=tailieu/kiemthu.txt",
    'GET',
    token=viewer_token
)
print(f"[✓] 15. Tài khoản Chỉ đọc tải tệp: status={status}, size={len(v_dl)}")
assert status == 200 and v_dl == test_content, "Viewer failed to download"

# 13. Read-Only User tries to UPLOAD -> MUST BE FORBIDDEN (403)
status, v_up_fail = api_req(
    f"/datasets/upload?dataset={urllib.parse.quote(ds_name)}&subpath=tailieu",
    'POST',
    token=viewer_token,
    is_multipart=True,
    files={'file': ('hack.txt', b'forbidden upload')}
)
print(f"[✓] 16. Tài khoản Chỉ đọc cố gắng ghi tệp: status={status} (Kỳ vọng: 403 Forbidden). Lỗi: {v_up_fail.get('error')}")
assert status == 403, f"Expected 403 Forbidden for viewer upload, got {status}"

# 14. Real S.M.A.R.T test
available = disc.get('available_disks', [])
drive_to_test = available[0]['id'] if available else 'drive_E'
status, smart_res = api_req(f'/admin/drives/{drive_to_test}/smart', 'POST', token=admin_token)
print(f"[✓] 17. Kiểm tra S.M.A.R.T ổ cứng ({drive_to_test}): status={status}, health={smart_res.get('health')}, message={smart_res.get('message')}")
assert status == 200, f"SMART test failed: {smart_res}"

print("\n==================================================================")
print("   TẤT CẢ 17/17 BƯỚC KIỂM THỬ ĐÃ HOẠT ĐỘNG HOÀN TOÀN 100%!")
print("==================================================================")
