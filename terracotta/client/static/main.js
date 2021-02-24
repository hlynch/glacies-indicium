/// <reference path='./types/leaflet.d.ts' />
/// <reference path='./types/no-ui-slider.d.ts' />
/// <reference path='./types/main.d.ts' />

/* BEWARE! THERE BE DRAGONS! 🐉

Big parts of following file were written by a Python programmer with minimal exposure
to idiomatic Javascript. It should not serve as an authoritive reference on how a
frontend for Terracotta should be written.
*/

/*
Some notes:
- methods marked with @global are expected to be available in the DOM (i.e. app.html).
*/

// ===================================================
// Constants
// ===================================================

/**
 * Updates errors when error Array changes.
 * @param {Array<Terracotta.IMapError>} arr
 */
const errorProxy = (arr) =>
  new Proxy(arr, {
    set: (target, property, value) => {
      target[property] = value;
      renderErrors(target);
      return true;
    },
  });

const rgbStretchProxy = (arr) =>
  new Proxy(arr, {
    set: (target, property, value) => {
      target[property] = value;
      return true;
    },
  });

const singlebandStretchProxy = (arr) =>
  new Proxy(arr, {
    set: (target, property, value) => {
      target[property] = value;
      return true;
    },
  });

const DATASETS_PER_PAGE = 16;
const THUMBNAIL_SIZE = [128, 128];
const COLORMAPS = [
  { display_name: 'Greyscale', id: 'greys_r' },
  { display_name: 'Viridis', id: 'viridis' },
  { display_name: 'Blue-Red', id: 'rdbu_r' },
  { display_name: 'Blue-Green', id: 'bugn' },
  { display_name: 'Yellow-Green', id: 'ylgn' },
  { display_name: 'Magma', id: 'magma' },
  { display_name: 'Earth', id: 'gist_earth' },
  { display_name: 'Ocean', id: 'ocean' },
];

const STATE = {
  keys: [],
  ds_keys: [],
  errors: errorProxy([]),
  remote_host: '',
  current_dataset_page: 0,
  dataset_metadata: {},
  colormap_values: {},
  current_colormap: '',
  current_singleband_stretch: [0, 1],
  map: undefined,
  baseLayer: undefined,
  overlayLayer: undefined,
  activeSinglebandLayer: undefined,
  activeRgbLayer: undefined,
  m_pos: 0,
};

// ===================================================
// Convenience functions to get valid Terracotta URLs.
// ===================================================

/**
 * As it says, gets keys so the app can be initialized.
 *
 * @param {string} remote_host
 *
 * @return {Promise<Array<Terracotta.IKey>>}
 */
function getKeys(remote_host) {
  const keyUrl = `${remote_host}/keys`;
  return httpGet(keyUrl).then((response) => response.keys || []);
}

/**
 * @param {string} remote_host
 * @param {Array<Terracotta.IKeyConstraint>} key_constraints Key/val pairs of constraints.
 * @param {number} limit Items per page
 * @param {number} page Page number
 *
 * @return {string} dataset URL.
 */
function assembleDatasetURL(remote_host, key_constraints, limit, page) {
  let request_url = `${remote_host}/datasets?limit=${limit}&page=${page}`;

  for (let i = 0; i < key_constraints.length; i++) {
    request_url += `&${key_constraints[i].key}=${key_constraints[i].value}`;
  }
  return request_url;
}

/**
 * @param {string} remote_host
 * @param {Array<string>} ds_keys Dataset keys i.e. [<type>, <date>, <id>, <band>].
 *
 * @return {string} metadata URL.
 */
function assembleMetadataURL(remote_host, ds_keys) {
  let request_url = `${remote_host}/metadata`;
  for (let i = 0; i < ds_keys.length; i++) {
    request_url += `/${ds_keys[i]}`;
  }
  return request_url;
}

/**
 * @param {string} remote_host
 * @param {Array<string>} keys
 * @param {Terracotta.IOptions} [options]
 * @param {boolean} [preview]
 *
 * @return {string} singleband URL.
 */
