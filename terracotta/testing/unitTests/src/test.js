import {
  assembleSinglebandURL,
  serializeKeys,
  compareArray,
} from '../../../client/static/js/main.js';

const assert = require('assert');
const currentHost = 'http://localhost:5000';

describe('client', () => {
  describe('serialize keys', () => {
    it('returns a string joined with /', () => {
      const result = serializeKeys(['regionName', 'bandName']);
      assert(result === 'regionName/bandName');
    });
  });
  describe('assemble singleband url', () => {
    it('returns a url for a single band layer', () => {
      const keys = ['ShakletonGlacier', 'Blue'];
      const result = assembleSinglebandURL(keys, null, false, currentHost);

      assert(
        result === `${currentHost}/singleband/${keys[0]}/${keys[1]}/{z}/{x}/{y}.png`
      );
    });
  });
  describe('compare array', () => {
    it('compares two arrays and returns if they are equal', () => {
      const arr1 = ['ShakletonGlacier', 'Blue'];
      const arr2 = ['ShakletonGlacier', 'Blue'];
      const result = compareArray(arr1, arr2);

      assert(result);
    });
  });
});
