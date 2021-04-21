from pathlib import Path
import csv
import haversine
import json
import rasterio
import shutil
import utilities
import uuid

REGIONS_FILE = 'regions.csv'


def generate_json_hierarchy(csv_file, json_file):
    tree = utilities.create_tree()
    with open(csv_file) as csvfile:
        reader = csv.reader(csvfile)
        for rid, row in enumerate(reader):

            # skipping first header row.
            if rid == 0:
                continue

            leaf = tree[row[0]]

            for cid in range(1, len(row)):
                leaf = leaf[row[cid]]

    result = []
    for name, leaf in tree.items():
        result.append(utilities.build_leaf(name, leaf))

    utilities.write_to_json_file(json_file, result)


def get_region_by_lowest_tier(csv_file, region_name):
    with open(csv_file) as input_file:
        reader = csv.reader(input_file)

        last_index = utilities.get_total_columns(csv_file)

        lowest_region_hierarchy = list(filter(lambda region: region_name
                                              == region[last_index - 1], reader))

    return lowest_region_hierarchy[0]


def create_raster_file_name(regional_hierarchy, raster_id):
    filename = ""
    for region in regional_hierarchy:
        filename += region.replace(' ', '') + "_"

    file_path = filename + raster_id + '.tif'
    header_path = filename + raster_id + '.hdr'
    return [file_path, header_path]


def rekey_by_region(data_folder, temp_folder, region_centers):
    # IF RASTER BOUNDS ARE WITHIN REGIONAL BOUNDS:
    # APPEND REGION NAME + "_" SEPARATOR TO OUTFILE_NAME
    # END RESULT E.G. "NorthernVictoriaLand_McMurdoDryValleys_TaylorValley_KukriHills"

    print("####### REGIONAL IDENTIFICATION ROUTINE #######")

    # make a pathlist of paths to each geotiff in the data folder
    pathlist = Path(data_folder).glob('*.tif')

    print("reading geotiffs in the data folder...")

    for path in pathlist:
        filename = str(path.stem)
        filepath = str(path)
        headerpath = str(path.parents[0]) + "/" + filename + ".hdr"

        print('\t' + filepath)

        raster = rasterio.open(path)
        nearestRegion, nearestRegionDistance = get_nearest_region(raster, region_centers)
        raster.close()

        print("\t\tnearest region: ")
        print("\t\t\t" + nearestRegion + "\t" + "{:.2f}".format(nearestRegionDistance) + " km")

        # generate a unique 4-character id for this raster
        raster_id = utilities.get_unique_id()

        # display the id
        print("\t\tunique id:\t" + raster_id)

        region_heirarchy = get_region_by_lowest_tier(REGIONS_FILE, nearestRegion)

        # construct a new file name
        final_file_name, final_file_header = create_raster_file_name(region_heirarchy, raster_id)

        utilities.report_new_path("new file name", final_file_name)
        utilities.report_new_path("new header name", final_file_header)

        # construct a temp file path
        temp_file_path = temp_folder + '/' + final_file_name
        temp_header_path = temp_folder + '/' + final_file_header

        utilities.report_new_path("temp file path", temp_file_path)
        utilities.report_new_path("temp header path", temp_header_path)

        # move this raster file from its current name/location to a new name/output location
        result = shutil.copy(filepath, temp_file_path)
        result = shutil.copy(headerpath, temp_header_path)


def get_distances_to_region(region_centers, center_coordinates):
    # structure to hold regions with their distances to this raster
    distances_matrix = []

    # at each region, add a row to the distances matrix which has
    # the region name and the distance from this image to that region
    for region in region_centers:
        distance = haversine.distance(center_coordinates, [
                                      float(region[1]), float(region[2])])
        distances_matrix.append([region[0], distance])

    # distances_matrix now knows how far this image's center is from all the regions
    # if we sort the matrix by its second column, the first row will be the nearest region
    distances_matrix = sorted(distances_matrix, key=lambda x: x[1])

    return distances_matrix


def get_nearest_region(raster, region_centers):
    out_projection = 'epsg:4326'
    centerLat, centerLon = utilities.transform_raster_projection(raster, out_projection)
    distances_matrix = get_distances_to_region(region_centers, [centerLat, centerLon])

    return distances_matrix[0][0], distances_matrix[0][1]