function assembleSinglebandURL(remote_host, keys, options, preview) {
  let request_url;

  if (preview) {
    request_url = `${remote_host}/singleband/${keys.join(
      '/'
    )}/preview.png?tile_size=${JSON.stringify(THUMBNAIL_SIZE)}`;
  } else {
    request_url = `${remote_host}/singleband/${keys.join('/')}/{z}/{x}/{y}.png`;
  }

  if (options == null) return request_url;

  let first = true;
  for (let option_key in options) {
    if (!options.hasOwnProperty(option_key)) continue;

    if (first) {
      request_url += `?${option_key}=${options[option_key]}`;
      first = false;
    } else {
      request_url += `&${option_key}=${options[option_key]}`;
    }
  }
  updateComputedUrl(request_url, keys);
  return request_url;
}

/**
 * @param {string} remote_host
 * @param {Array<string>} first_keys
 * @param {Array<string>} rgb_keys
 * @param {Terracotta.IOptions} options
 * @param {boolean} preview
 *
 * @return {string} rgb URL.
 */
function assembleRgbUrl(remote_host, first_keys, rgb_keys, options, preview) {
  let request_url = `${remote_host}/rgb/`;

  if (first_keys.length > 0) {
    request_url += `${first_keys.join('/')}/`;
  }

  if (preview) {
    request_url += `preview.png?tile_size=${JSON.stringify(THUMBNAIL_SIZE)}`;
  } else {
    request_url += '{z}/{x}/{y}.png';
  }

  const [r, g, b] = rgb_keys;
  request_url += `?r=${r}&g=${g}&b=${b}`;

  if (!options) {
    return request_url;
  }

  for (let option_key in options) {
    if (!options.hasOwnProperty(option_key)) continue;
    request_url += `&${option_key}=${options[option_key]}`;
  }
  return request_url;
}

/**
 * @param {string} colormap The id of the color map
 * @param {number} num_values The number of values to return
 *
 * @return {string} color map URL
 */
function assembleColormapUrl(remote_host, colormap, num_values) {
  return `${remote_host}/colormap?colormap=${colormap}&stretch_range=[0,1]&num_values=${num_values}`;
}

// ===================================================
// Initializers
// ===================================================

/**
 * Gets colorbar values for a given range.
 *
 * @param {string} remote_host
 * @param {number} [num_values=100] The number of values to get colors for.
 */
function getColormapValues(remote_host, num_values = 100) {
  const requestColorMap = (colormap) => {
    const cmapId = colormap.id;

    return httpGet(assembleColormapUrl(remote_host, cmapId, num_values)).then(
      (response) => {
        if (response && response.colormap) {
          STATE.colormap_values[cmapId] = [];

          for (let j = 0; j < num_values; j++) {
            STATE.colormap_values[cmapId][j] = response.colormap[j].rgba;
          }
        }
      }
    );
  };

  return Promise.all(COLORMAPS.map(requestColorMap));
}

/**
 * Sets up the UI.
 *
 * @param {Array<Terracotta.IKey>} keys
 */
function initUI(remote_host, keys) {
  // initialize list of keys and key descriptions
  let keyList = document.getElementById('key-list');
  keyList.innerHTML = '';
  for (let i = 0; i < keys.length; i++) {
    let currentKey = keys[i].key;
    let label = document.createElement('label');
    let description = document.createTextNode(currentKey);
    let checkbox = document.createElement('input');

    checkbox.type = 'checkbox';
    checkbox.name = currentKey;
    checkbox.value = currentKey;

    label.appendChild(checkbox);
    label.appendChild(description);
    keyList.appendChild(label);
  }

  resetLayerState();
  removeSpinner();
}

// ===================================================
// Helper functions
// ===================================================

/**
 * Serializes an array of keys to a single string
 *
 * @param {Array<string>} keys
 *
 * @return {string}
 */
function serializeKeys(keys) {
  return keys.join('/');
}

/**
 * Compares whether two arrays are equal element-wise
 *
 * @param {Array} arr1
 * @param {Array} arr2
 */
function compareArray(arr1, arr2) {
  if (arr1 == null || arr2 == null) return false;
  if (arr1.length !== arr2.length) return false;
  for (let i = 0; i < arr1.length; i++) {
    if (arr1[i] !== arr2[i]) return false;
  }
  return true;
}

