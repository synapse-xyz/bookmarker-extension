#!/usr/bin/env python3
"""
Script para generar iconos básicos para la extensión
Requiere: pip install Pillow
"""

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    print("Instalando Pillow...")
    import subprocess
    subprocess.check_call(["pip", "install", "Pillow"])
    from PIL import Image, ImageDraw, ImageFont

def create_icon(size, filename):
    # Crear imagen con fondo degradado
    img = Image.new('RGB', (size, size), color='white')
    draw = ImageDraw.Draw(img)
    
    # Dibujar fondo degradado (simulado)
    for i in range(size):
        r = int(102 + (118 - 102) * i / size)
        g = int(126 + (75 - 126) * i / size)
        b = int(234 + (162 - 234) * i / size)
        draw.rectangle([(0, i), (size, i+1)], fill=(r, g, b))
    
    # Dibujar un círculo con "N" en el centro
    margin = size // 6
    draw.ellipse([margin, margin, size - margin, size - margin], 
                 fill=(255, 255, 255, 200), outline=(255, 255, 255), width=3)
    
    # Intentar dibujar "N" en el centro
    try:
        font_size = size // 3
        font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", font_size)
    except:
        try:
            font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", font_size)
        except:
            font = ImageFont.load_default()
    
    text = "N"
    bbox = draw.textbbox((0, 0), text, font=font)
    text_width = bbox[2] - bbox[0]
    text_height = bbox[3] - bbox[1]
    position = ((size - text_width) // 2, (size - text_height) // 2 - text_height // 4)
    draw.text(position, text, fill=(102, 126, 234), font=font)
    
    img.save(filename, 'PNG')
    print(f"Icono creado: {filename} ({size}x{size})")

if __name__ == "__main__":
    create_icon(16, "icons/icon16.png")
    create_icon(48, "icons/icon48.png")
    create_icon(128, "icons/icon128.png")
    print("¡Iconos generados exitosamente!")
