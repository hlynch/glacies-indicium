const json = [
  {
    name: 'Northern Victoria Land',
    subregions: [
      {
        name: 'Asgard Range',
        subregions: [
          {
            name: 'Mt. Newall',
          },
          {
            name: 'Round Mountain',
          },
        ],
      },
      {
        name: 'Ferrar Glacier',
        level: 1,
        subregions: [
          {
            name: 'Kukri Hills',
          },
          {
            name: 'Briggs Hills',
          },
          {
            name: 'Thomas Heights',
          },
        ],
      },
      {
        name: 'Kukri Hills',
        subregions: [
          {
            name: 'Mt Coates',
          },
        ],
      },
      {
        name: 'Quartermain Mountain',
        subregions: [
          {
            name: 'Beacon Valley',
          },
          {
            name: 'Pivot Peak',
          },
        ],
      },
      {
        name: 'Royal Society Range',
        subregions: [
          {
            name: 'Garwood Valley',
          },
          {
            name: 'Miers Valley',
          },
          {
            name: 'Heald Island',
          },
          {
            name: 'Blue Glacier',
          },
          {
            name: 'Mt. Rucker',
          },
          {
            name: 'Trough Lake',
          },
          {
            name: 'Mt. Huggins',
          },
          {
            name: 'The Spire',
          },
          {
            name: 'Table Mountain',
          },
        ],
      },
      {
        name: 'Taylor Glacier',
        subregions: [{ name: 'Northwest Mountain' }],
      },
      {
        name: 'Taylor Valley',
        subregions: [
          {
            name: 'Northwest Mountain',
          },
          {
            name: 'New Harbor',
          },
          {
            name: 'Fryxell Basin',
          },
          {
            name: 'Kukri Hills',
          },
          {
            name: 'Hoare Basin',
          },
        ],
      },
      {
        name: 'Willett Range',
        subregions: [
          { name: 'Head Mountains' },
          { name: 'Apocolypse Peaks' },
          { name: 'Shapeles Mountain' },
        ],
      },
      {
        name: 'Wright Valley',
        subregions: [{ name: 'Mt. Fleming' }],
      },
    ],
  },
];

function parseData(jsonObject) {
  let listRoot = document.createElement('ul');
  for (var index = 0; index < jsonObject.length; index++) {
    listRoot.appendChild(createListElement(jsonObject[index].name));
    if (regionHasSubregions(jsonObject, index)) {
      const subregionList = parseData(jsonObject[index].subregions);
      listRoot.appendChild(subregionList);
    }
  }
  return listRoot;
}

function regionHasSubregions(array, currentIndex) {
  return (
    array[currentIndex].subregions !== undefined &&
    array[currentIndex].subregions.length > 0
  );
}

function createListElement(content) {
  const listElement = document.createElement('li');
  listElement.innerHTML = content;
  return listElement;
}

const regionList = parseData(json);
document.getElementById('root').appendChild(regionList);

/* 
const fs = require('fs');

fs.readFile('./regionList.json', 'utf8', (err, jsonString) => {
  err
    ? console.log('File read failed:', err)
    : parseData(JSON.parse(jsonString));
});

function parseData(regionList) {
  console.log(regionList);
  for (var key in regionList) {
    console.log(regionList[index].name);
    for (
      var innerIndex = 0;
      innerIndex < regionList[index].subregions.length;
      innerIndex++
    )
      console.log('  ' + regionList[index].subregions[innerIndex].name);
  }
} */

/*
class UserInterface {
  constructor(dropdownContainerId, bandContainerId) {
    this.dropdownContainerId = dropdownContainerId;
    this.bandContainerId = bandContainerId;
  }

  generateRegionList(jsonFileName) {
    const regionList = new RegionsList(jsonFileName);
    regionList.openJsonFile();
    regionList.parseData();
  }
}

class RegionsList {
  jsonFileName = '';
  jsonData;

  constructor(jsonFileName) {
    this.jsonFileName = jsonFileName;
  }

  openJsonFile() {
    $.ajax({
      url: this.jsonFileName,
      type: 'get',
      dataType: 'json',
      cache: false,
      success: (data) => {
        this.jsonData = data;
      },
      async: true,
    });
  }

  setJsonData(data) {
    this.jsonData = data;
  }

  parseData() {
    for (var index = 0; index < this.jsonData.length; index++) {
      this.createList(this.jsonData[index]);
    }
  }

  createList(jsonObject) {
    let listRoot = document.createElement('ul');
    let listItem = document.createElement('li');
    listItem.innerHTML = jsonObject.name;

    let subregionList = document.createElement('ul');

    for (
      var innerIndex = 0;
      innerIndex < jsonObject.subregions.length;
      innerIndex++
    ) {
      let subregionItem = document.createElement('li');
      subregionItem.innerHTML = jsonObject.subregions[innerIndex].name;

      subregionList.appendChild(subregionItem);
    }

    if (jsonObject.subregions.length > 0) {
      listItem.appendChild(subregionList);
    }

    listRoot.appendChild(listItem);

    const rootElement = document.getElementById('root');

    rootElement.appendChild(listRoot);
  }
}

const userInterface = new UserInterface('root', 'test');
userInterface.generateRegionList('http://localhost:8000/regionList.json');
// const regionList = new RegionsList('http://localhost:8000/regionList.json');

// regionList.openJsonFile();
*/
