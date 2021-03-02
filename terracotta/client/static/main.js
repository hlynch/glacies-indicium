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
  driveFiles: [],
  regions: [],
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
  const radioButtons = document.querySelectorAll('input[type=radio]');

  radioButtons.forEach((radioButton) => {
    radioButton.addEventListener('change', () => {
      $('#clear-button').toggleClass('d-inline-block');
      $('#clear-button').toggleClass('d-none');
      getSelectedBandLayer(radioButtons);
    });
  });

  resetLayerState();
  removeSpinner();
}

/**
 *Gets current selected band from radio buttons.
 *
 * @param {Array<HtmlElement} radioButtons
 */
function getSelectedBandLayer(radioButtons) {
  const selectedBands = Array.from(radioButtons)
    .filter((i) => i.checked)
    .map((i) => i.value);

  let keys = [];

  const currentRegion = $('#search-results .text-primary').attr('id');
  keys.push({ key: 'region', value: selectedBands[0] });
  keys.push({ key: 'band', value: currentRegion || '2' });

  const datasetURL = assembleDatasetURL(
    STATE.remote_host,
    keys,
    DATASETS_PER_PAGE,
    STATE.current_dataset_page
  );

  httpGet(datasetURL).then((res) => {
    const firstResult = res.datasets[0];
    let resultMetadata = [];

    STATE.keys.forEach((bandKey) => {
      resultMetadata.push(firstResult[bandKey.key]);
    });

    updateSinglebandLayer(resultMetadata);
  });
}

/**
 * Reset the radio buttons
 */
function resetRadioButtons() {
  $('input[name=bandListItem]').prop('checked', false);
  $('#clear-button').toggleClass('d-none');
  $('#clear-button').toggleClass('d-inline-block');
}

/**
 *  Initializes the Google API client library and retreives all files in the Drive.
 */
function initClient() {
  var CLIENT_ID =
    '975982665680-97lcqjf10qv490i6424p0slg93gl3qv4.apps.googleusercontent.com';
  var API_KEY = 'AIzaSyDDEkuJal1ZlOYbGfErEeUiTZsDSPEDXV8';
  var DISCOVERY_DOCS = [
    'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest',
  ];

  var SCOPES = 'https://www.googleapis.com/auth/drive.metadata.readonly';
  gapi.client
    .init({
      apiKey: API_KEY,
      clientId: CLIENT_ID,
      discoveryDocs: DISCOVERY_DOCS,
      scope: SCOPES,
    })
    .then(
      () => {
        getAllFiles();
      },
      (error) => {
        console.log(JSON.stringify(error, null, 2));
      }
    );
}

/**
 * Parses json list of regions and creates nested menu
 * @param {JSON} regions
 * @param {HTML Element} container
 */
