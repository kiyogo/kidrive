import os
import subprocess
import shutil
from PIL import Image

EDGE_EXE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
WORKSPACE = r"e:\DATA\source\Nas\LocalDrive"
SVG_PATH = os.path.join(WORKSPACE, "localdrive", "assets", "logo", "mark.svg")

def render_svg_to_high_res_png(svg_path, out_png, render_size=2048):
    with open(svg_path, "r", encoding="utf-8") as f:
        svg_content = f.read()

    html_content = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html, body {{
    width: {render_size}px;
    height: {render_size}px;
    background: transparent !important;
    overflow: hidden;
  }}
  svg {{
    width: {render_size}px;
    height: {render_size}px;
    display: block;
  }}
</style>
</head>
<body>
{svg_content}
</body>
</html>"""

    temp_html = os.path.join(WORKSPACE, "temp_render.html")
    with open(temp_html, "w", encoding="utf-8") as f:
        f.write(html_content)

    url_path = "file:///" + temp_html.replace("\\", "/")
    cmd = [
        EDGE_EXE,
        "--headless=new",
        "--disable-gpu",
        f"--screenshot={out_png}",
        f"--window-size={render_size},{render_size}",
        "--default-background-color=00000000",
        url_path
    ]

    try:
        subprocess.run(cmd, check=True)
    finally:
        if os.path.exists(temp_html):
            os.remove(temp_html)

def create_fitted_canvas(cropped_folder, canvas_size, scale=0.98):
    """
    Fits cropped_folder inside a square canvas of canvas_size x canvas_size.
    scaled to occupy `scale` of the canvas width, perfectly centered.
    Background is completely transparent (0, 0, 0, 0).
    """
    target_w = int(round(canvas_size * scale))
    # Keep aspect ratio
    target_h = int(round(target_w * (cropped_folder.height / cropped_folder.width)))
    
    # If target_h exceeds canvas_size * scale, fit by height instead
    if target_h > int(round(canvas_size * scale)):
        target_h = int(round(canvas_size * scale))
        target_w = int(round(target_h * (cropped_folder.width / cropped_folder.height)))

    resized = cropped_folder.resize((target_w, target_h), Image.Resampling.LANCZOS)
    
    canvas = Image.new("RGBA", (canvas_size, canvas_size), (0, 0, 0, 0))
    pos_x = (canvas_size - target_w) // 2
    pos_y = (canvas_size - target_h) // 2
    canvas.paste(resized, (pos_x, pos_y), resized)
    return canvas

def main():
    print(f"Reading SVG from {SVG_PATH}")
    temp_render_png = os.path.join(WORKSPACE, "temp_render_2048.png")
    render_svg_to_high_res_png(SVG_PATH, temp_render_png, render_size=2048)

    base_img = Image.open(temp_render_png)
    bbox = base_img.getbbox()
    print(f"Rendered image size: {base_img.size}, bbox: {bbox}")
    cropped = base_img.crop(bbox)
    print(f"Cropped folder size: {cropped.size}, aspect ratio: {cropped.width / cropped.height:.3f}")

    # Generate 1024x1024 master icon (scale 0.98 for maximum size edge-to-edge without clipping)
    icon_1024 = create_fitted_canvas(cropped, 1024, scale=0.98)
    
    # Adaptive foreground (Android safe area is inner 72%)
    icon_fg_1024 = create_fitted_canvas(cropped, 1024, scale=0.72)
    
    # Splash (512x512, scale 0.75)
    icon_splash = create_fitted_canvas(cropped, 512, scale=0.75)
    
    # Tray PNG (64x64, scale 0.96)
    icon_tray_64 = create_fitted_canvas(cropped, 64, scale=0.96)
    
    # 256x256 base for ICO (scale 0.98)
    icon_256 = create_fitted_canvas(cropped, 256, scale=0.98)

    # Output paths
    logo_dir = os.path.join(WORKSPACE, "localdrive", "assets", "logo")
    os.makedirs(logo_dir, exist_ok=True)
    
    mark_1024_path = os.path.join(logo_dir, "mark_1024.png")
    mark_fg_path = os.path.join(logo_dir, "mark_foreground_1024.png")
    mark_splash_path = os.path.join(logo_dir, "mark_splash.png")
    tray_png_path = os.path.join(logo_dir, "tray.png")
    tray_ico_path = os.path.join(logo_dir, "tray.ico")
    app_ico_flutter_path = os.path.join(WORKSPACE, "localdrive", "windows", "runner", "resources", "app_icon.ico")
    app_ico_logo_path = os.path.join(logo_dir, "app_icon.ico")
    app_ico_installer_path = os.path.join(WORKSPACE, "windows-installer", "app_icon.ico")
    localdrive_ico_installer_path = os.path.join(WORKSPACE, "windows-installer", "LocalDrive.ico")
    app_ico_winapp_path = os.path.join(WORKSPACE, "windows-app", "app_icon.ico")

    # Save PNGs
    icon_1024.save(mark_1024_path, "PNG")
    print(f"Saved: {mark_1024_path}")
    icon_fg_1024.save(mark_fg_path, "PNG")
    print(f"Saved: {mark_fg_path}")
    icon_splash.save(mark_splash_path, "PNG")
    print(f"Saved: {mark_splash_path}")
    icon_tray_64.save(tray_png_path, "PNG")
    print(f"Saved: {tray_png_path}")

    # Generate multi-size ICO for app_icon.ico
    # Windows taskbar, window title, explorer use sizes: 256, 128, 64, 48, 40, 32, 24, 20, 16
    app_ico_sizes = [(256, 256), (128, 128), (64, 64), (48, 48), (40, 40), (32, 32), (24, 24), (20, 20), (16, 16)]
    icon_256.save(app_ico_flutter_path, format="ICO", sizes=app_ico_sizes)
    print(f"Saved: {app_ico_flutter_path}")
    shutil.copy2(app_ico_flutter_path, app_ico_logo_path)
    print(f"Copied to: {app_ico_logo_path}")
    shutil.copy2(app_ico_flutter_path, app_ico_installer_path)
    print(f"Copied to: {app_ico_installer_path}")
    shutil.copy2(app_ico_flutter_path, localdrive_ico_installer_path)
    print(f"Copied to: {localdrive_ico_installer_path}")
    shutil.copy2(app_ico_flutter_path, app_ico_winapp_path)
    print(f"Copied to: {app_ico_winapp_path}")

    # Generate tray.ico (sizes: 64, 48, 32, 24, 16)
    tray_ico_sizes = [(64, 64), (48, 48), (32, 32), (24, 24), (16, 16)]
    icon_256.save(tray_ico_path, format="ICO", sizes=tray_ico_sizes)
    print(f"Saved: {tray_ico_path}")

    base_img.close()
    if os.path.exists(temp_render_png):
        os.remove(temp_render_png)
    print("All icons successfully generated!")

if __name__ == "__main__":
    main()
