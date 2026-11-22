"""Render the README's UML use case diagram as editable SVG and matching PNG.

Run from any directory with Python and Pillow installed. No app dependencies change.
"""

from html import escape
from pathlib import Path
import math
import os

from PIL import Image, ImageDraw, ImageFont


OUT = Path(__file__).resolve().parent
WIDTH, HEIGHT = 1400, 1660
SCALE = 2
INK = "#252525"
MUTED = "#555555"
image = Image.new("RGB", (WIDTH * SCALE, HEIGHT * SCALE), "white")
draw = ImageDraw.Draw(image)
svg = [
    f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}" '
    f'viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-labelledby="title description">',
    '<title id="title">LAFINA core student use case diagram</title>',
    '<desc id="description">A student, as a guest or signed-in user, manages local '
    'plans, notes, reminders, and assistant requests. COR imports and assistant '
    'changes require review. Push-to-talk optionally extends chat. Handbook '
    'questions retrieve evidence. Android supports alerts. The external LAFINA '
    'backend supports optional accounts, sync, online chat, and live voice.</desc>',
    '<rect width="1400" height="1660" fill="white"/>',
]
font_dir = Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts"


def font(size, bold=False):
    filename = "arialbd.ttf" if bold else "arial.ttf"
    candidates = [font_dir / filename, Path(filename)]
    candidates += [Path("/usr/share/fonts/truetype/dejavu") / (
        "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    )]
    for candidate in candidates:
        try:
            return ImageFont.truetype(str(candidate), round(size * SCALE))
        except OSError:
            continue
    raise RuntimeError("Install Arial or DejaVu Sans to render readable labels.")


def text(x, y, value, size=20, bold=False, color=INK, anchor="middle"):
    svg.append(
        f'<text x="{x}" y="{y}" text-anchor="{anchor}" '
        f'font-family="Arial, Helvetica, sans-serif" font-size="{size}" '
        f'font-weight="{700 if bold else 400}" fill="{color}">{escape(value)}</text>'
    )
    draw.text((x * SCALE, y * SCALE), value, font=font(size, bold), fill=color,
              anchor={"middle": "ms", "start": "ls", "end": "rs"}[anchor])


def line(points, dashed=False, arrow=False, color=INK, width=1.5):
    svg.append(
        '<polyline points="' + " ".join(f"{x},{y}" for x, y in points)
        + f'" fill="none" stroke="{color}" stroke-width="{width}"'
        + (' stroke-dasharray="7 5"' if dashed else '') + '/>'
    )
    for start, end in zip(points, points[1:]):
        dx, dy = end[0] - start[0], end[1] - start[1]
        length = math.hypot(dx, dy)
        if dashed:
            for offset in range(0, math.ceil(length), 12):
                a, b = offset / length, min(offset + 7, length) / length
                draw.line([(SCALE * (start[0] + t * dx),
                            SCALE * (start[1] + t * dy)) for t in [a, b]],
                          fill=color, width=round(width * SCALE))
        else:
            draw.line([(x * SCALE, y * SCALE) for x, y in [start, end]],
                      fill=color, width=round(width * SCALE))
    if arrow:
        a, b = points[-2:]
        angle = math.atan2(b[1] - a[1], b[0] - a[0])
        wings = [(b[0] - 12 * math.cos(angle + delta),
                  b[1] - 12 * math.sin(angle + delta)) for delta in [-0.45, 0.45]]
        line([wings[0], b, wings[1]], color=color, width=width)


def ellipse(x, y, rx, ry, labels):
    svg.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" '
               f'fill="white" stroke="{INK}" stroke-width="1.6"/>')
    draw.ellipse(((x-rx)*SCALE, (y-ry)*SCALE, (x+rx)*SCALE, (y+ry)*SCALE),
                 fill="white", outline=INK, width=3)
    for index, label in enumerate(labels):
        text(x, y + 7 + (index - (len(labels)-1)/2) * 24, label)


def actor(x, y, labels):
    svg.append(f'<circle cx="{x}" cy="{y-36}" r="12" fill="white" '
               f'stroke="{INK}" stroke-width="1.8"/>')
    draw.ellipse(((x-12)*SCALE, (y-48)*SCALE, (x+12)*SCALE, (y-24)*SCALE),
                 fill="white", outline=INK, width=4)
    for points in [[(x, y-24), (x, y+20)], [(x-25, y), (x+25, y)],
                   [(x-22, y+50), (x, y+20), (x+22, y+50)]]:
        line(points, width=1.8)
    for index, label in enumerate(labels):
        text(x, y + 78 + 23 * index, label, size=18,
             bold=index == 0, color=INK if index == 0 else MUTED)


# One application boundary; all supporting actors remain outside it.
svg.append('<rect x="220" y="45" width="970" height="1460" '
           'fill="none" stroke="#252525" stroke-width="1.8"/>')
draw.rectangle((220*SCALE, 45*SCALE, 1190*SCALE, 1505*SCALE), outline=INK, width=4)
text(705, 88, "LAFINA", size=32, bold=True)
text(705, 115, "Core student use cases", size=19, color=MUTED)

cases = [
    (170, ["Continue as guest"]),
    (258, ["Manage profile", "and preferences"]),
    (346, ["Manage tasks"]),
    (434, ["Manage calendar events", "and time blocks"]),
    (522, ["Manage notes", "and categories"]),
    (610, ["Import class schedule", "from COR"]),
    (698, ["Manage alarms", "and reminders"]),
    (786, ["Respond to reminder alerts", "and simulated calls"]),
    (874, ["Chat and query", "personal plans"]),
    (962, ["Request assistant", "planning changes"]),
    (1050, ["Ask USTP handbook", "questions"]),
    (1160, ["Manage cloud account", "Register / sign in / sign out"]),
    (1248, ["Sync personal records"]),
    (1336, ["Chat with online AI"]),
    (1424, ["Start online", "voice conversation"]),
]

# Plain UML associations have no arrowheads and run behind the use cases.
for y, _ in cases:
    line([(110, 690), (315, y)], color=MUTED, width=1.25)
for y in [698, 786]:
    line([(1260, 728), (675, y)], color=MUTED)
for y in [1160, 1248, 1336, 1424]:
    line([(1260, 1290), (675, y)], color=MUTED)

for y, labels in cases:
    ellipse(495, y, 180, 35, labels)

for y, labels in [
    (610, ["Review and confirm", "extracted classes"]),
    (874, ["Use push-to-talk", "voice input"]),
    (962, ["Review and confirm", "proposed change"]),
    (1050, ["Retrieve supporting", "handbook evidence"]),
]:
    ellipse(960, y, 165, 35, labels)
    extending = y == 874
    points = [(795, y), (675, y)] if extending else [(675, y), (795, y)]
    line(points, dashed=True, arrow=True)
    text(735, y-14, "<<extend>>" if extending else "<<include>>", size=16)

text(735, 899, "[Voice selected]", size=14, color=MUTED)
text(495, 1117, "OPTIONAL CLOUD SERVICES", size=16, bold=True, color=MUTED)
actor(85, 690, ["Student", "Guest or", "signed-in"])
actor(1285, 728, ["Android OS", "Alert delivery"])
actor(1285, 1290, ["LAFINA backend", "Account, sync, AI", "and voice services"])

text(220, 1545, "Solid line: actor participation", size=18, anchor="start")
text(220, 1574, "<<include>>: required behavior     <<extend>>: optional behavior", size=18, anchor="start")
text(220, 1603, "Cloud features require connectivity and applicable account / Online Mode authorization.",
     size=17, color=MUTED, anchor="start")
text(220, 1632, "Core planning stays local. Android services are specific to the Android client.",
     size=17, color=MUTED, anchor="start")

svg.append('</svg>')
(OUT / "lafina-use-case-diagram.svg").write_text("\n".join(svg) + "\n", encoding="utf-8")
image.save(OUT / "lafina-use-case-diagram.png", optimize=True)
print("Rendered lafina-use-case-diagram.svg and lafina-use-case-diagram.png")
