from collections import defaultdict
from pathlib import Path
import os
import subprocess


def build_mosaics(temp_folder, output_folder, should_remove_border):
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

        translate_string = create_translate_string(output_folder, group, should_remove_border)
        run_mosaic_subprocess(imageGroupList, translate_string)


def create_file_groups(pathlist):
    groups = defaultdict(list)

    for path in pathlist:
        regions = str(path.stem).split('_')

        for index in range(0, len(regions) - 1):
            groups[regions[index]].append(str(path))

    return groups


def create_translate_string(output_folder, group, should_remove_border):
    translate_string = "gdal_translate -of GTiff "

    if should_remove_border:
        translate_string += "-a_nodata 0 "

    translate_string += "-co \"TILED=YES\" mosaic.vrt " + \
        str(output_folder) + "/" + group + ".tif"

    return translate_string


def run_mosaic_subprocess(group_list, translate_string):
    vrtString = "gdalbuildvrt mosaic.vrt " + group_list

    subprocess.call(vrtString, shell=True)

    subprocess.call(translate_string, shell=True)

    os.remove("mosaic.vrt")
