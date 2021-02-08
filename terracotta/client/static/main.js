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
  errors: errorProxy([]),
  remote_host: '',
  current_dataset_page: 0,
  dataset_metadata: {},
  colormap_values: {},
  current_colormap: '',
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

  const checkboxes = document.querySelectorAll('input[type=checkbox]');
  checkboxes.forEach(function (checkbox) {
    checkbox.addEventListener('change', function () {
      enabledSettings = Array.from(checkboxes) // Convert checkboxes to an array to use filter and map.
        .filter((i) => i.checked) // Use Array.filter to remove unchecked checkboxes.
        .map((i) => i.value); // Use Array.map to extract only the checkbox values from the array of objects.

      enabledSettings.length > 0
        ? console.table(enabledSettings)
        : console.log('No items selected');
    });
  });

  // initialize table header for search results
  let datasetTable = document.getElementById('search-results');
  datasetTable.innerHTML = '';
  let tableHeader = document.createElement('th');

  for (let i = 0; i < keys.length; i++) {
    const headerEntry = document.createElement('td');
    headerEntry.innerHTML = keys[i].key;
    tableHeader.appendChild(headerEntry);
    datasetTable.appendChild(tableHeader);
  }

  // create sliders
  let sliderDummyOptions = {
    start: [0.0, 1.0],
    range: { min: 0, max: 1 },
    connect: true,
    behaviour: 'drag',
  };

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
  const datasetTable = document.getElementById('search-results');
  datasetTable.innerHTML = '';
  const tableHeader = document.createElement('tr');
  for (let i = 0; i < keys.length; i++) {
    const headerEntry = document.createElement('th');
    headerEntry.innerHTML = keys[i].key;
    tableHeader.appendChild(headerEntry);
  }
  datasetTable.appendChild(tableHeader);

  // get key constraints from UI
  let key_constraints = [];

  // Request datasets
  const datasetURL = assembleDatasetURL(
    remote_host,
    key_constraints,
    DATASETS_PER_PAGE,
    STATE.current_dataset_page
  );
  return httpGet(datasetURL).then((res) => {
    updateDatasetList(remote_host, res.datasets, keys);
  });
}

/**
 * Refreshes the dataset list.
 *
 * @param {string} remote_host
 * @param {Array<Terracotta.IDataset>} datasets
 * @param {Array<Terracotta.IKey>} keys
 */
