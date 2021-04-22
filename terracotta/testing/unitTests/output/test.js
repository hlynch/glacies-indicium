"use strict";

var _main = require("../../../client/static/js/main.js");

var assert = require('assert');

var currentHost = 'http://localhost:5000';
describe('client', function () {
  describe('serialize keys', function () {
    it('returns a string joined with /', function () {
      var result = (0, _main.serializeKeys)(['regionName', 'bandName']);
      assert(result === 'regionName/bandName');
    });
  });
  describe('assemble singleband url', function () {
    it('returns a url for a single band layer', function () {
      var keys = ['ShakletonGlacier', 'Blue'];
      var result = (0, _main.assembleSinglebandURL)(keys, null, false, currentHost);
      assert(result === "".concat(currentHost, "/singleband/").concat(keys[0], "/").concat(keys[1], "/{z}/{x}/{y}.png"));
    });
  });
  describe('compare array', function () {
    it('compares two arrays and returns if they are equal', function () {
      var arr1 = ['ShakletonGlacier', 'Blue'];
      var arr2 = ['ShakletonGlacier', 'Blue'];
      var result = (0, _main.compareArray)(arr1, arr2);
      assert(result);
    });
  });
});