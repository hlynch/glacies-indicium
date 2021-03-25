"use strict";

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) { try { var info = gen[key](arg); var value = info.value; } catch (error) { reject(error); return; } if (info.done) { resolve(value); } else { Promise.resolve(value).then(_next, _throw); } }

function _asyncToGenerator(fn) { return function () { var self = this, args = arguments; return new Promise(function (resolve, reject) { var gen = fn.apply(self, args); function _next(value) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value); } function _throw(err) { asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err); } _next(undefined); }); }; }

var fetchMock = require('node-fetch');

var assert = require('assert');

jest.mock('node-fetch', function () {
  return require('fetch-mock-jest').sandbox();
});
var currentHost = 'http://localhost:5000';

function httpGet(_x) {
  return _httpGet.apply(this, arguments);
}

function _httpGet() {
  _httpGet = _asyncToGenerator( /*#__PURE__*/regeneratorRuntime.mark(function _callee(url) {
    return regeneratorRuntime.wrap(function _callee$(_context) {
      while (1) {
        switch (_context.prev = _context.next) {
          case 0:
            return _context.abrupt("return", fetchMock.get(url));

          case 1:
          case "end":
            return _context.stop();
        }
      }
    }, _callee);
  }));
  return _httpGet.apply(this, arguments);
}

describe('get keys', function () {
  it('returns an array of Terracotta keys', function () {
    var keyUrl = "".concat(currentHost, "/keys");
    var result = httpGet(keyUrl);
    console.log(result);
    assert(result === [{
      key: 'region'
    }, {
      key: 'band'
    }]);
  });
});