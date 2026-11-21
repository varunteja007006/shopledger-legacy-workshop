'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var orders = require('../lib/orders');
var ledger = require('../lib/ledger');

test('order history sorts DD/MM/YYYY dates newest first across years', function () {
  var db = { orders: [
    { id: 1001, date: '28/12/2021' },
    { id: 1004, date: '30/01/2022' },
    { id: 1008, date: '15/03/2022' }
  ] };

  assert.deepEqual(orders.list(db, {}).map(function (o) { return o.id; }), [1008, 1004, 1001]);
});

test('order date filters compare real dates for ISO and DD/MM/YYYY inputs', function () {
  var db = { orders: [
    { id: 1, date: '28/12/2021' },
    { id: 2, date: '30/01/2022' },
    { id: 3, date: '15/03/2022' }
  ] };

  assert.deepEqual(orders.list(db, { from: '2022-01-01', to: '2022-02-01' }).map(function (o) { return o.id; }), [2]);
  assert.deepEqual(orders.list(db, { from: '01/01/2022', to: '15/03/2022' }).map(function (o) { return o.id; }), [3, 2]);
});

test('settlement amount sent as a string updates totals numerically', function () {
  var db = {
    nextSettlementId: 501,
    customers: [{ id: 7, name: 'Meera Joshi', openingBalance: 0, totalBilled: 2432.01, totalSettled: 1200 }]
  };

  var result = ledger.recordSettlement(db, 7, '500', 'upi');
  assert.equal(result.ok, true);
  assert.equal(result.customer.totalSettled, 1700);
  assert.equal(result.customer.balance, 732.01);
  assert.equal(result.settlement.amount, 500);
});

test('settlement rejects nonnumeric and nonpositive values', function () {
  var db = { customers: [{ id: 7, name: 'Meera Joshi', totalSettled: 1200 }] };
  assert.equal(ledger.recordSettlement(db, 7, 'nope').ok, false);
  assert.equal(ledger.recordSettlement(db, 7, 0).ok, false);
});
