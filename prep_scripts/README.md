# Raster Preprocessing Script

The 'raster-prep.py' script can be invoked on a directory of multiband GeoTIFFs
with the command:

`python3 raster-prep.py -d /path/to/some/geotiffs`

The script will iterate over each GeoTIFF in the provided data folder so we can
perform our preprocessing steps. Currently the only implemented step is band
extraction: Each n-band GeoTIFF will be processed into n single-band GeoTIFFs,
with the correlated band key appended to the new file name, and saved to the
provided output folder.

For example, if your GeoTIFFs are in a folder in this directory called
`source_data/`, the command

`python3 raster-prep.py -d source_data/ -r`

will output a set of processed, keyed GeoTIFFs into the `mosaics/` folder within the Terracotta client and will remove the borders from the GeoTIFFs.

# State of the Script

- The `raster-prep.py` script takes two arguments, a directory containing
  arbitrarily-many multiband GeoTIFFs and an optional argument to remove the borders from the GeoTIFF images.
- The `all_regions.json` file will automatically be filled with a valid JSON array containing every region in Antarctica in a hierarchical format.
- The `availible_regions.json` file will be dynamically created based on the regions found from the set of GeoTIFF images that is ingested in this script.

## Things the Script Currently Does

- Iterates over each file in the provided directory
- Parses the file paths and file names in an architecture-friendly manner
- Opens each file with the raster.io Python library
- Reads the 4-coordinate boundaries of each file
- Extracts each band of each input file to its own separate file, with a
  plain-English band key added to the file name
- Creates a hierarchical JSON file for every region in Antarctica
- Creates a hierarchical JSON file for each region in the set of ingested GeoTIFF images
- Removes the border from each GeoTIFF image
- Correlates each image's boundary coordinates to the regional boundary data