/**
 * Stores metadata.
 *
 * @param {Terracotta.IMetadata} metadata
 */
function storeMetadata(metadata) {
  const ds_keys = serializeKeys(Object.values(metadata.keys));
  STATE.dataset_metadata[ds_keys] = metadata;
}

/**
 * Performs a GET call via the fetch API.
 * @param {string} url
 *
 * @return {Promise<any>} A JSON server response.
 */
function httpGet(url) {
  return fetch(url)
    .then((response) => {
      console.log(response);
      if (response.ok) {
        return response.json();
      }

      return Promise.reject(response.status);
    })
    .catch((errorStatus) => {
      const error_str = `API request failed: ${errorStatus}`;
      STATE.errors.push({ text: error_str, url });
      console.error(error_str);
      throw errorStatus;
    });
}

/**
 * Renders errors in the '.errors' div.
 *
 * @param {Array<Terracotta.IMapError>} errors
 */
function renderErrors(errors) {
  const errorHtml = errors
    .map(
      (error, index) => `
            <li>
                ${error.text} <br/>
                <small>${error.url}</small>
                <span onclick='dismissError.call(null, ${index})'>
                    ×
                </span>
            </li>
        `
    )
    .join('');
  document.querySelector('#errors').innerHTML = errorHtml;
}

/**
 * Removes error at index.
 * @param {number} errorIndex
 */
function dismissError(errorIndex) {
  delete STATE.errors[errorIndex];
  renderErrors(STATE.errors);
}

/**
 * Handle search results and singleband layers.
 *
 * @param {Array<Terracotta.IKey>} keys The keys to update results for.
 */
function updateSearchResults(
  remote_host = STATE.remote_host,
  keys = STATE.keys
) {
  // initialize table header for search results
  const regionList = document.getElementById('search-results');
  regionList.innerHTML = '';

  // get key constraints from UI
  let key_constraints = [];

  const checkboxes = document.querySelectorAll('#key-list input');
  for (let index = 0; index < checkboxes.length; index++) {
    const ds_field = checkboxes[index];
    if (ds_field.value !== '') {
      key_constraints.push({ key: ds_field.name, value: ds_field.value });
    }
  }

  updateDatasetList(remote_host);
}

/**
 * Refreshes the dataset list.
 *
 * @param {string} remote_host
 * @param {Array<Terracotta.IDataset>} datasets
 * @param {Array<Terracotta.IKey>} keys
 */
function updateDatasetList(
  remote_host = STATE.remote_host,
  datasets = 10,
  keys
) {
  let datasetTable = document.getElementById('search-results');

  // disable next page if there are no more datasets
  /**
   * @type {HTMLButtonElement }
   */
  let next_page_button = document.querySelector('#next-page');
  if (datasets.length < DATASETS_PER_PAGE) {
    next_page_button.disabled = true;
  } else {
    next_page_button.disabled = false;
  }

  buildRegionTree(json, datasetTable);
  removeListMargin();
}

/**
 * Finds the first list element and removes margin to reduce whitespace.
 */
function removeListMargin() {
  $('ul:eq(1)').addClass('margin-left-none');
}

/**
 * Increments the dataset result page by the provided step.
 * This method is called from app.html.
 *
 * @param {number} step
 * @global
 */
function incrementResultsPage(step) {
  STATE.current_dataset_page += step;
  updatePageControls();
  updateSearchResults();
}

/**
 * Updates the page counter & prev page button.
 */
function updatePageControls() {
  document.getElementById('page-counter').innerHTML = String(
    STATE.current_dataset_page + 1
  );
  /**
   * @type {HTMLButtonElement}
   */
  let prevPageButton = document.querySelector('#prev-page');
  if (STATE.current_dataset_page > 0) {
    prevPageButton.disabled = false;
  } else {
    prevPageButton.disabled = true;
  }
}

/**
 * Adds a footprint overlay to map
 * @param {HTMLElement} datasetTable
 */
