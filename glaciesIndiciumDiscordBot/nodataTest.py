import glob
import os

from osgeo import gdal
import numpy as np

os.chdir(r'D:\dev\terracotta\lake')           # change to directory with the tiff files

filenames = glob.glob('*.tif')

for fn in filenames:
    ds = gdal.Open(fn, 1)                      # pass 1 to modify the raster
    n = ds.RasterCount                         # get number of bands
    for i in range(1, n + 1):
        band = ds.GetRasterBand(i)
        arr = band.ReadAsArray()               # read band as numpy array
        print(arr)
        arr = np.where(arr == 0, -10000, arr)  # change 0 to -10000
        band.WriteArray(arr)                   # write the new array
        band.SetNoDataValue(-10000)            # set the NoData value
        band.FlushCache()                      # save changes
    del ds
