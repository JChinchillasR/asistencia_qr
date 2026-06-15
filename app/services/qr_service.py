import io
import zipfile
import qrcode
from PIL import Image, ImageDraw, ImageFont


def obtener_fuente(size: int) -> ImageFont.FreeTypeFont:
    """
    Busca una fuente que soporte UTF-8 (tildes, ñ, etc.).
    Prueba rutas comunes de Windows y Linux/Docker.
    """
    fuentes_posibles = [
        "DejaVuSans.ttf",                                # Linux (instalado en Docker)
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", # Ruta absoluta Linux
        "arial.ttf",                                     # Windows
        "Arial.ttf",                                     # Windows (mayúscula)
        "C:/Windows/Fonts/arial.ttf"                     # Ruta absoluta Windows
    ]
    
    for ruta in fuentes_posibles:
        try:
            return ImageFont.truetype(ruta, size)
        except (IOError, OSError):
            continue  # Si no existe, prueba la siguiente
            
    print("⚠️ ADVERTENCIA: No se encontró una fuente TrueType. Las tildes podrían no mostrarse correctamente.")
    return ImageFont.load_default()


def generar_qr_imagen(contenido_qr: str, texto_inferior: str, box_size: int = 35, border: int = 4) -> bytes:
    """
    Genera una imagen PNG de un QR con texto debajo.
    PARÁMETROS FIJOS PARA GARANTIZAR UNIFORMIDAD:
    - box_size=35: Tamaño grande y nítido del QR.
    - font_size=45: Tamaño de letra grande y legible.
    """
    # 1. Generar el código QR
    qr = qrcode.QRCode(version=1, box_size=box_size, border=border)
    qr.add_data(contenido_qr)
    qr.make(fit=True)
    img_qr = qr.make_image(fill_color="black", back_color="white").convert("RGB")

    qr_width, qr_height = img_qr.size
    
    # 2. Configurar el espacio para el texto (uniforme para todos)
    font_size = 45  
    extra_padding = font_size + 40  # Espacio dinámico para que no se corte
    
    canvas = Image.new("RGB", (qr_width, qr_height + extra_padding), "white")
    canvas.paste(img_qr, (0, 0))

    draw = ImageDraw.Draw(canvas)
    font = obtener_fuente(font_size)

    # 3. Manejo de nombres muy largos (para que no se salgan de la imagen)
    max_caracteres = 38
    if len(texto_inferior) > max_caracteres:
        texto_corto = f"{texto_inferior[:max_caracteres-3]}..."
    else:
        texto_corto = texto_inferior

    # 4. Calcular el ancho del texto para centrarlo perfectamente
    try:
        # Método moderno de Pillow
        bbox = draw.textbbox((0, 0), texto_corto, font=font)
        text_width = bbox[2] - bbox[0]
    except Exception:
        # Fallback para versiones antiguas de Pillow
        text_width = draw.textlength(texto_corto, font=font)

    text_x = (qr_width - text_width) // 2
    text_y = qr_height + 20  # Margen superior del texto respecto al QR
    
    # 5. Dibujar el texto (Pillow maneja UTF-8 nativamente con la fuente correcta)
    draw.text((text_x, text_y), texto_corto, fill="black", font=font)

    # 6. Guardar en buffer
    buf = io.BytesIO()
    canvas.save(buf, format="PNG")
    buf.seek(0)
    return buf.getvalue()


def generar_zip_qrs(alumnos: list) -> bytes:
    """
    Genera un ZIP con QRs para cada alumno.
    Aplica el MISMO formato a todos, sin importar si vienen de un grupo o de lista manual.
    """
    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for a in alumnos:
            nombre = a.get("nombre", "").strip()
            matricula = a.get("matricula", "").strip()
            qr_token = a.get("qr_token", "").strip()
            
            if not nombre:
                continue
            
            # El QR contiene el token seguro (o la matrícula/nombre si es modo manual)
            contenido_qr = qr_token if qr_token else (matricula if matricula else nombre)
            
            # Generamos la imagen: el QR tiene el código, pero el texto visible SIEMPRE es el NOMBRE
            img_bytes = generar_qr_imagen(contenido_qr=contenido_qr, texto_inferior=nombre)
            
            # Nombre del archivo: prioriza matrícula, si no, usa el nombre (sanitizado)
            nombre_archivo = f"{matricula or nombre}.png".replace(" ", "_")
            nombre_archivo = "".join(c for c in nombre_archivo if c.isalnum() or c in "._-")
            if not nombre_archivo.endswith(".png"):
                nombre_archivo += ".png"
                
            zf.writestr(nombre_archivo, img_bytes)
            
    zip_buf.seek(0)
    return zip_buf.getvalue()