function toggleDatasetMouseover(element) {
  if (STATE.overlayLayer != null) {
    STATE.map.removeLayer(STATE.overlayLayer);
  }

  const layer_id = serializeKeys([element.target.id]);
  const metadata = STATE.dataset_metadata[layer_id];

  if (!metadata) return;

  STATE.overlayLayer = L.geoJSON(metadata.convex_hull, {
    style: {
      color: '#0B4566',
      weight: 5,
      opacity: 1,
    },
  }).addTo(STATE.map);
}

/**
 * Removes overlay from map after hover
 * @param {HTMLElement} datasetTable
 */
function toggleDatasetMouseleave() {
  STATE.map.removeLayer(STATE.overlayLayer);
}

/**
 * Toggle active singleband layer.
 *
 * @global
 * @param {Array<string>} ds_keys
 * @param {boolean} resetView
 */
function toggleSinglebandMapLayer(ds_keys, resetView = true) {
  let currentKeys;
  if (STATE.activeSinglebandLayer) {
    currentKeys = STATE.activeSinglebandLayer.keys;
  }

  resetLayerState();

  if (!ds_keys || compareArray(currentKeys, ds_keys)) {
    return;
  }

  updateSinglebandLayer(ds_keys, resetView);
}

/**
 * Switch current active layer to the given singleband dataset.
 *
 * @param {Array<string>} ds_keys Keys of new layer
 * @param {boolean} resetView Fly to new dataset if not already on screen
 */
function updateSinglebandLayer(ds_keys, resetView = true) {
  removeRasterLayer();

  const layer_id = serializeKeys(ds_keys);
  const metadata = STATE.dataset_metadata[layer_id];

  let layer_options = {};
  if (STATE.current_colormap) {
    layer_options.colormap = STATE.current_colormap;
  }
  if (STATE.current_singleband_stretch) {
    layer_options.stretch_range = JSON.stringify(
      STATE.current_singleband_stretch
    );
  }
  const layer_url = assembleSinglebandURL(
    STATE.remote_host,
    ds_keys,
    layer_options
  );
  STATE.activeSinglebandLayer = {
    keys: ds_keys,
    layer: L.tileLayer(layer_url).addTo(STATE.map),
  };

  $('.active').removeClass('active');
  const dataset_layer = document.getElementById(`${layer_id}`);

  dataset_layer.classList.add('active');

  if (resetView && metadata) {
    const screen = STATE.map.getBounds();
    const screenBounds = [
      screen._southWest.lng,
      screen._southWest.lat,
      screen._northEast.lng,
      screen._northEast.lat,
    ];
    const dsBounds = metadata.bounds;
    const screenCover = calcScreenCovered(dsBounds, screenBounds);
    if (screenCover < 0.1)
      STATE.map.flyToBounds(
        L.latLngBounds([dsBounds[1], dsBounds[0]], [dsBounds[3], dsBounds[2]])
      );
  }
}

/**
 * Checks how much of area is in screen to determine zooming behavior
 * @param {Array[number]} dsBounds bounding box of TC dataset [w, s, e, n]
 * @param {Array[number]} screenBounds bouding box of user's screen [w, s, e, n]
 *
 * @return {number} ratio of screen covered by dataset in range (0, 1)
 */
function calcScreenCovered(dsBounds, screenBounds) {
  const x_overlap = Math.max(
    0,
    Math.min(dsBounds[2], screenBounds[2]) -
      Math.max(dsBounds[0], screenBounds[0])
  );
  const y_overlap = Math.max(
    0,
    Math.min(dsBounds[3], screenBounds[3]) -
      Math.max(dsBounds[1], screenBounds[1])
  );
  const overlapArea = x_overlap * y_overlap;
  const screenArea =
    (screenBounds[3] - screenBounds[1]) * (screenBounds[2] - screenBounds[0]);
  return overlapArea / screenArea;
}

/**
 * Updates page controls & search results when search changes.
 */
function searchFieldChanged() {
  STATE.current_dataset_page = 0;
  updatePageControls();
  updateSearchResults();
}

/**
 * Reset all layer state
 * (remove layers from map, deactivate navigation section, clear info box)
 */
function resetLayerState() {
  removeRasterLayer();
  document.getElementById('layerInfo__container').style.display = 'none';
}

