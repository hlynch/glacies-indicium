import numpy as np
import rasterio
from rasterio.warp import calculate_default_transform, reproject, Resampling

dst_crs = 'EPSG:4326'

with rasterio.open('WV02_2210_GeoTIFF_stack_1.tif') as src:
    print(src.crs, src.width, src.height)
