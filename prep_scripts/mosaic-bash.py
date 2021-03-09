import subprocess
import os

#TODO: make this use the json file and region lists
lowertier = ['MountCole', 'MountGreenlee', 'MountSpeed', 'MountWendland', 'NilsenPeak', 'TaylorNunatak']
uppertier = ['ShackletonGlacier']
REGION4 = 4
REGION1 = 1

def build_mosaic(regionName, tier):

    if (tier != REGION1):
        build_virtual = "gdalbuildvrt mosaic.vrt *" + regionName + "*.tif"

    else:
        build_virtual = "gdalbuildvrt mosaic.vrt " + regionName + "*.tif"

    build_mosaic = "gdal_translate -of GTiff -co \"TILED=YES\" mosaic.vrt ../output/" + regionName + ".tif"

    print("[RUNNING]: "+build_virtual)
    subprocess.run(build_virtual, shell=True)
    print("[RUNNING]: "+build_mosaic)
    subprocess.run(build_mosaic, shell=True)
    os.remove("mosaic.vrt")

# Print the current working directory
print("[CHDIR]: {0}".format(os.getcwd()))

# Change the current working directory
os.chdir('/home/jscarter/glacies-indicium/prep_scripts/source_data')

# Print the current working directory
print("[CHDIR]: {0}".format(os.getcwd()))

for region in lowertier:
    build_mosaic(region, 4)

