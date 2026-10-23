import sqlite3
import os
import time

now = int(time.time() * 1000)

db_paths = [
    r'e:\DATA\source\Nas\LocalDrive\data\db\localdrive.sqlite',
    r'e:\DATA\source\Nas\LocalDrive\server\data\db\localdrive.sqlite'
]

# Ensure directories exist
os.makedirs(r'E:\DATA\Shares\Public', exist_ok=True)
os.makedirs(r'E:\DATA\Shares\Media', exist_ok=True)
os.makedirs(r'E:\DATA\Backups', exist_ok=True)

for path in db_paths:
    if not os.path.exists(path):
        continue
    con = sqlite3.connect(path)
    cur = con.cursor()
    
    # Check pools
    cur.execute('SELECT COUNT(*) FROM storage_pools')
    if cur.fetchone()[0] == 0:
        cur.execute('''INSERT INTO storage_pools (id, name, layout, status, total_bytes, used_bytes, auto_trim, scrub_schedule, disks_json, created_at, updated_at)
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    ('pool-tank', 'tank', 'mirror', 'healthy', 256060514304, 128849018880, 1, 'weekly', '["drive_E"]', now, now))
        print('Seeded pool in', path)

    # Check datasets
    cur.execute('SELECT COUNT(*) FROM datasets')
    if cur.fetchone()[0] == 0:
        datasets = [
            ('ds-1', 'DATA/root', 'tank', 'E:\\DATA', 0, 128849018880, '128K', 'lz4', 'off', 'off', 'standard', 'mounted', now - 86400000*30, now),
            ('ds-2', 'DATA/Shares', 'tank', 'E:\\DATA\\Shares', 1610612736000, 912680550400, '128K', 'lz4', 'off', 'off', 'standard', 'mounted', now - 86400000*25, now),
            ('ds-3', 'DATA/Media', 'tank', 'E:\\DATA\\Media', 0, 536870912000, '1M', 'lz4', 'off', 'off', 'standard', 'mounted', now - 86400000*20, now),
            ('ds-4', 'DATA/Backups', 'tank', 'E:\\DATA\\Backups', 536870912000, 15247133696, '128K', 'lz4', 'off', 'off', 'standard', 'mounted', now - 86400000*15, now),
        ]
        cur.executemany('''INSERT INTO datasets (id, name, pool, mount, quota_bytes, used_bytes, recordsize, compression, atime, dedup, sync_mode, status, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', datasets)
        print('Seeded datasets in', path)

    # Check network_shares
    cur.execute('SELECT COUNT(*) FROM network_shares')
    if cur.fetchone()[0] == 0:
        shares = [
            ('share-1', 'Public', 'Chia sẻ mặc định', 'E:\\DATA\\Shares\\Public', 'Thư mục chia sẻ chung cho toàn bộ mạng nội bộ', 0, 1, 0, 1, 'active', now - 86400000*2, now),
            ('share-2', 'Media', 'Chia sẻ mặc định', 'E:\\DATA\\Shares\\Media', 'Kho phim ảnh, video và nhạc cho TV, Infuse, Kodi', 1, 1, 1, 1, 'active', now - 86400000, now),
        ]
        cur.executemany('''INSERT INTO network_shares (id, name, purpose, path, description, read_only, browseable, hide_unreadable, guest_ok, status, created_at, updated_at)
                           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''', shares)
        print('Seeded shares in', path)

    con.commit()
    con.close()