function updateDatasetList(remote_host = STATE.remote_host, datasets, keys) {
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

  // update table rows
  if (datasets.length === 0) {
    let resultRow = document.createElement('tr');
    resultRow.innerHTML = `<td colspan=${keys.length}>No datasets found</td>`;
    datasetTable.appendChild(resultRow);
    return;
  }

  for (let i = 0; i < datasets.length; i++) {
    let currentDataset = datasets[i];
    let resultRow = document.createElement('tr');
    let ds_keys = [];
    for (let j = 0; j < keys.length; j++) {
      let resultEntry = document.createElement('td');
      ds_keys[j] = currentDataset[keys[j].key];
      resultEntry.innerHTML = ds_keys[j];
      resultRow.appendChild(resultEntry);
    }
    resultRow.id = `dataset-${serializeKeys(ds_keys)}`;
    if (
      STATE.activeSinglebandLayer &&
      compareArray(STATE.activeSinglebandLayer.keys, ds_keys)
    ) {
      resultRow.classList.add('active');
    }
    resultRow.classList.add('clickable');
    resultRow.addEventListener(
      'click',
      toggleSinglebandMapLayer.bind(null, ds_keys)
    );
    resultRow.addEventListener(
      'mouseenter',
      toggleDatasetMouseover.bind(null, resultRow)
    );
    resultRow.addEventListener(
      'mouseleave',
      toggleDatasetMouseover.bind(null, null)
    );

    // show thumbnails
    let detailsRow = document.createElement('tr');
    let thumbnailUrl = assembleSinglebandURL(remote_host, ds_keys, null, true);
    detailsRow.innerHTML = `<td colspan=${keys.length}><img src=${thumbnailUrl} class='thumbnail-image'></td>`;
    resultRow.appendChild(detailsRow);

    datasetTable.appendChild(resultRow);

    // retrieve metadata
    httpGet(assembleMetadataURL(remote_host, ds_keys)).then((metadata) =>
      storeMetadata(metadata)
    );
  }
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
 * Updates thumbnail preview
 * @param {HTMLImageElement} img
 * @param {boolean} show
 */
function showCurrentThumnbnail(img, show) {
  const thumbnail = document.getElementById('thumbnail-holder');
  if (show) {
    var backgroundProperty = `url(${img.src})`;
    thumbnail.style.backgroundImage = backgroundProperty;
  } else {
    thumbnail.style.backgroundImage = 'none';
  }
}

/**
 * Adds a footprint overlay to map
 * @param {HTMLElement} datasetTable
 */
function toggleDatasetMouseover(datasetTable) {
  if (STATE.overlayLayer != null) {
    STATE.map.removeLayer(STATE.overlayLayer);
  }

  if (datasetTable == null) {
    showCurrentThumnbnail(null, false);
    return;
  }
  showCurrentThumnbnail(datasetTable.querySelector('img'), true);
  /**
   * @type {NodeListOf<HTMLTableCellElement>}
   */
  const tdElements = datasetTable.querySelectorAll('td');
  const keys = [];
  for (let i = 0; i < tdElements.length; i++) {
    if (tdElements[i].parentElement.classList.contains('clickable'))
      keys.push(tdElements[i].innerHTML);
  }

  const layer_id = serializeKeys(keys);
  const metadata = STATE.dataset_metadata[layer_id];

  if (!metadata) return;

  STATE.overlayLayer = L.geoJSON(metadata.convex_hull, {
    style: {
      color: '#0B4566',
      weight: 5,
      opacity: 0.65,
    },
  }).addTo(STATE.map);
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

  const layer_id = serializeKeys(ds_keys);
  const metadata = STATE.dataset_metadata[layer_id];

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
  console.log(layer_url);
  STATE.activeSinglebandLayer = {
    keys: ds_keys,
    layer: L.tileLayer(layer_url, { transparent: true }).addTo(STATE.map),
  };

  const dataset_layer = document.getElementById(`dataset-${layer_id}`);

  if (dataset_layer) {
    // Depending on search, the dataset layer might not be present in the DOM.
    dataset_layer.classList.add('active');
  }

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
  computedUrl.innerHTML = `<b>current XYZ URL - </b>${url}`;
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
  metadataField.innerHTML = '<b>current metadata -</b> ';
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
  const bounds = L.latLngBounds(southWest, northEast);

  getColormapValues(hostname)
    .then(() => getKeys(hostname))
    .then((keys) => {
      STATE.keys = keys;
      initUI(hostname, keys);
      updateSearchResults();

      const nasaAttrib =
        "Data Source &copy; <a href='https://www.comnap.aq/SitePages/Home.aspx' target='_blank'>" +
        "COMNAP</a><br>Base Map &copy; <a href='https://wiki.earthdata.nasa.gov/display/GIBS' target='_blank'>" +
        'NASA EOSDIS GIBS</a>';
      const nasaUrl =
        'https://gibs.earthdata.nasa.gov' +
        '/wmts/epsg3031/best/' +
        '{layer}/default/{tileMatrixSet}/{z}/{y}/{x}.{format}';

      // config attributes for blue marble layer
      const blueMarble = new L.tileLayer(nasaUrl, {
        attribution: nasaAttrib,
        attributionControl: false,
        tileSize: 512,
        layer: 'BlueMarble_ShadedRelief_Bathymetry',
        tileMatrixSet: '500m',
        format: 'jpg',
      });

      STATE.map = new L.Map('map', {
        crs: EPSG3031,
        minZoom: 0.48,
        maxZoom: 4, // because nasa data has only five zoom levels
      });

      STATE.map.setView(new L.LatLng(-90, 0), 0);
      STATE.map.addLayer(blueMarble);
      let outputDiv = document.getElementById('widget');
      STATE.baseLayer = blueMarble;

      const map = document.getElementById('map');

      $('#exportButton').click(function (element) {
        html2canvas(document.body).then(function (canvas) {
          canvas.toBlob(function (blob) {
            saveAs(blob, 'pretty image.png');
          });
        });
      });
    });
  addResizeListeners();
}
