'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var inventory = require('../lib/inventory');
var orders = require('../lib/orders');

test('can sell the exact remaining sellable stock', function () {
  var products = [{ id: 1, name: 'Ghee', stock: 1, reserved: 0 }];
  assert.deepEqual(inventory.check(products, [{ id: 1, qty: 1 }]), { ok: true });
});

test('can sell exactly physical stock not held for reservations', function () {
  var products = [{ id: 1, name: 'Chilli', stock: 4, reserved: 3 }];
  assert.deepEqual(inventory.check(products, [{ id: 1, qty: 1 }]), { ok: true });
});

test('rejects orders exceeding sellable stock and zero-stock sales', function () {
  var products = [{ id: 1, name: 'Rice', stock: 2, reserved: 1 }];
  assert.equal(inventory.check(products, [{ id: 1, qty: 2 }]).ok, false);
  assert.equal(inventory.check(products, [{ id: 1, qty: 1 }, { id: 1, qty: 1 }]).ok, true);
  assert.equal(inventory.check([{ id: 2, name: 'Tea', stock: 0 }], [{ id: 2, qty: 1 }]).ok, false);
});

test('cancelling an order restores item quantities to stock once', function () {
  var db = {
    products: [{ id: 1, stock: 3, reserved: 2 }],
    orders: [{ id: 12, status: 'pending', items: [{ id: 1, qty: 2 }], paymentMode: 'cash', total: 20 }],
    customers: []
  };

  assert.equal(orders.cancel(db, 12).ok, true);
  assert.equal(db.products[0].stock, 5);
  assert.equal(db.products[0].reserved, 2);
  assert.equal(orders.cancel(db, 12).ok, false);
  assert.equal(db.products[0].stock, 5);
});