/**
 * Remove all current layers from map
 */
function removeRasterLayer() {
  if (STATE.activeRgbLayer != null) {
    STATE.map.removeLayer(STATE.activeRgbLayer.layer);
    STATE.activeRgbLayer = null;
  }

  if (STATE.activeSinglebandLayer != null) {
    STATE.map.removeLayer(STATE.activeSinglebandLayer.layer);
    STATE.activeSinglebandLayer = null;
  }
}

/**
 * Updates Layer info container with current URL and metadata
 * @param {string} url
 * @param {Array<string>} keys Dataset keys i.e. [<type>, <date>, <id>, <band>].
 */
function updateComputedUrl(url, keys = null) {
  const computedUrl = document.getElementById('layerInfo__URL');
  const layerInfoParent = document.getElementById('layerInfo__container');
  if (layerInfoParent.style.display !== 'block') {
    layerInfoParent.style.display = 'block';
    computedUrl.parentElement.style.display = 'block';
  }
  computedUrl.innerHTML = `<b class="bold">current XYZ URL - </b>${url}`;
  let metadata = null;
  if (keys != null) {
    metadata = STATE.dataset_metadata[serializeKeys(keys)];
  }
  updateMetadataText(metadata);
}

/**
 * Updates Layer info container with metadata text
 * @param {Terracotta.IMetadata} metadata Dataset metadata
 */
function updateMetadataText(metadata) {
  const metadataField = document.getElementById('layerInfo__metadata');
  if (!metadata) {
    metadataField.style.display = 'none';
    return;
  }
  metadataField.style.display = 'block';
  metadataField.innerHTML = '<b class="bold">current metadata -</b> ';
  if (metadata.mean)
    metadataField.innerHTML += `mean: ${metadata.mean.toFixed(2)}`;
  if (metadata.range)
    metadataField.innerHTML += ` range: ${JSON.stringify(metadata.range)}`;
  if (metadata.stdev)
    metadataField.innerHTML += ` stdev: ${metadata.stdev.toFixed(2)}`;
  if (metadata.valid_percentage)
    metadataField.innerHTML += ` valid_percentage: ${metadata.valid_percentage.toFixed(
      2
    )}`;
  if (Object.keys(metadata.metadata).length > 0)
    metadataField.innerHTML += ` metadata: ${JSON.stringify(
      metadata.metadata
    )}`;
}

/**
 *  Called in app.html on Details info toggle
 * @global
 */
function toggleDetails() {
  const details = document.getElementById('details__content');
  details.style.display = details.style.display === 'block' ? 'none' : 'block';
}

/**
 *  Called in app.html on Layer info toggle
 * @global
 */
function toggleLayerInfo() {
  const layerContent = document.getElementById('layerInfo__container--content');
  const layerToggle = document.getElementById('layerInfo__toggle--icon');
  layerToggle.innerHTML = layerToggle.innerHTML === '×' ? 'i' : '×';
  layerContent.style.display =
    layerContent.style.display === 'block' ? 'none' : 'block';
}

/**
 *  Called after initializeApp. adds event listeners to resize bar
 */
function addResizeListeners() {
  const BORDER_SIZE = 6;
  const panel = document.getElementById('resizable__buffer');
  panel.addEventListener(
    'mousedown',
    function (e) {
      e.preventDefault();
      if (e.offsetX < BORDER_SIZE) {
        STATE.m_pos = e.x;
        document.addEventListener('mousemove', resize, false);
      }
    },
    false
  );

  document.addEventListener(
    'mouseup',
    function () {
      document.removeEventListener('mousemove', resize, false);
    },
    false
  );
}

/**
 *  Called after InitUI, removes spinner.
 */
function removeSpinner() {
  document.getElementById('loader__container').style.display = 'none';
}

/**
 *  Resizes map and sidebar, repositions resize bar
 */
