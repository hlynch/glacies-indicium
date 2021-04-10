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

const DATASETS_PER_PAGE = 10;
const THUMBNAIL_SIZE = [128, 128];
const COLORMAPS = [
  { displayName: 'Greyscale', id: 'greys_r' },
  { displayName: 'Blue-Red', id: 'rdbu_r' },
  { displayName: 'Blue-Green', id: 'bugn' },
];

const STATE = {
  keys: [],
  errors: errorProxy([]),
  remoteHost: '',
  currentDatasetPage: 0,
  datasetMetadata: {},
  colormapValues: {},
  currentColormap: '',
  currentSinglebandStretch: [0, 233.1878],
  map: undefined,
  overlayLayer: undefined,
  activeSinglebandLayer: undefined,
  activeRgbLayer: undefined,
  activeBandKey: undefined,
  mPos: 0,
};

// ===================================================
// Convenience functions to get valid Terracotta URLs.
// ===================================================

/**
 * As it says, gets keys so the app can be initialized.
 *
 * @param {string} remoteHost
 *
 * @return {Promise<Array<Terracotta.IKey>>}
 */
function getKeys(remoteHost) {
  const keyUrl = `${remoteHost}/keys`;
  return httpGet(keyUrl).then((response) => response.keys || []);
}

/**
 * @param {string} remoteHost
 * @param {Array<Terracotta.IKeyConstraint>} key_constraints Key/val pairs of constraints.
 * @param {number} limit Items per page
 *
 * @return {string} dataset URL.
 */
function assembleDatasetURL(key_constraints, limit) {
  let request_url = `${STATE.remoteHost}/datasets?limit=${limit}&page=${STATE.currentDatasetPage}`;

  for (let index = 0; index < key_constraints.length; index++) {
    request_url += `&${key_constraints[index].key}=${key_constraints[index].value}`;
  }

  return request_url;
}

/**
 * @param {Array<string>} dsKeys Dataset keys i.e. [<type>, <date>, <id>, <band>].
 *
 * @return {string} metadata URL.
 */
function assembleMetadataURL(dsKeys) {
  let request_url = `${STATE.remoteHost}/metadata`;
  for (let index = 0; index < dsKeys.length; index++) {
    request_url += `/${dsKeys[index]}`;
  }
  return request_url;
}

/**
 * @param {Array<string>} keys
 * @param {Terracotta.IOptions} [options]
 * @param {boolean} [preview]
 *
 * @return {string} singleband URL.
 */
