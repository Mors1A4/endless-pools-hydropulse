from PIL import Image
import os

img_path = r"C:\Users\monty\.gemini\antigravity\brain\50b80a58-4cfb-4146-aa64-29ff2d8324dd\device_screenshots\pixel_8_392x850.png"
if os.path.exists(img_path):
    with Image.open(img_path) as im:
        print(f"Image actual pixel dimensions: width={im.width}, height={im.height}")
else:
    print("Not found")