function buildRegionTree(regions, dataset, container) {
  regions.forEach((region) => {
    let metadataArray = createMetadataArray(region, dataset);
    let listRoot = document.createElement('ul');
    let newListElement = createListElement(region, metadataArray);
    listRoot.appendChild(newListElement);

    if (region.subregions !== undefined)
      buildRegionTree(region.subregions, dataset, listRoot);

    container.appendChild(listRoot);
  });
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
  const regionList = document.getElementById('search-results');
  regionList.innerHTML = '';

  // get key constraints from UI
  let key_constraints = [];

  const datasetUrl = assembleDatasetURL(
    STATE.remote_host,
    key_constraints,
    1000,
    0
  );

  return httpGet(datasetUrl).then((res) => {
    updateDatasetList(remote_host, res.datasets);
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
  buildRegionTree(STATE.regions, datasets, datasetTable);
  addListMargin();
}

/**
 * Finds the first list element and add margin to increase whitespace.
 */
function addListMargin() {
  $('#search-results ul:eq(0)').addClass('ml-20');
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
  const layer_id = element.target.id;

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

  const fileName = 'WV02_' + ds_keys[0] + '_ds_' + ds_keys[1] + '.tif';

  let fileDownloadLink = getFileDownloadLink(fileName);
  updateExportButtonLink(fileDownloadLink);

  updateSinglebandLayer(ds_keys, resetView);
}

/**
 * Update the download link to be the current file set.
 * @param {string} fileDownloadLink
 */
function updateExportButtonLink(fileDownloadLink) {
  $('#exportButton').attr('href', fileDownloadLink);
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

  $('#search-results .text-primary').removeClass('text-primary');
  const dataset_layer = document.getElementById(`${layer_id}`);
  dataset_layer.classList.add('text-primary');

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
  computedUrl.innerHTML = `<span class="bold text-primary">current XYZ URL - </span>${url}`;
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
  metadataField.innerHTML =
    '<span class="bold text-primary">current metadata -</span> ';
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
 * Retrieve and strore metadata values for current region
 * @param {JSON} region
 * @param {Object} dataset
 */
function createMetadataArray(region, dataset) {
  let currentRegionMetaData = [];
  const currentDataset = dataset[region.id];

  STATE.keys.forEach((bandKey) => {
    currentRegionMetaData.push(currentDataset[bandKey.key]);
  });

  httpGet(
    assembleMetadataURL(STATE.remote_host, currentRegionMetaData)
  ).then((metadata) => storeMetadata(metadata));

  return currentRegionMetaData;
}

/**
 * Creates new list element with event listeners for hover and click
 * @param {JSON} content
 */
function createListElement(content, metadata) {
  const listElement = document.createElement('li');
  listElement.innerHTML = content.name;
  listElement.id = serializeKeys(metadata);
  listElement.classList.add('clickable');
  listElement.addEventListener(
    'click',
    toggleSinglebandMapLayer.bind(null, metadata)
  );
  listElement.addEventListener('mouseenter', toggleDatasetMouseover.bind(this));
  listElement.addEventListener('mouseleave', toggleDatasetMouseleave);

  return listElement;
}

/**
 * Display Google Sign in button and listen for changes.
 */
function renderButton() {
  gapi.signin2.render('signin2', {
    scope: 'profile email',
    width: 150,
    height: 30,
    longtitle: false,
    theme: 'dark',
    onsuccess: onSuccess,
    onfailure: onFailure,
  });
}

/**
 * Retrieves all files within Google Drive folder.
 */
function getAllFiles() {
  gapi.client.drive.files
    .list({
      q: "'1Y4kIY0XTCUPs-RniOYFFhaXxkpsHwXgL' in parents and trashed=false",
      fields: 'nextPageToken, files(id, name)',
    })
    .then(function (response) {
      var files = response.result.files;

      files.length > 0
        ? (STATE.driveFiles = files)
        : console.log('No files found.');
    });
}

/**
 * Parse Google Drive Folder contents for specific file
 * @param {string} filename
 */
function getFileDownloadLink(filename) {
  for (var i = 0; i < STATE.driveFiles.length; i++) {
    var file = STATE.driveFiles[i];
    if (file.name === filename) {
      return `https://drive.google.com/uc?export=download&id=${file.id}`;
    }
  }
}

/**
 *  Main entrypoint.
 *  Called in app.html on window.onload.
 *
 * @param {string} hostname The hostname of the remote Terracotta server (evaluated in map.html).
 * @global
 */
function initializeApp(hostname, regions) {
  // sanitize hostname
  if (hostname.charAt(hostname.length - 1) === '/') {
    hostname = hostname.slice(0, hostname.length - 1);
  }

  let regionArray = [];
  regionArray.push(JSON.parse(regions));
  STATE.remote_host = hostname;
  STATE.regions = regionArray;

  getColormapValues(hostname)
    .then(() => getKeys(hostname))
    .then((keys) => {
      STATE.keys = keys;
      initUI(hostname, keys);
      updateSearchResults();
      let osmUrl = 'http://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
      let osmAttrib =
        'Map data © <a href="http://openstreetmap.org">OpenStreetMap</a> contributors';
      let osmBase = L.tileLayer(osmUrl, { attribution: osmAttrib });
      STATE.map = L.map('map', {
        center: [0, 0],
        zoom: 2,
        layers: [osmBase],
      });
    });
}

/**
 *  On load, called to load the auth2 library and API client library.
 */
function handleClientLoad() {
  gapi.load('client:auth2', initClient);
}

/**
 * Logs when user successfully signs into Google.
 *
 * @param {Object} googleUser
 */
function onSuccess(googleUser) {
  initClient();
  const currentUsername = googleUser.getBasicProfile().getName();

  console.log(`Logged in as: ${currentUsername}`);
  toggleDropdownInformation(currentUsername);
}

/**
 * Logs when user unsuccessfully signs into Google.
 */
function onFailure(error) {
  console.log(error);
}

/**
 * Logs out the current user
 */
function signOut() {
  let auth2 = gapi.auth2.getAuthInstance();
  auth2.signOut().then(function () {
    console.log('User signed out.');
  });
  toggleDropdownInformation();
}

/**
 * Toggles text within user profile dropdown
 *
 * @param {string} currentUsername
 */
function toggleDropdownInformation(currentUsername) {
  $('#currentUser').html() === 'Sign in'
    ? $('#currentUser').html('Welcome, ' + currentUsername)
    : $('#currentUser').html('Sign in');

  $('#signin2').toggleClass('d-none');
  $('#sign-out-button').toggleClass('d-none');
}
