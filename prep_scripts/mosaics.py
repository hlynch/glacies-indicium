from collections import defaultdict
from pathlib import Path
import os
import subprocess


def build_mosaics(temp_folder, output_folder, region_centers):
    print("####### REGIONAL MOSAIC GENERATION ROUTINE #######")

    pathlist = Path(temp_folder).glob('*.tif')

    groups = create_file_groups(pathlist)

    # visit each unique region name found in these files
    # and make a string that is a list of their filenames
    # separated by spaces
    # this will be an argument to the gdalbuildvrt command
    for group in groups:

        imageGroupList = ""
        pathlist = Path(temp_folder).glob('*.tif')
        for path in pathlist:
            if group in str(path.stem):
                imageGroupList += str(path) + " "
        print("\nGroup: " + group)

        run_mosaic_subprocess(imageGroupList, group, output_folder)


def create_file_groups(pathlist):
    groups = defaultdict(list)

    for path in pathlist:
        regions = str(path.stem).split('_')

        for index in range(0, len(regions) - 1):
            groups[regions[index]].append(str(path))

    return groups


def run_mosaic_subprocess(group_list, group, output_folder):
    vrtString = "gdalbuildvrt mosaic.vrt " + group_list

    subprocess.call(vrtString, shell=True)

    translate_string = "gdal_translate -of GTiff -co \"TILED=YES\" mosaic.vrt " + \
        str(output_folder) + "/" + group + ".tif"

    subprocess.call(translate_string, shell=True)

    os.remove("mosaic.vrt")
