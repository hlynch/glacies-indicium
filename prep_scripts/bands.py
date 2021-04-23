from pathlib import Path
import os
import rasterio
import subprocess
import utilities

BAND_NAMES_FILE = Path('../terracotta/client/static/data/bandNames.json')


def extract_bands(data_folder_in, output_folder):

    print("####### BAND EXTRACTION ROUTINE #######")
    # make a pathlist of paths to each geotiff in the data folder
    pathlist = Path(data_folder_in).glob('*.tif')

    print("reading geotiffs in the data folder...")

    # iterate over each geotiff in the provided data folder
    for path in pathlist:
        # extract the filename
        file_name = str(path.stem)
        file_path = str(path)

        print('\t' + file_name)
        print('\t' + file_path)

        raster = rasterio.open(path)
        utilities.report_raster_data(raster)

        print('\t\tband extraction...')
        create_band_files(raster.count, file_name, file_path, output_folder)

        raster.close()
        os.remove(file_path)


def create_band_files(total_bands, file_name, path, output_folder):
    band_keys = utilities.ingest_json_file(BAND_NAMES_FILE)

    for index in range(1, total_bands + 1):
        outfile_name = file_name + "_" + band_keys[index - 1]['name'] + ".tif"

        outfile_path = str(output_folder.joinpath(outfile_name))
        print('\t\t\t' + outfile_path)

        # execute a gdal_translate in the os shell to extract bands to separate files
        # stdout parameter suppresses the gdal output
        do_translate = subprocess.run(
            ["gdal_translate", "-b", str(index), path, outfile_path], stdout=subprocess.DEVNULL)
