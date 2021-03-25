const fetchMock = require('node-fetch');
const assert = require('assert');
jest.mock('node-fetch', () => require('fetch-mock-jest').sandbox());
const currentHost = 'http://localhost:5000';

async function httpGet(url) {
  return fetchMock.get(url);
}

describe('get keys', () => {
  it('returns an array of Terracotta keys', () => {
    const keyUrl = `${currentHost}/keys`;
    const result = httpGet(keyUrl);
    console.log(result);
    assert(result === [{ key: 'region' }, { key: 'band' }]);
  });
});
