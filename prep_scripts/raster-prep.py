from pathlib import Path
import argparse
import bands
import emoji
import mosaics
import regions
import shutil
import tempfile
import utilities

REGIONS_FILE = 'all_regions.csv'
COORDINATES_FILE = 'L4_regions_sparse.csv'
REGIONS_JSON_FILE = 'all_regions.json'
DEFAULT_OUTPUT_FOLDER = '..\\terracotta\\client\\static\\mosaics\\'


def add_parser_arguments():
    description = 'Process some GeoTIFFs according to a regional boundary key'
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument('--data_folder', '-d', help='Location of some GeoTIFF files')

    return parser


def main():
    parser = add_parser_arguments()
    args = parser.parse_args()

    # get the path to the data folder and output folder from the argument
    data_folder = Path(args.data_folder)
    output_folder = Path(DEFAULT_OUTPUT_FOLDER)

    region_centers = utilities.ingest_csv_file(COORDINATES_FILE)
    print("found " + str(len(region_centers)) + " regions in key file")

    # generate the json with the full regional hierarchy
    regions.generate_json_hierarchy(REGIONS_FILE, REGIONS_JSON_FILE)

    # run first two steps with a temporary directory to hold files
    with tempfile.TemporaryDirectory() as temp_folder:
        regions.rekey_by_region(data_folder, temp_folder, region_centers)

        input("press ENTER to continue...")

        mosaics.build_mosaics(temp_folder, output_folder, region_centers)

        shutil.rmtree(temp_folder)

    input("press ENTER to continue...")

    bands.extract_bands(output_folder, output_folder)

    print(emoji.emojize("\nRaster preprocessing is now complete! :party_popper:"))


if __name__ == "__main__":
    main()
