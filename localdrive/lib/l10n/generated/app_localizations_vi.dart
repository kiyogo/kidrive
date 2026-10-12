// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for Vietnamese (`vi`).
class L10nVi extends L10n {
  L10nVi([String locale = 'vi']) : super(locale);

  @override
  String get appName => 'Local Drive';

  @override
  String get actionContinue => 'Tiếp tục';

  @override
  String get actionCancel => 'Hủy';

  @override
  String get actionSave => 'Lưu';

  @override
  String get actionDone => 'Xong';

  @override
  String get actionRetry => 'Thử lại';

  @override
  String get actionDelete => 'Xóa';

  @override
  String get actionRemove => 'Gỡ bỏ';

  @override
  String get actionCopy => 'Sao chép';

  @override
  String get actionCopyLink => 'Sao chép liên kết';

  @override
  String get actionCopyCode => 'Sao chép mã';

  @override
  String get actionCopied => 'Đã sao chép';

  @override
  String get actionPlay => 'Phát';

  @override
  String get actionPause => 'Tạm dừng';

  @override
  String get actionFullscreen => 'Toàn màn hình';

  @override
  String get actionExitFullscreen => 'Thoát toàn màn hình';

  @override
  String get actionLoop => 'Vòng lặp';

  @override
  String get actionMute => 'Tắt tiếng';

  @override
  String get actionUnmute => 'Bật tiếng';

  @override
  String get actionOpen => 'Mở';

  @override
  String get actionRename => 'Đổi tên';

  @override
  String get actionMove => 'Di chuyển';

  @override
  String get actionShare => 'Chia sẻ';

  @override
  String get actionBack => 'Quay lại';

  @override
  String get actionRefresh => 'Làm mới';

  @override
  String get actionDeselect => 'Bỏ chọn';

  @override
  String get navHome => 'Trang chủ';

  @override
  String get navSearch => 'Tìm kiếm';

  @override
  String get navCreate => 'Tạo mới';

  @override
  String get navShared => 'Được chia sẻ';

  @override
  String get navSettings => 'Cài đặt';

  @override
  String get myFiles => 'Tệp của tôi';

  @override
  String get newFolder => 'Thư mục mới';

  @override
  String get upload => 'Tải lên';

  @override
  String get uploadFile => 'Tải tệp lên';

  @override
  String get download => 'Tải xuống';

  @override
  String get gallery => 'Hình ảnh';

  @override
  String get galleryEmptyTitle => 'Chưa có ảnh nào';

  @override
  String get galleryEmptyBody =>
      'Mọi hình ảnh bạn tải lên sẽ xuất hiện ở đây, mới nhất ở đầu.';

  @override
  String get videos => 'Video';

  @override
  String get navVideos => 'Video';

  @override
  String get videosEmptyTitle => 'Chưa có video nào';

  @override
  String get videosEmptyBody =>
      'Mọi video bạn tải lên sẽ xuất hiện ở đây, mới nhất ở đầu.';

  @override
  String videosSummary(int count) {
    return '$count video';
  }

  @override
  String get shareOneAtATime =>
      'Chia sẻ từng ảnh một để mỗi người nhận đúng quyền truy cập bạn muốn';

  @override
  String get gallerySortTitle => 'Sắp xếp và nhóm';

  @override
  String get gallerySortTaken => 'Ngày chụp';

  @override
  String get gallerySortAdded => 'Ngày thêm';

  @override
  String get gallerySortModified => 'Ngày sửa đổi';

  @override
  String get gallerySortName => 'Tên';

  @override
  String get gallerySortSize => 'Kích thước tệp';

  @override
  String get galleryGroupTitle => 'Nhóm theo';

  @override
  String get galleryGroupDay => 'Ngày';

  @override
  String get galleryGroupMonth => 'Tháng';

  @override
  String get galleryGroupYear => 'Năm';

  @override
  String get galleryGroupNone => 'Không nhóm';

  @override
  String get galleryGroupUnavailable =>
      'Chỉ có thể nhóm khi ảnh được sắp xếp theo ngày.';

  @override
  String galleryPositionOf(String position, String total) {
    return '$position trên $total';
  }

  @override
  String gallerySummary(int photos, int videos) {
    return '$photos ảnh';
  }

  @override
  String gallerySelected(int count) {
    return 'Đã chọn $count';
  }

  @override
  String get galleryColumns => 'Kích thước ô';

  @override
  String get galleryToday => 'Hôm nay';

  @override
  String get galleryYesterday => 'Hôm qua';

  @override
  String get share => 'Chia sẻ';

  @override
  String get sharedWithMe => 'Được chia sẻ với tôi';

  @override
  String get recent => 'Gần đây';

  @override
  String get starred => 'Gắn sao';

  @override
  String get trash => 'Thùng rác';

  @override
  String get restore => 'Khôi phục';

  @override
  String get storage => 'Bộ nhớ';

  @override
  String get settings => 'Cài đặt';

  @override
  String get search => 'Tìm kiếm';

  @override
  String get activity => 'Hoạt động';

