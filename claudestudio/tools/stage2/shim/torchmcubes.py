# Stand-in for torchmcubes (a CUDA/C++ extension) using scikit-image, same
# output convention: vertices as (x, y, z) = (axis2, axis1, axis0) of the grid.
import numpy as np, torch
from skimage import measure

def marching_cubes(vol, level):
    v, f, _, _ = measure.marching_cubes(vol.cpu().numpy(), level)
    v = np.ascontiguousarray(v[:, ::-1])
    f = np.ascontiguousarray(f[:, ::-1])  # reversing axes mirrors, so flip winding back
    return torch.from_numpy(v.astype(np.float32)), torch.from_numpy(f.astype(np.int64))
