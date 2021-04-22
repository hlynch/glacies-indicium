from collections import defaultdict
from pyproj import Transformer
import csv
import json
import uuid


def ingest_json_file(fileName):
    with open(fileName, 'r') as jsonFile:
        data = jsonFile.read()

    return json.loads(data)


def ingest_csv_file(fileName):
    rows = []
    cols = []

    with open(fileName, 'r') as csvfile:
        csvreader = csv.reader(csvfile)
        cols = next(csvreader)
        # iterates across the rest of the rows and adds them to a list
        for row in csvreader:
            rows.append(row)

        return rows


def write_to_json_file(fileName, data):
    with open(fileName, 'w') as outfile:
        json.dump(data, outfile)


def write_to_csv_file(file_name, data):
    with open(file_name, 'w', newline='') as output_file:
        csv_writer = csv.writer(output_file)
        header_row = []

        index = 1
        for tier in data[0]:
            header_row.append('Tier' + str(index))
            index += 1

        csv_writer.writerow(header_row)

        for row in data:
            csv_writer.writerow(row)


def get_total_columns(csv_file):
    with open(csv_file, 'r') as csv:
        return csv.readline().count(',') + 1


def get_unique_id():
    return str(uuid.uuid4())[0:4]


def report_raster_data(raster):
    centerX, centerY = raster.xy(raster.height // 2, raster.width // 2)
    print('\t\tbounds: ' + str(raster.bounds))
    print('\t\tnbands: ' + str(raster.count))
    print('\t\tcrs: ' + str(raster.crs))
    print('\t\tnodatavals: ' + str(raster.nodatavals))
    print('\t\tcenterX, centerY: ' + str(centerX) + ', ' + str(centerY))


def report_new_path(path_name, path_location):
    print("\t\t" + path_name + ":")
    print("\t\t\t" + path_location)


def create_tree():
    return defaultdict(create_tree)


def build_leaf(name, leaf):
    res = {"name": name, "id": get_unique_id()}
    # add children node if the leaf actually has any children
    if len(leaf.keys()) > 0:
        res["subregions"] = [build_leaf(key, value) for key, value in leaf.items() if key != name]

    return res


def transform_raster_projection(raster, new_projection):
    # get the center coordinates of this raster
    # these values are projected in EPSG 3031 (antarctic polar stereographic)
    centerX, centerY = raster.xy(raster.height // 2, raster.width // 2)

    transformer = Transformer.from_crs(str(raster.crs), new_projection)
    centerLat, centerLon = transformer.transform(centerX, centerY)

    return centerLat, centerLon
