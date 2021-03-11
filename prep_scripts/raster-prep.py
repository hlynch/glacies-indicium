from pathlib import Path
import os
import rasterio
import argparse
import subprocess
import csv
import json
import haversine
import uuid
import os
import shutil
import tempfile
from pyproj import Transformer

# TODO:
# - logic to read in the csv from mark containing the regional key info
# - logic to correlate each file's boundary data to the regional keys
# - logic to generate a series of regional mosaics (might want a separate script...)
# - compartmentalize this script into appropriately bite-sized functions
#TODO: make this use the json file and region lists
lowertier = ['MountCole', 'MountGreenlee', 'MountSpeed', 'MountWendland', 'NilsenPeak', 'TaylorNunatak']
uppertier = ['ShackletonGlacier']
REGION4 = 4
REGION1 = 1
#TODO: look at other TODOss

# BAND EXTRACTION FUNCTION #
def band_extract(data_folder_in, output_folder):

    print("####### BAND EXTRACTION ROUTINE #######") 

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
    pathlist = Path(data_folder_in).glob('*.tif')

    print("reading geotiffs in the data folder...")

    # iterate over each geotiff in the provided data folder
    for path in pathlist:

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
def rekey_by_region(data_folder, temp_folder, region_centers, regional_hierarchy):
    # INGEST MARK'S CSV WITH REGIONAL INFORMATION
    # FOR EACH REGION LEVEL:
        # IF RASTER BOUNDS ARE WITHIN REGIONAL BOUNDS:
            # APPEND REGION NAME + "_" SEPARATOR TO OUTFILE_NAME
    # END RESULT E.G. "NorthernVictoriaLand_McMurdoDryValleys_TaylorValley_KukriHills"

    print("####### REGIONAL IDENTIFICATION ROUTINE #######") 

    # make a pathlist of paths to each geotiff in the data folder
    pathlist = Path(data_folder).glob('*.tif')

    print("reading geotiffs in the data folder...")

    # iterate over each geotiff in the provided data folder
    for path in pathlist:
        ##############################
        # PRELIMINARY INFO GATHERING #
        ##############################
        # extract the filename
        filename = str(path.stem)
        filepath = str(path)

        # print the name of and path to this file
        print('\t' + filepath)

        # open the file with rasterio
        raster = rasterio.open(path)

        #######################
        # REGIONAL PROCESSING #
        #######################
        # get the center coordinates of this raster
        # these values are projected in EPSG 3031 (antarctic polar stereographic)
        centerX, centerY = raster.xy(raster.height // 2, raster.width // 2)

        # get the source raster's projection code
        inProjection = str(raster.crs)

        # "unproject" these center coordinates into spherical latitude and longitude
        # which has epsg code 4326
        outProjection = 'epsg:4326'
        transformer = Transformer.from_crs(inProjection, outProjection)
        centerLat, centerLon = transformer.transform(centerX, centerY)

        #print('\t\tunprojected center: ' + str(centerLat) + ', ' + str(centerLon))

        # structure to hold regions with their distances to this raster
        distances_matrix = []

        # visit each region in region_centers
        # at each region, add a row to the distances matrix which has
        # the region name and the distance from this image to that region
        for region in region_centers:
            distance = haversine.distance([centerLat, centerLon], [float(region[1]), float(region[2])])
            distances_matrix.append([region[0], distance])

        #print("\t\t\tdistance matrix:")
        #for region in distances_matrix:
            #print('\t\t\t\t{:<20s} {:<10s}'.format(region[0], str(region[1])))

        # distances_matrix now knows how far this image's center is from all the regions
        # if we sort the matrix by its second column, the first row will be the nearest region
        distances_matrix = sorted(distances_matrix, key=lambda x: x[1])

        nearestRegion = distances_matrix[0][0]
        nearestRegionDistance = distances_matrix[0][1]

        print("\t\tnearest region: ")
        print("\t\t\t" + nearestRegion + "\t" + "{:.2f}".format(nearestRegionDistance) + " km")

        # generate a unique 4-character id for this raster
        rasterId = str(uuid.uuid4())
        rasterId = rasterId[0:4]

        # display the id
        print("\t\tunique id:")
        print("\t\t\t" + rasterId)

        # close the file with rasterio?

        # build a fully-qualified tiered regional name
        newRasterName = build_regional_filename(regional_hierarchy, nearestRegion)

        # construct a new file name
        newRasterName = newRasterName + '_' + rasterId + '.tif'
        print("\t\tnew filename:")
        print("\t\t\t" + newRasterName)

        # construct a temp file path
        tempFilePath = temp_folder + '/' + newRasterName
        print("\t\ttemp filepath:")
        print("\t\t\t" + tempFilePath)

        # move this raster file from its current name/location to a new name/output location
        # new name: regionname_id.tif
        # new location: temp_folder
        result = shutil.copy(filepath, tempFilePath)

    return

# builds single mosaic
# expected naming convention: r1_r2_r3_r4_id.tif
# files currently named: pre_r4_id.tif due to data constraints
def build_mosaic(regionName, tier):
    # Tier 2 - 4 all fit within *regionName*.tif
    if (tier != REGION1):
        build_virtual = "gdalbuildvrt mosaic.vrt *" + regionName + "*.tif"

    else:
        build_virtual = "gdalbuildvrt mosaic.vrt " + regionName + "*.tif"

    build_mosaic = "gdal_translate -of GTiff -co \"TILED=YES\" mosaic.vrt ../temp/" + regionName + ".tif"

    print("\n[RUNNING]: "+build_virtual)
    subprocess.run(build_virtual, shell=True)
    
    print("\n[RUNNING]: "+build_mosaic)
    subprocess.run(build_mosaic, shell=True)
    
    os.remove("mosaic.vrt")

# MOSAIC GENERATION FUNCTION
def build_mosaics(data_folder, output_folder, region_centers):
    # GENERATING MOSAICS
    # Print the current working directory
    #print("\n[CHDIR]: {0}".format(os.getcwd()))

    #TODO: dont do it this way
    # Change the current working directory
    #os.chdir('/home/jscarter/glacies-indicium/prep_scripts/source_data')

    # Print the current working directory
    #print("\n[CHDIR]: {0}".format(os.getcwd()))

    #for region in lowertier:
        #build_mosaic(region, 4)
    
    #TODO: work w/ llogan to develop rest of logic when he finishes region bit

    # for every region in regions list:
    #   make a string of filenames that contain that region
    #   call gdalbuildvrt to build a temp vrt with string of filenames as trailing argument
    #   call gdal_translate to make a mosaic from the vrt
    #   save that mosaic as RegionName.tif
    for region in region_centers:
        break

    return

# ingests a three-column csv of region, lat, lon into a list of
# rows[i][j] where len(i)=len(csv)-1 and len(j)=3 (name, lat, lon)
def ingest_L4_data(region_key_file):
    cols = []
    rows = []

    with open(region_key_file, 'r') as csvfile:
        csvreader = csv.reader(csvfile)

        # advances the reader one position to read the first row
        # which contains the column titles
        cols = next(csvreader)

        # iterates across the rest of the rows and adds them to a list
        for row in csvreader:
            rows.append(row)

        # could also return the col titles from row 1 but they don't really matter
        return rows
    return

# ingests a json file representing the hierarchy of regions
# for file keying purposes
def ingest_regional_json(json_regions_file):
    with open(json_regions_file) as f:
        regional_hierarchy = json.load(f)

    return regional_hierarchy

# build a filename from the regional hierarchy info
def build_regional_filename(regional_hierarchy, t4Region):
    # traverse down the json tree, building a filename at each level each time, until you
    # reach a point where t4 region of the image matches the t4 region we're at
    # then we will have a T1_T2_T3_T4 filename string

    finalRasterNameStack = []
    foundIt = False

    # visit each t1
    for t1 in regional_hierarchy:
        #print(t1['name'])
        finalRasterNameStack.append(t1['name'])
        # visit each t2
        for t2 in t1['subregions']:
            #print('\t'+ t2['name'])
            finalRasterNameStack.append(t2['name'])
            # visit each t3
            for t3 in t2['subregions']:
                #print('\t\t' + t3['name'])
                finalRasterNameStack.append(t3['name'])
                # visit each t4
                for t4 in t3['subregions']:
                    #print('\t\t\t' + t4['name'])
                    finalRasterNameStack.append(t4['name'])
                    if(t4['name'] == t4Region):
                        foundIt = True
                    else:
                        finalRasterNameStack.pop()
                if(not foundIt):
                    finalRasterNameStack.pop()
            if(not foundIt):
                finalRasterNameStack.pop()
        if(not foundIt):
            finalRasterNameStack.pop()

    # build the filename
    finalRasterFilename = "_".join(finalRasterNameStack)

    return finalRasterFilename

#################
# Main Function #
#################
def main():
    # build an argument parser object
    parser = argparse.ArgumentParser(description=
            'Process some GeoTIFFs according to a regional boundary key')
    parser.add_argument('--data_folder', '-d', help='Location of some GeoTIFF files')
    #parser.add_argument('--temp_folder', '-t', help='Location to output nonsplit Mosaic GeoTIFF files')
    parser.add_argument('--output_folder', '-o', help='Location to output new GeoTIFF files')
    args = parser.parse_args()

    # get the path to the data folder and output folder from the argument
    data_folder = Path(args.data_folder)
    output_folder = Path(args.output_folder)
    #temp_folder = Path(args.temp_folder)

    # ingest a 3-column csv containing L4 regions and their center lat/lon coordinates
    # store this data in region_centers
    region_key_file = 'L4_regions_sparse.csv'
    region_centers = ingest_L4_data(region_key_file)
    print("found 68 regions in  key file")

    # region_centers[i][j] can now access a region name and its lat/lon where
    # i<len(region_centers) and 1<=j<=2

    # TODO: THE REGIONS JSON FILE IS CURRENTLY IN A SOMEWHAT FUCKED-UP STATE
    # AND SHOULDN'T BE USED
    # ingest the json with the full regional hierarchy
    json_regions_file = 'regions.json'
    regional_hierarchy = ingest_regional_json(json_regions_file)

    print(regional_hierarchy[0]['subregions'][0]['subregions'][0]['subregions'][0]['name'])


    #print(json.dumps(regional_hierarchy, indent=2, sort_keys=False))

    # regional_hierarchy now has the structured hierarchy info
    # we can use this to build fully-qualified filename strings by walking
    # the json tree from the leaves up to the root

    ############################
    # MAIN PREPROCESSING STEPS #
    ############################
    # pass the input/output folders to functions to perform the preprocessing steps

    # do the first two steps with a temporary directory to hold files between
    # steps
    with tempfile.TemporaryDirectory() as temp_folder:
        # region keying (uncomment to run)
        rekey_by_region(data_folder, temp_folder, region_centers, regional_hierarchy)

        # mosaic generation (uncomment to run)
        #build_mosaics(temp_folder, output_folder, region_centers)
        

    # band extraction (uncomment to run)
    #band_extract(data_folder, output_folder)

    # the script is done
    print("goodbye")


# special variable
if __name__=="__main__":
    main()
