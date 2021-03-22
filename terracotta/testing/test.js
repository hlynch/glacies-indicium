var rewire = require('rewire');
var chai = require('chai');
var should = chai.should();
const fetch = require('node-fetch');
var app = rewire('../client/static/js/main.js');

var logError = app.__get__('getKeys');

describe('getKeys', function () {
  it('should get the correct keys', function () {
    getKeys('http://localhost:5000').should.equal([{ key: 'region' }, { key: 'band' }]);
  });
});