  @override
  String get devices => 'Thiết bị';

  @override
  String get signIn => 'Đăng nhập';

  @override
  String get createAccount => 'Tạo tài khoản';

  @override
  String get permanentlyDelete => 'Xóa vĩnh viễn';

  @override
  String get pendingApproval => 'Chờ phê duyệt';

  @override
  String get approve => 'Phê duyệt';

  @override
  String get deny => 'Từ chối';

  @override
  String get scanForServers => 'Quét tìm máy chủ';

  @override
  String get linkExpiration => 'Hạn liên kết';

  @override
  String get neverExpires => 'Không bao giờ hết hạn';

  @override
  String get setUpThisServer => 'Thiết lập máy chủ này';

  @override
  String get invite => 'Mời';

  @override
  String get roleAdmin => 'Quản trị viên';

  @override
  String get roleMember => 'Thành viên';

  @override
  String get resetPassword => 'Đặt lại mật khẩu';

  @override
  String get sharedWithPerson => 'Chia sẻ với một người';

  @override
  String get nearby => 'Lân cận';

  @override
  String get availableOffline => 'Khả dụng ngoại tuyến';

  @override
  String get welcomeTitle => 'Tệp của bạn, trên máy của bạn';

  @override
  String get welcomeBody =>
      'Local Drive lưu trữ mọi thứ trên máy chủ của chính bạn, ở vị trí do bạn kiểm soát.';

  @override
  String get welcomeStart => 'Bắt đầu';

  @override
  String get welcomePointHardware =>
      'Tệp nằm trên phần cứng của riêng bạn. Không tệp nào bị sao chép sang máy của người khác.';

  @override
  String get welcomePointKeys =>
      'Không tài khoản bên ngoài, không thuê bao định kỳ và không thu thập dữ liệu từ xa. Không có gì bị báo cáo ra ngoài.';

  @override
  String get welcomePointDevices =>
      'Điện thoại, máy tính bảng, máy tính xách tay và trình duyệt đều truy cập cùng một thư viện.';

  @override
  String get connectTitle => 'Kết nối tới máy chủ';

  @override
  String get connectBody =>
      'Chọn một máy chủ tìm thấy trên mạng của bạn, hoặc nhập địa chỉ thủ công.';

  @override
  String get scanningNetwork => 'Đang quét mạng của bạn';

  @override
  String get scanAgain => 'Quét lại';

  @override
  String get enterAddressManually => 'Nhập địa chỉ thủ công';

  @override
  String get addressHint => '192.168.1.10 hoặc drive.example.com';

  @override
  String get nothingFound => 'Không tìm thấy máy chủ nào trên mạng này';

  @override
  String get nothingFoundBody =>
      'Điều này bình thường nếu khác lớp mạng (subnet) hoặc tính năng phát hiện bị tắt. Hãy nhập địa chỉ trực tiếp.';

  @override
  String get serverReady => 'Sẵn sàng';

  @override
  String get serverNeedsSetup => 'Cần thiết lập';

  @override
  String get connectAction => 'Kết nối';

  @override
  String get couldNotReachServer => 'Không thể kết nối tới địa chỉ đó';

  @override
  String get languageTitle => 'Chọn ngôn ngữ';

  @override
  String get languageEnglish => 'English';

  @override
  String get languageArabic => 'العربية';

  @override
  String get languageVietnamese => 'Tiếng Việt';

  @override
  String get setupTitle => 'Thiết lập máy chủ này';

  @override
  String get setupBody =>
      'Đây là một máy chủ hoàn toàn mới. Tài khoản bạn tạo lúc này sẽ là quản trị viên.';

  @override
  String get setupAdminSection => 'Tài khoản quản trị';

  @override
  String get setupOnceNotice =>
      'Màn hình này chỉ xuất hiện một lần. Khi tài khoản này được tạo, máy chủ sẽ khóa thiết lập ban đầu và những người khác chỉ có thể tham gia qua lời mời.';

  @override
  String get serverNameLabel => 'Tên máy chủ';

  @override
  String get serverNameHint => 'Tên hiển thị khi mọi người kết nối';

  @override
  String get usernameLabel => 'Tên người dùng';

  @override
  String get usernameHint => 'Tên dùng để đăng nhập';

  @override
  String get passwordLabel => 'Mật khẩu';

  @override
  String get passwordHintNew => 'Tối thiểu 10 ký tự';

  @override
  String get passwordHintExisting => 'Mật khẩu cho tài khoản này';

  @override
  String get confirmPasswordLabel => 'Xác nhận mật khẩu';

  @override
  String get confirmPasswordHint => 'Nhập lại mật khẩu giống bên trên';

  @override
  String get inviteCodeLabel => 'Mã mời';

  @override
  String get inviteCodeHint => 'Ví dụ: ABCD-1234';

  @override
  String get passwordsDoNotMatch => 'Mật khẩu không khớp';

  @override
  String get passwordTooShort => 'Vui lòng dùng ít nhất 10 ký tự';

