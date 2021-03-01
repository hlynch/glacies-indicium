from pathlib import Path
import rasterio
import argparse
import subprocess

# TODO:
# - logic to read in the csv from mark containing the regional key info
# - logic to correlate each file's boundary data to the regional keys
# - logic to generate a series of regional mosaics (might want a separate script...)
# - compartmentalize this script into appropriately bite-sized functions

# BAND EXTRACTION FUNCTION #
def band_extract(data_folder, output_folder):
    ##################################
    # DEFINE THE BAND KEY DICTIONARY #
    ##################################
    # dictionary to correlate band numbers with proper names
    # note: i made this information up
    bandkeys = {
            "1": "red",
            "2": "green",
            "3": "blue",
            "4": "snow",
            "5": "ice",
            "6": "shadow",
            "7": "granite",
            "8": "dolerite"
            }

    # make a pathlist of paths to each geotiff in the data folder
    pathlist = Path(data_folder).glob('*.tif')

    # iterate over each geotiff in the provided data folder
    for path in pathlist:


        print("reading geotiffs in the data folder...")

        ##############################
        # PRELIMINARY INFO GATHERING #
        ##############################
        # extract the filename
        filename = str(path.stem)
        filepath = str(path)

        # print the name of and path to this file
        print('\t' + filename)
        print('\t' + filepath)

        # open the file with rasterio
        raster = rasterio.open(path)

        # get the boundary info and the number of bands in the file
        bounds = raster.bounds
        nbands = raster.count
        crs = raster.crs
        transform = raster.transform
        nodatavals = raster.nodatavals
        # get the center coordinate of the raster
        centerX, centerY = raster.xy(raster.height // 2, raster.width // 2)

        # print the boundary info and number of bands
        print('\t\tbounds: ' + str(bounds))
        print('\t\tnbands: ' + str(nbands))
        print('\t\tcrs: ' + str(crs))
        print('\t\tnodatavals: ' + str(nodatavals))
        print('\t\tcenterX, centerY: ' + str(centerX) + ', ' + str(centerY))

        ###################
        # BAND EXTRACTION #
        ###################
        # EXTRACT ALL THE BANDS TO THEIR OWN PROPERLY-KEYED SEPARATE FILES

        # for each band in the file:
        print('\t\tband extraction...')
        for band in range(1, nbands+1):
            # construct a new filename that has band name as a final key
            outfile_name = filename + "_" + bandkeys.get(str(band)) + ".tif"
            # make a filepath with the new file name
            outfile_path = output_folder.joinpath(outfile_name)
            print('\t\t\t' + str(outfile_path))

            # execute a gdal_translate in the os shell to extract bands to separate files
            # stdout parameter suppresses the gdal output
            do_translate = subprocess.run(["gdal_translate", "-b", str(band), str(path), str(outfile_path)], stdout=subprocess.DEVNULL)

# REGION KEYING FUNCTION
def rekey_by_region(data_folder, output_folder):
    # INGEST MARK'S CSV WITH REGIONAL INFORMATION
    # FOR EACH REGION LEVEL:
        # IF RASTER BOUNDS ARE WITHIN REGIONAL BOUNDS:
            # APPEND REGION NAME + "_" SEPARATOR TO OUTFILE_NAME
    # END RESULT E.G. "NorthernVictoriaLand_McMurdoDryValleys_TaylorValley_KukriHills"
    return

# MOSAIC GENERATION FUNCTION
def build_mosaics(data_folder, output_folder):
    # GENERATING MOSAICS
        # NOT SURE WHERE THIS FITS IN YET. MUST CALL GDAL TO BUILD VRTS AND THEN STITCH
        # THEM TOGETHER ON A REGION-BY-REGION BASIS. MIGHT BE BEST TO DO THIS IN A SEPARATE SCRIPT.
        # IF WE HAVE 4 LEVELS, A B C D, WE NEED:
            # MOSAICS OF Ds TO COVER Cs,
                # MOSAICS OF Cs TO COVER Bs, AND
                    # MOSAICS OF Bs TO COVER As
    return

#################
# Main Function #
#################
def main():
    # build an argument parser object
    parser = argparse.ArgumentParser(description=
            'Process some GeoTIFFs according to a regional boundary key')
    parser.add_argument('--data_folder', '-d', help='Location of some GeoTIFF files')
    parser.add_argument('--output_folder', '-o', help='Location to output new GeoTIFF files')
    args = parser.parse_args()

    # get the path to the data folder and output folder from the argument
    data_folder = Path(args.data_folder)
    output_folder = Path(args.output_folder)

    ############################
    # MAIN PREPROCESSING STEPS #
    ############################
    # pass the input/output folders to functions to perform the preprocessing steps

    # band extraction
    band_extract(data_folder, output_folder)

    # region keying
    rekey_by_region(data_folder, output_folder)

    # mosaic generation
    build_mosaics(data_folder, output_folder)


    print("goodbye")


# special variable
if __name__=="__main__":
    main()
