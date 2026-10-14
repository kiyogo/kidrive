import 'package:flutter/services.dart';

import '../../../imports.dart';

/// Network file sharing configuration section (SMB/Samba, WebDAV, NFS).
class NetworkSharesSection extends StatefulWidget {
  const NetworkSharesSection({super.key});

  @override
  State<NetworkSharesSection> createState() => _NetworkSharesSectionState();
}

class _NetworkSharesSectionState extends State<NetworkSharesSection> {
  bool _smbEnabled = true;
  bool _guestAccess = false;
  bool _readOnly = false;
  String _smbWorkgroup = 'WORKGROUP';

  bool _webdavEnabled = true;
  bool _webdavAuth = true;

  bool _nfsEnabled = false;
  String _nfsSubnet = '192.168.1.0/24';

  int _guideIndex = 0; // 0: Windows, 1: macOS, 2: Smart TV / Infuse

  @override
  Widget build(BuildContext context) {
    const smbWinPath = r'\\localdrive\localdrive';
    const smbMacPath = 'smb://localdrive/localdrive';
    const webdavUrl = 'http://192.168.1.100:8080/webdav';
    const nfsMount = '192.168.1.100:/srv/localdrive/library';

    return ListView(
      padding: EdgeInsets.fromLTRB(
        context.pagePadding,
        16,
        context.pagePadding,
        120,
      ),
      children: <Widget>[
        // 1. Chia sẻ SMB / Samba
        LdSettingGroup(
          title: 'Chia sẻ tệp mạng nội bộ (SMB / Samba)',
          children: <Widget>[
            LdSettingRow(
              glyph: LdGlyph.shared,
              label: 'Dịch vụ SMB / CIFS',
              description:
                  'Cho phép truy cập dữ liệu máy chủ LocalDrive trực tiếp từ Windows Explorer, macOS Finder và ứng dụng quản lý tệp trên điện thoại.',
              trailing: LdSwitch(
                value: _smbEnabled,
                onChanged: (val) {
                  setState(() => _smbEnabled = val);
                  LdToast.show(
                    context,
                    message: val
                        ? 'Dịch vụ SMB đã được kích hoạt'
                        : 'Dịch vụ SMB đã tắt',
                  );
                },
              ),
            ),
            if (_smbEnabled) ...<Widget>[
              LdSettingRow(
                glyph: LdGlyph.device,
                label: 'Đường dẫn Windows',
                description: smbWinPath,
                onTap: () => _copy(smbWinPath, 'Đường dẫn Windows'),
                trailing: LdButton.secondary(
                  label: 'Sao chép',
                  glyph: LdGlyph.link,
                  compact: true,
                  expand: false,
                  onPressed: () => _copy(smbWinPath, 'Đường dẫn Windows'),
                ),
              ),
              LdSettingRow(
                glyph: LdGlyph.shared,
                label: 'Đường dẫn macOS / iOS',
                description: smbMacPath,
                onTap: () => _copy(smbMacPath, 'Đường dẫn macOS'),
                trailing: LdButton.secondary(
                  label: 'Sao chép',
                  glyph: LdGlyph.link,
                  compact: true,
                  expand: false,
                  onPressed: () => _copy(smbMacPath, 'Đường dẫn macOS'),
                ),
              ),
              LdSettingRow(
                glyph: LdGlyph.edit,
                label: 'Nhóm làm việc (Workgroup)',
                description: _smbWorkgroup,
                onTap: () => _editWorkgroup(context),
              ),
              LdSettingRow(
                glyph: LdGlyph.person,
                label: 'Cho phép truy cập Khách (Guest Access)',
                description:
                    'Người dùng trong mạng nội bộ có thể duyệt các thư mục công khai mà không cần nhập tài khoản/mật khẩu.',
                trailing: LdSwitch(
                  value: _guestAccess,
                  onChanged: (val) => setState(() => _guestAccess = val),
                ),
              ),
              LdSettingRow(
                glyph: LdGlyph.lock,
                label: 'Chế độ chỉ đọc (Read-only)',
                description:
                    'Bảo vệ dữ liệu chống ghi đè hoặc vô tình xóa nhầm khi duyệt qua mạng chia sẻ nội bộ.',
                trailing: LdSwitch(
                  value: _readOnly,
                  onChanged: (val) => setState(() => _readOnly = val),
                ),
              ),
            ],
          ],
        ),

        // 2. Hướng dẫn kết nối nhanh
        LdSettingGroup(
          title: 'Hướng dẫn kết nối nhanh',
          children: <Widget>[
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 8),
              child: LdSegmented<int>(
                segments: const <int, String>{
                  0: 'Windows',
                  1: 'macOS',
                  2: 'Smart TV / Infuse',
                },
                selected: _guideIndex,
                onChanged: (idx) => setState(() => _guideIndex = idx),
              ),
            ),
            Padding(
              padding: const EdgeInsets.symmetric(vertical: 12, horizontal: 4),
              child: _buildGuideContent(_guideIndex),
            ),
          ],
        ),

        // 3. Máy chủ WebDAV
        LdSettingGroup(
          title: 'Máy chủ WebDAV (Đồng bộ ứng dụng bên thứ 3)',
          children: <Widget>[
            LdSettingRow(
              glyph: LdGlyph.server,
              label: 'Dịch vụ WebDAV',
              description:
                  'Giao thức mạng HTTP/HTTPS hỗ trợ xem video trực tiếp trên Infuse, Kodi, VLC và đồng bộ ghi chú Zotero, Obsidian.',
              trailing: LdSwitch(
                value: _webdavEnabled,
                onChanged: (val) {
                  setState(() => _webdavEnabled = val);
                  LdToast.show(
                    context,
                    message: val
                        ? 'Dịch vụ WebDAV đã được kích hoạt'
                        : 'Dịch vụ WebDAV đã tắt',
                  );
                },
              ),
            ),
            if (_webdavEnabled) ...<Widget>[
              LdSettingRow(
                glyph: LdGlyph.link,
                label: 'Địa chỉ WebDAV URL',
                description: webdavUrl,
                onTap: () => _copy(webdavUrl, 'Địa chỉ WebDAV'),
                trailing: LdButton.secondary(
                  label: 'Sao chép',
                  glyph: LdGlyph.link,
                  compact: true,
                  expand: false,
                  onPressed: () => _copy(webdavUrl, 'Địa chỉ WebDAV'),
                ),
              ),
              LdSettingRow(
                glyph: LdGlyph.lock,
                label: 'Bắt buộc xác thực tài khoản',
                description:
                    'Yêu cầu đăng nhập bằng tên người dùng và mật khẩu tài khoản LocalDrive.',
                trailing: LdSwitch(
                  value: _webdavAuth,
                  onChanged: (val) => setState(() => _webdavAuth = val),
                ),
              ),
            ],
          ],
        ),

        // 4. Giao thức NFS
        LdSettingGroup(
          title: 'Chia sẻ mạng NFS (Linux / Máy ảo)',
          children: <Widget>[
            LdSettingRow(
              glyph: LdGlyph.server,
              label: 'Dịch vụ NFS (Network File System)',
              description:
                  'Giao thức chia sẻ mạng tốc độ cao chuyên dụng cho hệ thống máy chủ Linux, cụm Proxmox VE và hạ tầng VMware.',
              trailing: LdSwitch(
                value: _nfsEnabled,
                onChanged: (val) {
                  setState(() => _nfsEnabled = val);
                  LdToast.show(
                    context,
                    message: val
                        ? 'Dịch vụ NFS đã được kích hoạt'
                        : 'Dịch vụ NFS đã tắt',
                  );
                },
              ),
            ),
            if (_nfsEnabled) ...<Widget>[
              LdSettingRow(
                glyph: LdGlyph.link,
                label: 'Điểm gắn kết (Mount Point)',
                description: nfsMount,
                onTap: () => _copy(nfsMount, 'Điểm gắn kết NFS'),
                trailing: LdButton.secondary(
                  label: 'Sao chép',
                  glyph: LdGlyph.link,
                  compact: true,
                  expand: false,
                  onPressed: () => _copy(nfsMount, 'Điểm gắn kết NFS'),
                ),
              ),
              LdSettingRow(
                glyph: LdGlyph.edit,
                label: 'Dải mạng cho phép (Subnet)',
                description: _nfsSubnet,
                onTap: () => _editNfsSubnet(context),
              ),
            ],
          ],
        ),
      ],
    );
  }

  Widget _buildGuideContent(int index) {
    switch (index) {
      case 0:
        return const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              '1. Mở File Explorer (Phím tắt Win + E)\n'
              '2. Nhấp chuột phải vào This PC chọn "Map network drive..." (Kết nối ổ đĩa mạng)\n'
              '3. Chọn ký tự ổ đĩa (ví dụ: Z:) và dán đường dẫn: \\\\localdrive\\localdrive\n'
              '4. Tích chọn "Reconnect at sign-in" rồi nhấn Finish.',
              style: TextStyle(height: 1.6, fontSize: 13),
            ),
          ],
        );
      case 1:
        return const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              '1. Mở Finder trên macOS\n'
              '2. Nhấn tổ hợp phím Cmd + K (hoặc vào menu Go > Connect to Server)\n'
              '3. Nhập đường dẫn máy chủ: smb://localdrive/localdrive\n'
              '4. Nhấn Connect và đăng nhập bằng tài khoản LocalDrive.',
              style: TextStyle(height: 1.6, fontSize: 13),
            ),
          ],
        );
      case 2:
      default:
        return const Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: <Widget>[
            Text(
              '1. Mở ứng dụng Infuse, Kodi hoặc VLC trên Android TV / Apple TV / iPad\n'
              '2. Thêm nguồn dữ liệu mới (Add Share) > Chọn giao thức SMB hoặc WebDAV\n'
              '3. Điền địa chỉ IP máy chủ nội bộ hoặc tên miền localdrive\n'
              '4. Thưởng thức toàn bộ thư viện phim ảnh, video 4K HDR truyền tải trực tiếp mượt mà.',
              style: TextStyle(height: 1.6, fontSize: 13),
            ),
          ],
        );
    }
  }

  void _copy(String text, String label) {
    Clipboard.setData(ClipboardData(text: text));
    LdToast.show(context, message: 'Đã sao chép $label');
  }

  Future<void> _editWorkgroup(BuildContext context) async {
    final controller = TextEditingController(text: _smbWorkgroup);
    final val = await LdBottomSheet.show<String>(
      context,
      title: 'Nhóm làm việc (Workgroup)',
      scrollable: false,
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          LdTextField(
            controller: controller,
            label: 'Tên Workgroup',
            autofocus: true,
          ),
          const SizedBox(height: 16),
          LdButton(
            label: 'Lưu thay đổi',
            onPressed: () =>
                Navigator.of(sheetContext).pop(controller.text.trim()),
          ),
        ],
      ),
    );
    if (val != null && val.isNotEmpty) {
      setState(() => _smbWorkgroup = val);
      if (context.mounted) {
        LdToast.show(context, message: 'Đã cập nhật nhóm làm việc');
      }
    }
  }

  Future<void> _editNfsSubnet(BuildContext context) async {
    final controller = TextEditingController(text: _nfsSubnet);
    final val = await LdBottomSheet.show<String>(
      context,
      title: 'Dải mạng cho phép (Subnet)',
      scrollable: false,
      builder: (sheetContext) => Column(
        mainAxisSize: MainAxisSize.min,
        children: <Widget>[
          LdTextField(
            controller: controller,
            label: 'Dải mạng CIDR (ví dụ: 192.168.1.0/24)',
            autofocus: true,
          ),
          const SizedBox(height: 16),
          LdButton(
            label: 'Lưu thay đổi',
            onPressed: () =>
                Navigator.of(sheetContext).pop(controller.text.trim()),
          ),
        ],
      ),
    );
    if (val != null && val.isNotEmpty) {
      setState(() => _nfsSubnet = val);
      if (context.mounted) {
        LdToast.show(context, message: 'Đã cập nhật dải mạng NFS');
      }
    }
  }
}