function resize(e) {
  const sidebar = document.getElementById('controls');
  const resizeBuffer = document.getElementById('resizable__buffer');
  const map = document.getElementById('map');
  const panel = document.getElementById('resizable__buffer');

  const dx = e.x - STATE.m_pos;
  STATE.m_pos = e.x;

  let posX = parseInt(getComputedStyle(panel, '').marginLeft) + dx + 'px';
  sidebar.style.width =
    parseInt(getComputedStyle(panel, '').marginLeft) + dx - 50 + 'px';
  resizeBuffer.style.marginLeft = posX;
  map.style.left = posX;
}

/**
 *  Main entrypoint.
 *  Called in app.html on window.onload.
 *
 * @param {string} hostname The hostname of the remote Terracotta server (evaluated in map.html).
 * @global
 */
function initializeApp(hostname) {
  // sanitize hostname
  if (hostname.charAt(hostname.length - 1) === '/') {
    hostname = hostname.slice(0, hostname.length - 1);
  }

  STATE.remote_host = hostname;

  getColormapValues(hostname)
    .then(() => getKeys(hostname))
    .then((keys) => {
      STATE.keys = keys;
      initUI(hostname, keys);
      updateSearchResults();

      /* This is commented out as new tile layers will not display over this one. 
        TODO: Make 3031 projection work with Leaflet 
      const EPSG3031 = new L.Proj.CRS(
        'EPSG:3031',
        '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +ellps=WGS84 +datum=WGS84 +units=m +no_defs',
        {
          origin: [-4194304, 4194304],
          resolutions: [8192.0, 4096.0, 2048.0, 1024.0, 512.0, 256.0],
          bounds: L.bounds([-4194304, -4194304], [4194304, 4194304]),
        }
      );

      const southWest = L.latLng(-38.94137277935882, -135);
      const northEast = L.latLng(-38.94137277935882, 45);

      const nasaAttrib =
        "Data Source &copy; <a href='https://www.comnap.aq/SitePages/Home.aspx' target='_blank'>" +
        "COMNAP</a><br>Base Map &copy; <a href='https://wiki.earthdata.nasa.gov/display/GIBS' target='_blank'>" +
        'NASA EOSDIS GIBS</a>';
      const nasaUrl =
        'https://gibs-{s}.earthdata.nasa.gov' +
        '/wmts/epsg3031/best/' +
        '{layer}/default/{date}/{tileMatrixSet}/{z}/{y}/{x}.{format}';

      const blueMarble = new L.tileLayer(nasaUrl, {
        attribution: nasaAttrib,
        tileSize: 512,
        layer: 'BlueMarble_ShadedRelief_Bathymetry',
        tileMatrixSet: '500m',
        subdomains: 'abc',
        date: new Date().toISOString().substr(0, 10),
        format: 'jpg',
        zIndex: 1,
      });
      STATE.map = new L.Map('map', {
        crs: EPSG3031,
        minZoom: 0.48,
        maxZoom: 4,
        layers: [blueMarble],
      });

      STATE.map.setView(new L.LatLng(-90, 0), 0);
      */
      let osmUrl = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      let osmAttrib =
        'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
      let osmBase = L.tileLayer(osmUrl, { attribution: osmAttrib });
      STATE.map = L.map('map', {
        center: [0, 0],
        zoom: 2,
        layers: [osmBase],
      });

      $('#exportButton').click(function (element) {
        const currentRegion = $('.active').attr('id');

        let fileUrl = `WV02_2210_GeoTIFF_stack_${currentRegion}.tif`;
        currentRegion
          ? console.log(fileUrl)
          : alert('Please select a region to export!');
      });
    });
  addResizeListeners();
  getTheme();
}

/**
 * Parses json list of regions and creates nested menu
 * @param {JSON} regions
 * @param {HTML Element} container
 */
function buildRegionTree(regions, container) {
  regions.forEach((region) => {
    let listRoot = document.createElement('ul');
    let newListElement = createListElement(region);
    listRoot.appendChild(newListElement);

    if (region.subregions !== undefined)
      buildRegionTree(region.subregions, listRoot);
    if (newListElement.id < DATASETS_PER_PAGE) {
      httpGet(
        assembleMetadataURL(STATE.remote_host, [newListElement.id])
      ).then((metadata) => storeMetadata(metadata));
    }
    container.appendChild(listRoot);
  });
}