  @override
  String get signInTitle => 'Chào mừng trở lại';

  @override
  String signInBody(String serverName) {
    return 'Đăng nhập vào $serverName.';
  }

  @override
  String get createAccountTitle => 'Tạo tài khoản của bạn';

  @override
  String get createAccountBody => 'Nhập mã mời bạn đã nhận được.';

  @override
  String get noAccountYet => 'Chưa có tài khoản?';

  @override
  String get alreadyHaveAccount => 'Đã có tài khoản?';

  @override
  String get twoFactorCode => 'Mã xác thực 2 lớp';

  @override
  String get twoFactorHint => 'Từ ứng dụng xác thực của bạn';

  @override
  String get waitingForApprovalTitle => 'Đang chờ phê duyệt';

  @override
  String get waitingForApprovalBody =>
      'Đây là thiết bị mới. Hãy phê duyệt thiết bị này từ mục Cài đặt trên thiết bị bạn đã đăng nhập trước đó.';

  @override
  String get deviceApproved => 'Thiết bị này đã được phê duyệt';

  @override
  String get deviceDeniedTitle => 'Thiết bị này không được phê duyệt';

  @override
  String get deviceDeniedBody =>
      'Hãy liên hệ người quản trị máy chủ này, hoặc thử đăng nhập lại.';

  @override
  String get mustChangePasswordTitle => 'Chọn mật khẩu mới';

  @override
  String get mustChangePasswordBody =>
      'Tài khoản này đang dùng mật khẩu tạm thời. Bạn phải đổi mật khẩu mới để tiếp tục sử dụng.';

  @override
  String get currentPassword => 'Mật khẩu hiện tại';

  @override
  String get newPassword => 'Mật khẩu mới';

  @override
  String get passwordChanged => 'Đã đổi mật khẩu';

  @override
  String get emptyFolderTitle => 'Chưa có gì ở đây';

  @override
  String get emptyFolderBody => 'Tải lên một tệp hoặc tạo thư mục để bắt đầu.';

  @override
  String get emptySharedTitle => 'Không có tệp nào được chia sẻ với bạn';

  @override
  String get emptySharedBody =>
      'Bất kỳ nội dung nào ai đó chia sẻ sẽ hiển thị ở đây.';

  @override
  String get emptyStarredTitle => 'Chưa có mục gắn sao nào';

  @override
  String get emptyStarredBody =>
      'Gắn sao bất kỳ mục nào bạn muốn tìm lại nhanh chóng.';

  @override
  String get emptyRecentTitle => 'Chưa có tệp gần đây';

  @override
  String get emptyRecentBody => 'Các tệp bạn thay đổi sẽ xuất hiện ở đây.';

  @override
  String get emptyTrashTitle => 'Thùng rác trống';

  @override
  String get emptyTrashBody =>
      'Các mục bạn xóa sẽ lưu tạm ở đây trước khi bị xóa vĩnh viễn.';

  @override
  String get emptySearchTitle => 'Không tìm thấy kết quả phù hợp';

  @override
  String get emptySearchBody => 'Hãy thử tìm kiếm với từ khóa khác.';

  @override
  String get emptyActivityTitle => 'Chưa có hoạt động nào';

  @override
  String get emptyDevicesTitle => 'Không có thiết bị nào khác';

  @override
  String get emptyUsersTitle => 'Hiện chỉ có bạn';

  @override
  String get emptyUsersBody =>
      'Hãy mời ai đó để cấp cho họ không gian lưu trữ riêng.';

  @override
  String get emptyTransfersTitle => 'Không có tiến trình truyền tệp';

  @override
  String get emptyTransfersBody =>
      'Tiến trình tải lên và tải xuống sẽ hiển thị ở đây.';

  @override
  String get errorOfflineTitle => 'Bạn đang ngoại tuyến';

  @override
  String get errorOfflineBody =>
      'Local Drive sẽ tiếp tục công việc dang dở ngay khi bạn kết nối lại mạng.';

  @override
  String get errorUnreachableTitle => 'Không thể kết nối tới máy chủ này';

  @override
  String get errorUnreachableBody =>
      'Máy chủ có thể đang tắt hoặc nằm trên mạng mà thiết bị này không nhìn thấy.';

  @override
  String get errorPermissionTitle => 'Bạn không có quyền truy cập';

  @override
  String get errorPermissionBody =>
      'Hãy yêu cầu chủ sở hữu chia sẻ tệp này cho bạn.';

  @override
  String get errorNotFoundTitle => 'Không tìm thấy';

  @override
  String get errorNotFoundBody => 'Tệp có thể đã bị di chuyển hoặc đã bị xóa.';

  @override
  String get errorQuotaTitle => 'Hết dung lượng lưu trữ';

  @override
  String get errorQuotaBody =>
      'Hãy giải phóng bớt dung lượng hoặc yêu cầu nâng mức hạn ngạch.';

  @override
  String get errorSessionTitle => 'Vui lòng đăng nhập lại';

  @override
  String get errorSessionBody => 'Phiên đăng nhập đã hết hạn.';

