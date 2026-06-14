import io
import zipfile
import qrcode
from PIL import Image, ImageDraw, ImageFont


def generar_qr_imagen(texto: str, box_size: int = 20, border: int = 4) -> bytes:
    """Genera una imagen PNG de un QR con el nombre del alumno debajo."""
    qr = qrcode.QRCode(version=1, box_size=box_size, border=border)
    qr.add_data(texto)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    qr_width, qr_height = img_qr.size
    extra_padding = 90
    canvas = Image.new("RGB", (qr_width, qr_height + extra_padding), "white")
    canvas.paste(img_qr, (0, 0))

    draw = ImageDraw.Draw(canvas)
    try:
        font = ImageFont.truetype("DejaVuSans.ttf", 30)
    except Exception:
        font = ImageFont.load_default()

    texto_corto = texto if len(texto) <= 40 else f"{texto[:37]}..."
    bbox = draw.textbbox((0, 0), texto_corto, font=font)
    text_width = bbox[2] - bbox[0]
    text_x = (qr_width - text_width) // 2
    text_y = qr_height + 20
    draw.text((text_x, text_y), texto_corto, fill="black", font=font)

    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def generar_zip_qrs(alumnos: list) -> bytes:
    """Genera un ZIP con QRs para cada alumno. Cada alumno es dict con 'nombre' y 'matricula'."""
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for a in alumnos:
            nombre = a.get("nombre", "").strip()
            matricula = a.get("matricula", "").strip()
            if not nombre:
                continue
            # El QR contiene el token único (matricula como fallback)
            contenido_qr = matricula or nombre
            img_bytes = generar_qr_imagen(contenido_qr)
            filename = f"{matricula or nombre}.png".replace(" ", "_")
            # Sanitizar
            filename = "".join(
                c for c in filename if c.isalnum() or c in "._-_"
            )
            if not filename.endswith(".png"):
                filename += ".png"
            zf.writestr(filename, img_bytes)
    zip_buf.seek(0)
    return zip_buf.getvalue()