/**
 * Creates new list element with event listeners for hover and click
 * @param {JSON} content
 */
function createListElement(content) {
  const listElement = document.createElement('li');
  listElement.innerHTML = content.name;
  listElement.id = content.id;
  listElement.classList.add('clickable');

  listElement.addEventListener(
    'click',
    toggleSinglebandMapLayer.bind(null, [content.id])
  );
  listElement.addEventListener('mouseenter', toggleDatasetMouseover.bind(this));
  listElement.addEventListener('mouseleave', toggleDatasetMouseleave);

  return listElement;
}

/**
 * Current hardcoded list of regions/ids
 * TODO: Dynamically create this list and store as JSON file
 */
const json = [
  {
    name: 'Northern Victoria Land',
    id: 1,
    subregions: [
      {
        name: 'Asgard Range',
        id: 2,
        subregions: [
          {
            name: 'Mt. Newall',
            id: 3,
          },
          {
            name: 'Round Mountain',
            id: 4,
          },
        ],
      },
      {
        name: 'Ferrar Glacier',
        id: 5,
        subregions: [
          {
            name: 'Kukri Hills',
            id: 6,
          },
          {
            name: 'Briggs Hills',
            id: 7,
          },
          {
            name: 'Thomas Heights',
            id: 8,
          },
        ],
      },
      {
        name: 'Kukri Hills',
        id: 9,
        subregions: [
          {
            name: 'Mt Coates',
            id: 10,
          },
        ],
      },
      {
        name: 'Quartermain Mountain',
        id: 11,
        subregions: [
          {
            name: 'Beacon Valley',
            id: 12,
          },
          {
            name: 'Pivot Peak',
            id: 13,
          },
        ],
      },
      {
        name: 'Royal Society Range',
        id: 14,
        subregions: [
          {
            name: 'Garwood Valley',
            id: 15,
          },
          {
            name: 'Miers Valley',
            id: 16,
          },
          {
            name: 'Heald Island',
            id: 17,
          },
          {
            name: 'Blue Glacier',
            id: 18,
          },
          {
            name: 'Mt. Rucker',
            id: 19,
          },
          {
            name: 'Trough Lake',
            id: 20,
          },
          {
            name: 'Mt. Huggins',
            id: 21,
          },
          {
            name: 'The Spire',
            id: 22,
          },
          {
            name: 'Table Mountain',
            id: 23,
          },
        ],
      },
      {
        name: 'Taylor Glacier',
        id: 24,
        subregions: [{ name: 'Northwest Mountain', id: 25 }],
      },
      {
        name: 'Taylor Valley',
        id: 26,
        subregions: [
          {
            name: 'Northwest Mountain',
            id: 27,
          },
          {
            name: 'New Harbor',
            id: 28,
          },
          {
            name: 'Fryxell Basin',
            id: 29,
          },
          {
            name: 'Kukri Hills',
            id: 30,
          },
          {
            name: 'Hoare Basin',
            id: 31,
          },
        ],
      },
      {
        name: 'Willett Range',
        id: 32,
        subregions: [
          { name: 'Head Mountains', id: 33 },
          { name: 'Apocolypse Peaks', id: 34 },
          { name: 'Shapeles Mountain', id: 35 },
        ],
      },
      {
        name: 'Wright Valley',
        id: 36,
        subregions: [
          {
            name: 'Mt. Fleming',
            id: 37,
          },
        ],
      },
    ],
  },
];

// function to set a given theme/color-scheme
function setTheme(themeName) {
  localStorage.setItem('theme', themeName);
  const controls = document.getElementById('controls');
  document.body.className = themeName;
}

// function to toggle between light and dark theme
function toggleTheme() {
  if (localStorage.getItem('theme') === 'theme-dark') {
    setTheme('theme-light');
  } else {
    setTheme('theme-dark');
  }
}

// Immediately invoked function to set the theme on initial load
function getTheme() {
  if (localStorage.getItem('theme') === 'theme-dark') {
    setTheme('theme-dark');
    document.getElementById('slider').checked = false;
  } else {
    setTheme('theme-light');
    document.getElementById('slider').checked = true;
  }
}
