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

`python3 raster-prep.py -d source_data/`

will output a set of processed, keyed GeoTIFFs into the `output/` folder within the Terracotta client.

# State of the Script

The `raster-prep.py` script takes one argument, a directory containing
arbitrarily-many multiband GeoTIFFs.

## Things the Script Currently Does

- Iterates over each file in the provided directory
- Parses the file paths and file names in an architecture-friendly manner
- Opens each file with the raster.io Python library
- Reads the 4-coordinate boundaries of each file
- Extracts each band of each input file to its own separate file, with a
  plain-English band key added to the file name