  @override
  String get errorUnexpectedTitle => 'Đã xảy ra lỗi';

  @override
  String get errorUnexpectedBody =>
      'Thao tác không thành công. Vui lòng thử lại sau giây lát.';

  @override
  String get sortBy => 'Sắp xếp theo';

  @override
  String get sortName => 'Tên';

  @override
  String get sortUpdated => 'Thay đổi gần nhất';

  @override
  String get sortSize => 'Kích thước';

  @override
  String get viewGrid => 'Dạng lưới';

  @override
  String get viewList => 'Dạng danh sách';

  @override
  String get actionSelect => 'Chọn';

  @override
  String selectedCount(int count) {
    return 'Đã chọn $count';
  }

  @override
  String itemCount(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count mục',
      one: '1 mục',
      zero: 'Trống',
    );
    return '$_temp0';
  }

  @override
  String get folderNameLabel => 'Tên thư mục';

  @override
  String get folderNameHint => 'Ảnh du lịch';

  @override
  String get renameTo => 'Tên mới';

  @override
  String get chooseLibrary => 'Vị trí lưu trữ';

  @override
  String libraryFreeSpace(String free) {
    return 'Còn trống $free';
  }

  @override
  String get folderColor => 'Màu thư mục';

  @override
  String get moveTo => 'Di chuyển tới';

  @override
  String get confirmTrashTitle => 'Chuyển vào thùng rác';

  @override
  String confirmTrashBody(String name) {
    return '$name sẽ được chuyển vào thùng rác. Bất kỳ ai được chia sẻ tệp này sẽ mất quyền truy cập.';
  }

  @override
  String get confirmDeleteTitle => 'Xóa vĩnh viễn';

  @override
  String confirmDeleteBody(String name) {
    return '$name và mọi nội dung bên trong sẽ bị xóa hoàn toàn. Hành động này không thể hoàn tác.';
  }

  @override
  String trashRetentionNote(int days) {
    return 'Các mục trong thùng rác sẽ tự động bị xóa sau $days ngày.';
  }

  @override
  String get emptyTrashAction => 'Dọn sạch thùng rác';

  @override
  String get sharePeopleTab => 'Mọi người';

  @override
  String get shareLinkTab => 'Liên kết';

  @override
  String get sharePeopleHint =>
      'Chạm vào một người để cấp quyền truy cập cho họ.';

  @override
  String get shareRoleViewer => 'Có thể xem';

  @override
  String get shareRoleEditor => 'Có thể chỉnh sửa';

  @override
  String get shareRoleNote =>
      'Chỉ bạn mới có quyền xóa, di chuyển hoặc chia sẻ lại tệp này.';

  @override
  String get shareRemoveAccess => 'Gỡ quyền truy cập';

  @override
  String get shareCreateLink => 'Tạo liên kết';

  @override
  String get shareLinkAllowDownload => 'Cho phép tải xuống';

  @override
  String get shareLinkPassword => 'Mật khẩu';

  @override
  String get shareLinkPasswordHint =>
      'Bất kỳ ai mở liên kết đều cần mật khẩu này';

  @override
  String get shareLinkNoPassword => 'Không có mật khẩu';

  @override
  String get shareLinkExpiry => 'Hết hạn';

  @override
  String get shareExpiryDay => 'Sau 1 ngày';

  @override
  String get shareExpiryWeek => 'Sau 1 tuần';

  @override
  String get shareExpiryMonth => 'Sau 1 tháng';

  @override
  String get shareExpiryCustom => 'Chọn ngày cụ thể';

  @override
  String get shareRevoke => 'Hủy bỏ liên kết này';

  @override
  String get shareRevoked => 'Liên kết đó không còn hoạt động nữa';

  @override
  String shareReceived(String name, String item) {
    return '$name đã chia sẻ $item với bạn';
  }

  @override
  String get versionHistory => 'Lịch sử phiên bản';

  @override
  String get versionCurrent => 'Hiện tại';

  @override
  String get versionRestored => 'Đã khôi phục phiên bản trước';

  @override
  String get storageTotal => 'Trên tất cả các ổ đĩa';

  @override
  String get storageYours => 'Tệp của bạn';

  @override
  String storageUsedOf(String used, String total) {
    return 'Đã dùng $used trên tổng số $total';
  }

  @override
  String sidebarStorageUsed(String used) {
    return 'Đã dùng $used';
  }

  @override
  String sidebarStorageFree(String free) {
    return 'Còn trống $free';
  }

  @override
  String get sidebarStorageDiskLimited =>
      'Dung lượng ổ đĩa thấp hơn hạn ngạch của bạn';

  @override
  String get storageDefault => 'Mặc định';

  @override
  String get storageSetDefault => 'Đặt làm mặc định';

  @override
  String get storageDetectedDrives => 'Ổ đĩa phát hiện được';

  @override
  String get storageUseThisDrive => 'Dùng ổ đĩa này';

  @override
  String get storageFormat => 'Định dạng lại (Format)';

  @override
  String get storageEject => 'Ngắt kết nối an toàn (Eject)';

  @override
  String get storageCombine => 'Gộp chung thành một ổ đĩa';

  @override
  String get storageOffline => 'Chưa kết nối';

  @override
  String storageOfflineBanner(String name) {
    return '$name hiện không được kết nối. Mọi thứ khác vẫn hoạt động bình thường.';
  }

  @override
  String get storageSafeToUnplug =>
      'Bây giờ bạn có thể rút ổ đĩa này ra an toàn';

  @override
  String get storageFormatWarning =>
      'Mọi dữ liệu trên ổ đĩa này sẽ bị xóa vĩnh viễn. Nhập cụm từ bên dưới để tiếp tục.';

  @override
  String get storageFormatPhrase => 'XOA O DIA NAY';

  @override
  String get storageFormatPhraseHint => 'Nhập chính xác cụm từ trên';

  @override
  String get storageHelperUnavailable =>
      'Tính năng quản lý ổ đĩa không khả dụng trên môi trường triển khai này.';

  @override
  String get settingsAccount => 'Tài khoản';

  @override
  String get settingsLanguage => 'Ngôn ngữ';

  @override
  String get settingsServer => 'Máy chủ';

  @override
  String get settingsUsers => 'Người dùng';

  @override
  String get settingsAbout => 'Giới thiệu';

  @override
  String get settingsSwitchNode => 'Chuyển máy chủ';

  @override
  String get deepLinkOtherServerTitle =>
      'Liên kết đó dành cho một máy chủ khác';

  @override
  String deepLinkOtherServerBody(String server) {
    return 'Liên kết này trỏ đến $server. Bạn đang đăng nhập tại một nơi khác, do đó cần chuyển máy chủ trước khi mở.';
  }

  @override
  String get shareReceivedOne => 'Đã thêm vào danh sách tải lên của bạn';

  @override
  String shareReceivedMany(int count) {
    return 'Đã thêm $count tệp vào danh sách tải lên của bạn';
  }

  @override
  String get trayOpen => 'Mở Local Drive';

  @override
  String get trayTransfers => 'Truyền tệp';

  @override
  String get trayQuit => 'Thoát';

  @override
  String get launchAtStartup => 'Khởi động cùng máy tính khi đăng nhập';

  @override
  String get notificationsWhyTitle =>
      'Cho phép Local Drive hiển thị tiến trình truyền tệp';

  @override
  String get notificationsWhyBody =>
      'Thông báo giúp duy trì quá trình tải lên ngay cả khi bạn rời khỏi ứng dụng. Nếu không có thông báo, thiết bị có thể dừng truyền tệp ngay khi màn hình tắt.';

  @override
  String get notificationsAllow => 'Cho phép thông báo';

  @override
  String get notificationsNotNow => 'Để sau';

  @override
  String get nearbyWhyTitle => 'Xem ai đang ở trên mạng này';

  @override
  String get nearbyWhyBody =>
      'Local Drive có thể hiển thị những ai đang kết nối cùng Wi-Fi này lúc này, giúp chia sẻ tệp chỉ bằng một chạm. Ứng dụng chỉ quét khi bảng này mở và tệp vẫn truyền qua máy chủ an toàn của bạn.';

  @override
  String get nearbyAllow => 'Hiển thị người lân cận';

  @override
  String get settingsSignOut => 'Đăng xuất';

  @override
  String get settingsTwoFactor => 'Xác thực hai yếu tố (2FA)';

  @override
  String get settingsRequireApproval => 'Phê duyệt thiết bị mới';

  @override
  String get settingsRequireApprovalNote =>
      'Thiết bị đăng nhập lần đầu phải chờ một thiết bị bạn đang dùng cho phép đăng nhập.';

  @override
  String get settingsLanDiscovery => 'Quảng bá trên mạng cục bộ';

  @override
  String get settingsLanDiscoveryNote =>
      'Cho phép ứng dụng tự động tìm thấy máy chủ này mà không cần nhập địa chỉ IP.';

  @override
  String get settingsSelfRegistration => 'Mọi người đều có thể tạo tài khoản';

  @override
  String get settingsSelfRegistrationNote =>
      'Tắt tính năng này sẽ an toàn hơn. Thay vào đó hãy mời từng người.';

  @override
  String get usersInviteSomeone => 'Mời người dùng';

  @override
  String get usersInviteLabel => 'Mời ai';

  @override
  String get usersInviteHint => 'Tên gợi nhớ để phân biệt họ';

  @override
  String get usersInviteCreated =>
      'Gửi mã này cho họ qua kênh liên lạc bạn đang dùng.';

  @override
  String get usersResetPassword => 'Đặt lại mật khẩu cho họ';

  @override
  String get usersTemporaryPassword => 'Mật khẩu tạm thời';

  @override
  String get usersTemporaryPasswordNote =>
      'Họ sẽ được yêu cầu tạo mật khẩu mới khi đăng nhập.';

  @override
  String get usersMakeAdmin => 'Chuyển thành Quản trị viên';

  @override
  String get usersMakeMember => 'Chuyển thành Thành viên';

  @override
  String get devicesThisDevice => 'Thiết bị này';

  @override
  String devicesLastSeen(String when) {
    return 'Hoạt động lần cuối $when';
  }

  @override
  String get devicesRevoke => 'Đăng xuất thiết bị này';

  @override
  String get devicesPendingSection => 'Đang chờ phê duyệt';

  @override
  String get devicesApprovedToast => 'Đã phê duyệt thiết bị';

  @override
  String get devicesDeniedToast => 'Đã từ chối thiết bị';

  @override
  String get transfersTitle => 'Truyền tệp';

  @override
  String transfersSummary(int done, int total) {
    return 'Đã tải lên $done trên $total';
  }

  @override
  String transfersNeedAttention(int count) {
    return '$count mục cần chú ý';
  }

  @override
  String get transferQueued => 'Đã vào hàng chờ';

  @override
  String get transferInProgress => 'Đang tải lên';

  @override
  String get transferRetrying => 'Đang thử lại';

  @override
  String get transferCompleted => 'Hoàn tất';

  @override
  String get transferFailed => 'Thất bại';

  @override
  String get transferRetry => 'Thử lại';

  @override
  String get transferPausedOffline => 'Đã tạm dừng, đang chờ kết nối mạng';

  @override
  String get offlineMakeAvailable => 'Lưu ngoại tuyến';

  @override
  String get offlineRemoveDownload => 'Xóa ngoại tuyến';

  @override
  String offlineRemoved(String name) {
    return '$name không còn được lưu trên thiết bị này';
  }

  @override
  String offlineQueued(String name) {
    return '$name sẽ được lưu trên thiết bị này';
  }

  @override
  String get offlineOverCapTitle =>
      'Thao tác này sẽ dùng vượt quá giới hạn bộ nhớ của bạn';

  @override
  String offlineOverCapBody(String projected, String cap) {
    return 'Lưu tệp này sẽ nâng tổng dung lượng ngoại tuyến lên $projected, vượt quá hạn mức $cap đặt cho thiết bị. Bạn có thể tiếp tục hoặc tăng hạn mức trong Cài đặt.';
  }

  @override
  String get offlineDownloadsTitle => 'Ngoại tuyến';

  @override
  String get offlineDownloadsBody =>
      'Dung lượng được sử dụng bởi các tệp lưu trữ để dùng khi không có mạng. Bộ nhớ này tách biệt với bộ nhớ của máy chủ.';

  @override
  String offlineFilesKept(int count) {
    return 'Đã lưu $count tệp';
  }

  @override
  String get offlineChosenIndividually => 'Được chọn riêng lẻ';

  @override
  String get offlineClearAll => 'Xóa tất cả tệp ngoại tuyến';

  @override
  String get offlineClearAllConfirm =>
      'Mọi tệp lưu ngoại tuyến trên thiết bị này sẽ bị xóa. Dữ liệu trên máy chủ không bị ảnh hưởng và bạn có thể đánh dấu lưu ngoại tuyến lại bất cứ lúc nào.';

  @override
  String get offlineCleared => 'Đã xóa các tệp ngoại tuyến';

  @override
  String get offlineSoftCapLabel => 'Cảnh báo khi vượt quá';

  @override
  String get offlineNoLimit => 'Không giới hạn';

  @override
  String get offlineNothingKept => 'Chưa có tệp nào được lưu trên thiết bị này';

  @override
  String get offlineNeedsConnection =>
      'Tệp này không được lưu trên thiết bị. Cần có kết nối mạng để mở.';

  @override
  String get offlineWebEnableTitle => 'Cho phép truy cập ngoại tuyến';

  @override
  String get offlineWebEnableSubtitle =>
      'Mở ứng dụng và xem dữ liệu ngay cả khi thiết bị không có kết nối mạng internet.';

  @override
  String get offlineWebDisabledMessage =>
      'Tính năng ngoại tuyến hiện đang tắt. Bật tính năng này để mở Local Drive và duyệt dữ liệu đệm khi không có mạng.';

  @override
  String get offlineStorageTitle => 'Dung lượng';

  @override
  String offlineStorageUsed(String usage, String quota) {
    return 'Đã dùng: $usage / Khả dụng: $quota';
  }

  @override
  String offlineStorageCachedCount(int count) {
    return 'Đã lưu $count thư mục và tệp trong bộ nhớ đệm';
  }

  @override
  String get offlineClearCache => 'Xóa bộ nhớ đệm ngoại tuyến';

  @override
  String get offlineClearCacheConfirm =>
      'Toàn bộ dữ liệu đệm tệp và cấu trúc thư mục trên trình duyệt này sẽ bị xóa. Dữ liệu trên máy chủ không bị ảnh hưởng.';

  @override
  String get offlineCacheCleared => 'Đã xóa toàn bộ bộ nhớ đệm ngoại tuyến';

  @override
  String get offlineSyncTitle => 'Cách đồng bộ hóa';

  @override
  String get offlineSyncSmartCacheTitle => 'Lưu đệm thông minh';

  @override
  String get offlineSyncSmartCacheBody =>
      'Khi bạn duyệt tệp, cấu trúc thư mục và thông tin tệp được tự động lưu vào bộ nhớ cục bộ của trình duyệt.';

  @override
  String get offlineSyncBrowsingTitle => 'Duyệt khi mất mạng';

  @override
  String get offlineSyncBrowsingBody =>
      'Khi mất kết nối, ứng dụng tự động chuyển sang đọc từ bộ nhớ đệm để bạn vẫn duyệt được thư mục và xem chi tiết tệp.';

  @override
  String get offlineSyncReconnectTitle => 'Tự động đồng bộ hóa';

  @override
  String get offlineSyncReconnectBody =>
      'Khi kết nối mạng phục hồi, ứng dụng tự động kiểm tra và cập nhật những thay đổi mới nhất từ máy chủ.';

  @override
  String get offlineSyncPwaTitle => 'Cài đặt ứng dụng (PWA)';

  @override
  String get offlineSyncPwaBody =>
      'Nhấn vào biểu tượng Cài đặt ứng dụng trên thanh địa chỉ trình duyệt để cài Local Drive. Bạn có thể mở trực tiếp từ màn hình chính ngay cả khi ngắt kết nối mạng.';

  @override
  String get offlineSecurityTitle => 'Bảo mật';

  @override
  String get offlineSecuritySandboxTitle => 'Cô lập theo nguồn gốc';

  @override
  String get offlineSecuritySandboxBody =>
      'Dữ liệu được bảo vệ an toàn trong hộp cát riêng của tên miền trình duyệt. Không trang web nào khác có thể truy cập.';

  @override
  String get offlineSecurityWipeTitle => 'Tự động xóa khi Đăng xuất';

  @override
  String get offlineSecurityWipeBody =>
      'Khi bạn đăng xuất, toàn bộ dữ liệu ngoại tuyến và bộ nhớ đệm sẽ được xóa sạch khỏi thiết bị này.';

  @override
  String get offlineSecuritySharedTitle => 'Khuyến cáo thiết bị công cộng';

  @override
  String get offlineSecuritySharedBody =>
      'Không nên bật ngoại tuyến trên máy tính công cộng, hoặc luôn nhớ Đăng xuất sau khi sử dụng.';

  @override
  String get previewCannotPreview => 'Định dạng này không hỗ trợ xem trước';

  @override
  String get previewCannotOpenTitle => 'Không thể mở tệp này';

  @override
  String get previewCannotOpenBody =>
      'Tệp có thể bị hỏng hoặc lưu ở định dạng mà trình đọc này không hiểu. Bạn có thể tải xuống và mở bằng ứng dụng khác.';

  @override
  String get previewDownloadToOpen => 'Tải xuống để mở trong ứng dụng khác';

  @override
  String previewPageOf(String page, String total) {
    return 'Trang $page / $total';
  }

  @override
  String get previewPreviousPage => 'Trang trước';

  @override
  String get previewNextPage => 'Trang sau';

  @override
  String get previewSkipBack => 'Lùi 15 giây';

  @override
  String get previewSkipForward => 'Tua tới 15 giây';

  @override
  String get previewTruncated =>
      'Đang hiển thị phần đầu của tệp. Tệp quá lớn để có thể mở đầy đủ tại đây.';

  @override
  String get sheetEmptyTitle => 'Bảng tính này không có ô dữ liệu nào';

  @override
  String get sheetEmptyBody => 'Tệp đã mở nhưng không có dữ liệu để hiển thị.';

  @override
  String sheetUnnamed(String number) {
    return 'Trang tính $number';
  }

  @override
  String get documentEmptyTitle => 'Tài liệu này không có văn bản';

  @override
  String get documentEmptyBody =>
      'Tệp đã mở nhưng không có văn bản để hiển thị.';

  @override
  String get downloadNoFiles =>
      'Không thể tải thư mục dưới dạng một tệp đơn lẻ';

  @override
  String downloadQueuedOne(String name) {
    return 'Đang tải xuống $name';
  }

  @override
  String downloadQueuedMany(int count) {
    return 'Đang tải xuống $count tệp';
  }

  @override
  String downloadSavedTo(String location) {
    return 'Đã lưu vào $location';
  }

  @override
  String sizeBytes(String size) {
    return '$size B';
  }

  @override
  String sizeKilobytes(String size) {
    return '$size KB';
  }

  @override
  String sizeMegabytes(String size) {
    return '$size MB';
  }

  @override
  String sizeGigabytes(String size) {
    return '$size GB';
  }

  @override
  String sizeTerabytes(String size) {
    return '$size TB';
  }

  @override
  String get timeJustNow => 'Vừa xong';

  @override
  String timeMinutesAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count phút trước',
      one: '1 phút trước',
    );
    return '$_temp0';
  }

  @override
  String timeHoursAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count giờ trước',
      one: '1 giờ trước',
    );
    return '$_temp0';
  }

  @override
  String timeDaysAgo(int count) {
    String _temp0 = intl.Intl.pluralLogic(
      count,
      locale: localeName,
      other: '$count ngày trước',
      one: 'Hôm qua',
    );
    return '$_temp0';
  }

  @override
  String get twoFactorTitle => 'Xác thực hai yếu tố (2FA)';

  @override
  String get twoFactorRequiredBody =>
      'Tài khoản này quản trị máy chủ, do đó bắt buộc bật xác thực hai bước. Thao tác chỉ mất khoảng một phút.';

  @override
  String get twoFactorOptionalBody =>
      'Thêm một bước xác nhận khi đăng nhập để tăng cường bảo mật. Bạn có thể chọn bật hoặc tắt.';

  @override
  String get twoFactorScanTitle =>
      'Thêm tài khoản vào ứng dụng xác thực của bạn';

  @override
  String get twoFactorUseQr => 'Quét mã QR';

  @override
  String get twoFactorUseKey => 'Nhập khóa bí mật';

  @override
  String get twoFactorKeyBody =>
      'Sử dụng cách này nếu ứng dụng xác thực ở trên thiết bị khác, hoặc bạn lưu mã trong trình quản lý mật khẩu.';

  @override
  String get twoFactorConfirmTitle =>
      'Nhập mã gồm sáu chữ số hiển thị trên ứng dụng';

  @override
  String get twoFactorCodeHint => 'Sáu chữ số';

  @override
  String get twoFactorTurnOn => 'Bật xác thực hai yếu tố';

  @override
  String get twoFactorOn => 'Xác thực hai yếu tố đang bật';

  @override
  String get twoFactorOff => 'Tắt';

  @override
  String get twoFactorAlreadyOnBody =>
      'Tài khoản này đã được bật xác thực mã hai bước khi đăng nhập.';

  @override
  String get recoveryCodesTitle => 'Lưu các mã khôi phục này';

  @override
  String get recoveryCodesBody =>
      'Mỗi mã có thể dùng để đăng nhập một lần nếu bạn mất ứng dụng xác thực. Hãy lưu chúng ở nơi an toàn ngoài thiết bị này.';

  @override
  String get moreActions => 'Thêm';

  @override
  String get dropToUpload => 'Thả để tải lên';

  @override
  String get dropToUploadHint => 'Thư mục sẽ giữ nguyên cấu trúc';

  @override
  String get dropToUploadHintWeb => 'Các tệp sẽ được thêm vào thư mục này';

  @override
  String get errorFoldersNotSupportedWeb =>
      'Không thể kéo thả cả thư mục trên trình duyệt web. Hãy kéo các tệp bên trong thư mục thay thế.';

  @override
  String get uploadClashTitle => 'Tên tệp này đã tồn tại';

  @override
  String get uploadClashTitleMany => 'Một số tên tệp đã tồn tại';

  @override
  String uploadClashBody(String name) {
    return 'Thư mục này đã có tệp tên là $name.';
  }

  @override
  String uploadClashBodyMany(String count) {
    return '$count tệp bạn đang tải lên trùng tên với các tệp đã có trong thư mục này.';
  }

  @override
  String get uploadClashKeepBoth => 'Giữ cả hai';

  @override
  String get uploadClashReplace => 'Thay thế bằng tệp mới';

  @override
  String get uploadClashSkip => 'Bỏ qua các tệp này';

  @override
  String get versionSection => 'Phiên bản';

  @override
  String get versionInstalled => 'Đã cài đặt';

  @override
  String get updateCheck => 'Kiểm tra cập nhật';

  @override
  String get updateChecking => 'Đang kiểm tra';

  @override
  String get updateUpToDate => 'Bạn đang dùng bản mới nhất';

  @override
  String updateUpToDateBody(String version) {
    return 'Phiên bản $version là bản phát hành mới nhất.';
  }

  @override
  String updateAvailable(String version) {
    return 'Đã có phiên bản $version';
  }

  @override
  String get updateInstall => 'Tải xuống và cài đặt';

  @override
  String get updateDownloading => 'Đang tải xuống';

  @override
  String get updateInstalling => 'Đang cài đặt';

  @override
  String get updateRestartNote =>
      'Ứng dụng sẽ tự động đóng và mở lại sau khi cập nhật hoàn tất.';

  @override
  String get updateAndroidNote =>
      'Android sẽ hỏi quyền trước khi tiến hành cài đặt.';

  @override
  String get updateNotes => 'Nội dung thay đổi';

  @override
  String get updateManualOnly =>
      'Bản dựng này cập nhật đồng bộ cùng máy chủ phục vụ nó.';

  @override
  String get settingsAppearance => 'Giao diện';

  @override
  String get themeSubtitle => 'Tùy chỉnh giao diện hiển thị trên thiết bị này';

  @override
  String get themeSystem => 'Theo hệ thống';

  @override
  String get themeLight => 'Sáng';

  @override
  String get themeDark => 'Tối';
}
