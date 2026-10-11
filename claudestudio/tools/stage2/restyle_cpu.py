# Stage 2, step 1 (CPU route): restyle a reference character to realistic with
# SD-Turbo img2img. Usage: restyle_cpu.py IN.png OUT.png [strength] [seed] [prompt]
import sys, torch
from PIL import Image
from diffusers import AutoPipelineForImage2Image

src, dst = sys.argv[1], sys.argv[2]
strength = float(sys.argv[3]) if len(sys.argv) > 3 else 0.5
seed = int(sys.argv[4]) if len(sys.argv) > 4 else 0
prompt = sys.argv[5] if len(sys.argv) > 5 else (
    'full body photo of a real man, adventurer outfit, realistic, photographic, '
    'standing, facing camera, plain white studio background, sharp focus')
torch.set_num_threads(4)
pipe = AutoPipelineForImage2Image.from_pretrained('stabilityai/sd-turbo', torch_dtype=torch.float32)
img = Image.open(src).convert('RGBA')
bg = Image.new('RGBA', img.size, (255, 255, 255, 255)); bg.alpha_composite(img)
img = bg.convert('RGB').resize((512, 512), Image.LANCZOS)
steps = max(2, int(round(1 / strength)) + 1)  # sd-turbo: steps * strength >= 1
out = pipe(prompt, image=img, num_inference_steps=steps, strength=strength,
           guidance_scale=0.0, generator=torch.Generator().manual_seed(seed)).images[0]
out.save(dst)
print('saved', dst)
