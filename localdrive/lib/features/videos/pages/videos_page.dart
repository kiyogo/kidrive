import '../../../imports.dart';
import 'desktop/videos_page_desktop.dart';
import 'mobile/videos_page_mobile.dart';

/// All videos in one place, sorted by upload or modification time.
class VideosPage extends StatelessWidget {
  const VideosPage({super.key});

  @override
  Widget build(BuildContext context) {
    return LdResponsive(
      mobile: (_) => const VideosPageMobile(),
      desktop: (_) => const VideosPageDesktop(),
    );
  }
}