function assembleSinglebandURL(keys, options, preview, remoteHost = STATE.remoteHost) {
  let request_url;
  if (preview) {
    request_url = `${remoteHost}/singleband/${keys.join(
      '/'
    )}/preview.png?tile_size=${JSON.stringify(THUMBNAIL_SIZE)}`;
  } else {
    request_url = `${remoteHost}/singleband/${keys.join('/')}/{z}/{x}/{y}.png`;
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
 * @param {string} colormap The id of the color map
 * @param {number} num_values The number of values to return
 *
 * @return {string} color map URL
 */
function assembleColormapUrl(remoteHost, colormap, num_values) {
  return `${remoteHost}/colormap?colormap=${colormap}&stretch_range=[0,1]&num_values=${num_values}`;
}

// ===================================================
// Initializers
// ===================================================

/**
 * Gets colorbar values for a given range.
 *
 * @param {string} remoteHost
 * @param {number} [num_values=100] The number of values to get colors for.
 */
function getColormapValues(remoteHost, num_values = 100) {
  const requestColorMap = (colormap) => {
    const cmapId = colormap.id;

    return httpGet(assembleColormapUrl(remoteHost, cmapId, num_values)).then(
      (response) => {
        if (response && response.colormap) {
          STATE.colormapValues[cmapId] = [];

          for (let j = 0; j < num_values; j++) {
            STATE.colormapValues[cmapId][j] = response.colormap[j].rgba;
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
function initUI(remoteHost, keys) {
  httpGet('/getJsonFile/bandNames').then((result) => {
    result.length >= 5 ? createDropdownBandInputs(result) : createBandInputs(result);
  });

  // initialize colormap selector
  let colormapSelector = document.getElementById('colormap-selector');
  colormapSelector.innerHTML = '';

  for (let i = 0; i < COLORMAPS.length; i++) {
    let cmapOption = document.createElement('button');
    cmapOption.value = COLORMAPS[i].id;
    cmapOption.innerHTML = COLORMAPS[i].displayName;
    cmapOption.classList.add('btn', 'btn-block');
    cmapOption.setAttribute('onclick', 'updateColormap(this.value)');
    if (i === 0) {
      updateColormap(COLORMAPS[i].id);
    }
    colormapSelector.appendChild(cmapOption);
  }

  if (halfmoon.readCookie('halfmoon_preferredMode')) {
    if (halfmoon.readCookie('halfmoon_preferredMode') == 'light-mode') {
      $('#header-one').attr('src', '/static/images/header_large.png');
    } else {
      $('#header-one').attr('src', '/static/images/header_large_dark_mode.png');
    }
  }
}

/**
 * Create a list of radio bands inside a dropdown menu
 * @param {Array} bandNames
 */
function createDropdownBandInputs(bandNames) {
  const dropdownContainer = $('#band-dropdown-container');

  bandNames.forEach((band) => {
    let dropdownMenuContainer = $('<div class="dropdown-item"></div>');
    let bandRadioButtonContainer = $('<div class="custom-radio mb-10"></div>');
    let bandRadioButton = createNewbandRadioButton(band);
    let bandRadioButtonLabel = createNewInputLabel(band['name'], band['name']);

    $(bandRadioButtonContainer).append(bandRadioButton);
    $(bandRadioButtonContainer).append(bandRadioButtonLabel);
    $(dropdownMenuContainer).append(bandRadioButtonContainer);
    $('#band-dropdown-menu').append(bandRadioButtonContainer);
  });

  dropdownContainer.css('display', 'block');

  addbandRadioButtonListeners();
}

/**
 * Creates a new input for each availible GeoTiff band
 *
 * @param {Array} bandNames
 */
function createBandInputs(bandNames) {
  bandNames.forEach((band) => {
    let bandRadioButtonContainer = $('<div class="custom-radio mb-10"></div>');
    let bandRadioButton = createNewbandRadioButton(band);
    let bandRadioButtonLabel = createNewInputLabel(band['name'], band['name']);

    $(bandRadioButtonContainer).append(bandRadioButton);
    $(bandRadioButtonContainer).append(bandRadioButtonLabel);
    $('#key-list').append(bandRadioButtonContainer);
  });

  addbandRadioButtonListeners();
}

/**
 *Gets current selected band from radio buttons.
 *
 * @param {Array<Element>} bandRadioButtons List of all radio buttons in the DOM.
 */
function getSelectedBandLayer(bandRadioButtons) {
  const selectedBands = Array.from(bandRadioButtons)
    .filter((i) => i.checked)
    .map((i) => i.value);

  const activeBandKey = selectedBands[0];
  const newButtonContent = $(
    `<span>${activeBandKey}</span><i class="fa fa-angle-down ml-5" aria-hidden="true"></i>`
  );

  $('#dropdown-toggle-1').html(newButtonContent);

  let keys = [];

  let currentRegion =
    $('#search-results .text-primary').attr('id') ??
    $('#search-results li:eq(0)').prop('id');

  STATE.activeBandKey = activeBandKey;
  keys.push({ key: 'band', value: activeBandKey });
  keys.push({ key: 'region', value: currentRegion.split('/')[0] });

  const datasetURL = assembleDatasetURL(keys, DATASETS_PER_PAGE);

  httpGet(datasetURL).then((res) => {
    if (res.datasets.length > 0) {
      const firstResult = res.datasets[0];
      let resultMetadata = [];

      STATE.keys.forEach((bandKey) => {
        resultMetadata.push(firstResult[bandKey.key]);
      });

      toggleSinglebandMapLayer(currentRegion);
    }
  });
}

/**
 * Reset the radio buttons
 */
function resetbandRadioButtons() {
  if (STATE.activeSinglebandLayer !== undefined)
    $('input[type="radio"]').prop('checked', false);
}

/**
 * Parses json list of regions and creates nested menu
 * @param {JSON} regions List of all regions availible from data
 * @param {Element} container Parent element of current region
 */
function buildRegionTree(regions, bands, container) {
  regions.forEach((region) => {
    bands.forEach((bandObject) => {
      createMetadataArray(region.name, bandObject.band);
    });

    let listRoot = $('<ul></ul>');
    let newListElement = createListElement(region);
    listRoot.append(newListElement);

    if (region.subregions !== undefined)
      buildRegionTree(region.subregions, bands, listRoot);

    container.append(listRoot);
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
  const dsKeys = serializeKeys(Object.values(metadata.keys));
  STATE.datasetMetadata[dsKeys] = metadata;
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
                   x
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
 */
function updateSearchResults() {
  $('#search-results').html('');

  let key_constraints = [];

  const datasetUrl = assembleDatasetURL(key_constraints, DATASETS_PER_PAGE);

  return httpGet(datasetUrl).then((res) => {
    updateDatasetList(res.datasets);
  });
}

/**
 * Filter regions on
 */
function filterRegions(element) {
  const value = $(element).val().toLowerCase();
  $('ul li')
    .hide()
    .filter(function () {
      let item = $(this).text().toLowerCase();
      return item.includes(value);
    })
    .closest('li')
    .show();
}

/**
 * Refreshes the dataset list.
 *
 * @param {Array<Terracotta.IDataset>} datasets
 */
function updateDatasetList(datasets) {
  const regionContainer = $('#search-results');
  const dataSetFileName = 'alphaPrototypeMockData';

  httpGet(`/getJsonFile/${dataSetFileName}`)
    .then((data) => {
      buildRegionTree(data, datasets, regionContainer);
    })
    .then(removeSpinner());
}

/**
 * Increments the dataset result page by the provided step.
 * This method is called from app.html.
 *
 * @param {number} step
 * @global
 */
function incrementResultsPage(step) {
  STATE.currentDatasetPage += step;
  updatePageControls();
  updateSearchResults();
}

/**
 * Updates the page counter & prev page button.
 */
function updatePageControls() {
  document.getElementById('page-counter').innerHTML = String(
    STATE.currentDatasetPage + 1
  );
  /**
   * @type {HTMLButtonElement}
   */
  let prevPageButton = document.querySelector('#prev-page');
  if (STATE.currentDatasetPage > 0) {
    prevPageButton.disabled = false;
  } else {
    prevPageButton.disabled = true;
  }
}

/**
 * Triggered by a change in the colormap selector in app.html.
 *
 * @global
 */
function updateColormap(colormapValue) {
  STATE.currentColormap = colormapValue;

  let colormap = COLORMAPS.find((color) => color.id === colormapValue);
  const newButtonContent = $(
    `<span>${colormap.displayName}</span><i class="fa fa-angle-down ml-5" aria-hidden="true"></i>`
  );

  $('#dropdown-toggle-2').html(newButtonContent);

  let colorbar = STATE.colormapValues[STATE.currentColormap];

  if (!colorbar) {
    return false;
  }

  if (STATE.activeSinglebandLayer == null) return;

  const currentRegion = $('#search-results .text-primary').attr('id');

  updateSinglebandLayer(currentRegion, false);
}

/**
 * Adds a footprint overlay to map
 * @param {HTMLElement} datasetTable
 */
function toggleDatasetMouseover(element) {
  if (STATE.overlayLayer !== undefined) {
    STATE.map.removeLayer(STATE.overlayLayer);
  }

  const layer_id = element.target.id.split('/')[0];

  const selectedBand =
    STATE.activeBandKey ?? $('input[name="bandRadioButton"]').prop('id');

  const key = serializeKeys([layer_id, selectedBand]);

  const metadata = STATE.datasetMetadata[key];
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
 *  Called in app.html on Dark mode toggle
 * @global
 */
function toggleDarkMode() {
  halfmoon.toggleDarkMode();

  $('#viewModeIcon').toggleClass('fa-moon');
  $('#viewModeIcon').toggleClass('fa-sun');

  toggleLogo();
}

/**
 * Removes overlay from map after hover
 *
 * @param {HTMLElement} datasetTable
 */
function toggleDatasetMouseleave() {
  STATE.map.removeLayer(STATE.overlayLayer);
}

/**
 * Toggles logo in sidebar between light and dark mode
 *
 */
function toggleLogo() {
  $('#header-one').attr('src') === '/static/images/header_large_dark_mode.png'
    ? $('#header-one').attr('src', '/static/images/header_large.png')
    : $('#header-one').attr('src', '/static/images/header_large_dark_mode.png');
}

/**
 * Toggle active singleband layer.
 *
 * @global
 * @param {Array<string>} dsKeys
 * @param {boolean} resetView
 */
function toggleSinglebandMapLayer(currentRegion, resetView = true) {
  showControlButtons();
  resetLayerState();

  const currentBand =
    $('input[name="bandRadioButton"]:checked').val() ??
    $('input[name="bandRadioButton"]:eq(0)').val();

  const fileName = currentRegion.split('/')[0] + '_' + currentBand + '.tif';

  updateExportButtonLink(fileName);
  updateSinglebandLayer(currentRegion, resetView);
}

/**
 * Update the download link to be the current file set.
 *
 * @param {string} fileDownloadLink
 */
function updateExportButtonLink(fileName) {
  $('#export-button').attr('href', `/static/mosaics/optimized/${fileName}`);
}

/**
 * Switch current active layer to the given singleband dataset
 *
 * @param {Array<string>} dsKeys Keys of new layer
 * @param {boolean} resetView Fly to new dataset if not already on screen
 */
function updateSinglebandLayer(currentRegion, resetView = true) {
  removeRasterLayer();

  let selectedBand;

  if (STATE.activeBandKey === undefined) {
    selectedBand = $('input[name="bandRadioButton"]:eq(0)').prop('id');
    $('input[name="bandRadioButton"]:eq(0)').prop('checked', true);
  } else {
    selectedBand = STATE.activeBandKey;
  }

  const newButtonContent = $(
    `<span>${selectedBand}</span><i class="fa fa-angle-down ml-5" aria-hidden="true"></i>`
  );

  $('#dropdown-toggle-1').html(newButtonContent);

  const regionName = currentRegion.split('/')[0];
  const currentDataArray = [regionName, selectedBand];

  const regionKey = serializeKeys(currentDataArray);
  const metadata = STATE.datasetMetadata[regionKey];

  let layerOptions = {};
  if (STATE.currentColormap) {
    layerOptions.colormap = STATE.currentColormap;
  }
  if (STATE.currentSinglebandStretch) {
    layerOptions.stretch_range = JSON.stringify(STATE.currentSinglebandStretch);
  }
  const layerUrl = assembleSinglebandURL(currentDataArray, layerOptions);

  STATE.activeSinglebandLayer = {
    keys: regionKey,
    layer: L.tileLayer(layerUrl).addTo(STATE.map),
  };

  $('#search-results .text-primary').removeClass('text-primary');

  const datasetLayer =
    document.getElementById(currentRegion) ?? $('#search-results li:eq(0)');

  datasetLayer.classList.add('text-primary');

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
 * @param {Array<number>} dsBounds bounding box of TC dataset [w, s, e, n]
 * @param {Array<number>} screenBounds bouding box of user's screen [w, s, e, n]
 *
 * @return {number} ratio of screen covered by dataset in range (0, 1)
 */
function calcScreenCovered(dsBounds, screenBounds) {
  const xOverlap = Math.max(
    0,
    Math.min(dsBounds[2], screenBounds[2]) - Math.max(dsBounds[0], screenBounds[0])
  );
  const yOverlap = Math.max(
    0,
    Math.min(dsBounds[3], screenBounds[3]) - Math.max(dsBounds[1], screenBounds[1])
  );
  const overlapArea = xOverlap * yOverlap;
  const screenArea =
    (screenBounds[3] - screenBounds[1]) * (screenBounds[2] - screenBounds[0]);
  return overlapArea / screenArea;
}

/**
 * Updates page controls & search results when search changes.
 */
function searchFieldChanged() {
  STATE.currentDatasetPage = 0;
  updatePageControls();
  updateSearchResults();
}

/**
 * Reset all layer STATE
 * (remove layers from map, deactivate navigation section, clear info box)
 */
function resetLayerState(resetAllButtons) {
  removeRasterLayer();

  if (resetAllButtons) {
    hideRegionButtons();
    resetbandRadioButtons();
  }

  $('#layerInfo__container').css('display', 'none');
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
    $('#search-results .text-primary').removeClass('text-primary');
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
    metadata = STATE.datasetMetadata[serializeKeys(keys)];
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

  metadata.range[0] = Number(metadata.range[0].toFixed(2));
  metadata.range[1] = Number(metadata.range[1].toFixed(2));

  metadataField.style.display = 'block';
  metadataField.innerHTML = '<span class="bold text-primary">current metadata -</span> ';
  if (metadata.mean) metadataField.innerHTML += `mean: ${metadata.mean.toFixed(2)}`;
  if (metadata.range)
    metadataField.innerHTML += ` range: ${JSON.stringify(metadata.range)}`;
  if (metadata.stdev) metadataField.innerHTML += ` stdev: ${metadata.stdev.toFixed(2)}`;
  if (metadata.valid_percentage)
    metadataField.innerHTML += ` valid_percentage: ${metadata.valid_percentage.toFixed(
      2
    )}`;
  if (Object.keys(metadata.metadata).length > 0)
    metadataField.innerHTML += ` metadata: ${JSON.stringify(metadata.metadata)}`;
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
  layerContent.style.display = layerContent.style.display === 'block' ? 'none' : 'block';
}

/**
 * Hides reset and export buttons
 */
function hideRegionButtons() {
  $('#clear-button').addClass('d-none');
  $('#clear-button').removeClass('d-inline-block');

  $('#export-button').addClass('d-none');
  $('#export-button').removeClass('d-inline-block');
}

/**
 * Displays reset and export buttons
 */
function showControlButtons() {
  $('#clear-button').removeClass('d-none');
  $('#clear-button').addClass('d-inline-block');

  $('#export-button').removeClass('d-none');
  $('#export-button').addClass('d-inline-block');
}

/**
 *  Called after InitUI, removes spinner.
 */
function removeSpinner() {
  document.getElementById('loader__container').style.display = 'none';
}

/**
 * Retrieve and strore metadata values for current region
 * @param {string} region
 * @param {string} bandName
 */
function createMetadataArray(region, bandName) {
  let currentRegionMetaData = [];

  currentRegionMetaData.push(region.split(' ').join(''));
  currentRegionMetaData.push(bandName);

  httpGet(assembleMetadataURL(currentRegionMetaData)).then((metadata) =>
    storeMetadata(metadata)
  );

  return currentRegionMetaData;
}

/**
 * Creates new list element with event listeners for hover and click
 * @param {JSON} content
 */
function createListElement(content) {
  const reducedName = content.name.split(' ').join('');
  const listElementId = reducedName + '/' + content.id;

  const listElement = $(
    `<li id='${listElementId}' class='clickable'>${content.name}</li>`
  );

  listElement.on('click', toggleSinglebandMapLayer.bind(null, listElementId));
  listElement.on('mouseenter', toggleDatasetMouseover.bind(this));
  listElement.on('mouseleave', toggleDatasetMouseleave);

  return listElement;
}

/**
 * Creates a new input of type radio
 *
 * @param {Object} inputContent
 */
function createNewbandRadioButton(inputContent) {
  const contentName = inputContent['name'].toLowerCase();

  let newbandRadioButton = $(
    `<input type="radio" id='${contentName}' value='${contentName}' name="bandRadioButton" />`
  );

  return newbandRadioButton;
}

/**
 * Creates a new label for a specific input element
 *
 * @param {string} inputName
 * @param {string} labelContent
 */
function createNewInputLabel(inputName, labelContent) {
  return $(`<label for="${inputName.toLowerCase()}">${labelContent}</li>`);
}

/**
 * Add an event listener to each band input to toggle a new layer
 */
function addbandRadioButtonListeners() {
  const bandRadioButtons = document.querySelectorAll('input[type="radio"]');

  bandRadioButtons.forEach((radioButton) => {
    radioButton.addEventListener('change', () => {
      getSelectedBandLayer(bandRadioButtons);
    });
  });
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

  STATE.remoteHost = hostname;
  getColormapValues(hostname)
    .then(() => getKeys(hostname))
    .then((keys) => {
      STATE.keys = keys;
      initUI(hostname, keys);
      updateSearchResults();

      /*
      const EPSG3031 = new L.Proj.CRS(
        'EPSG:3031',
        '+proj=stere +lat_0=-90 +lat_ts=-71 +lon_0=0 +k=1 +x_0=0 +y_0=0 +datum=WGS84 +units=m +no_defs',
        {
          origin: [-4194304, 4194304],
          resolutions: [8192.0, 4096.0, 2048.0, 1024.0, 512.0, 256.0],
          bounds: L.bounds([-4194304, -4194304], [4194304, 4194304]),
        }
      );

      const southWest = L.latLng(-38.94137277935882, -135);
      const northEast = L.latLng(-38.94137277935882, 45);
      const bounds = L.latLngBounds(southWest, northEast);

      // create the map
      STATE.map = L.map('map', {
        crs: EPSG3031,
        minZoom: 0,
        maxZoom: 4, // because nasa data has only five zoom levels
        maxBounds: bounds,
      });

      // config attributes for nasa data source
      const nasaAttrib =
        "Data Source &copy; <a href='https://www.comnap.aq/SitePages/Home.aspx' target='_blank'>" +
        "COMNAP</a><br>Base Map &copy; <a href='https://wiki.earthdata.nasa.gov/display/GIBS' target='_blank'>" +
        'NASA EOSDIS GIBS</a>';
      const nasaUrl =
        'https://gibs-{s}.earthdata.nasa.gov' +
        '/wmts/epsg3031/best/' +
        '{layer}/default/{tileMatrixSet}/{z}/{y}/{x}.{format}';

      // config attributes for blue marble layer
      const blueMarble = new L.tileLayer(nasaUrl, {
        attribution: nasaAttrib,
        attributionControl: false,
        tileSize: 512,
        layer: 'BlueMarble_ShadedRelief_Bathymetry',
        tileMatrixSet: '500m',
        format: 'jpeg',
      });

      L.control
        .attribution({
          prefix: false,
          position: 'bottomleft',
        })
        .addTo(STATE.map);

      STATE.map.setView(new L.LatLng(-90, 0), 0);
      STATE.map.addLayer(blueMarble);
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
    });
}

/**
 * Exports functions necessary for testing when compiled with Node
 */
function exportModules() {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
      serializeKeys,
      assembleSinglebandURL,
      httpGet,
      getKeys,
      compareArray,
      createListElement,
    };
  }
}

exportModules();
