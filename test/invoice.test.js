'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');
var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');

function order(overrides) {
  var base = {
    id: 1002,
    date: '05/01/2022',
    customer: 'Anil Kulkarni',
    paymentMode: 'upi',
    status: 'completed',
    items: [
      { id: 1, sku: 'GRN-001', name: 'Indrayani Basmati Rice 5kg', hsn: '1006', price: 640, qty: 1 },
      { id: 4, sku: 'OIL-001', name: 'Cold-Pressed Sunflower Oil 1L', hsn: '1512', price: 190, qty: 2 }
    ],
    coupon: 'SAVE10',
    subtotal: 1020,
    discount: 102,
    tax: 45.9,
    total: 963.9
  };
  return Object.assign(base, overrides || {});
}

test('invoice matches checkout HSN tax and coupon totals', function () {
  var billedOrder = order();
  var checkout = pricing.computeTotals(billedOrder.items, billedOrder.coupon);
  var figures = invoice.computeInvoiceFigures(billedOrder);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[1].gstPercent, 5);
  assert.equal(figures.discount, checkout.discount);
  assert.equal(figures.tax, checkout.tax);
  assert.equal(figures.total, checkout.total);
});

test('invoice respects the coupon cap and item HSN slabs', function () {
  var cappedOrder = order({
    id: 1004,
    items: [{ id: 5, sku: 'OIL-002', name: 'Cold-Pressed Groundnut Oil 5L', hsn: '1508', price: 1120, qty: 2 }],
    subtotal: 2240,
    discount: 150,
    tax: 104.5,
    total: 2194.5
  });
  var checkout = pricing.computeTotals(cappedOrder.items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(cappedOrder);

  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.discount, 150);
  assert.equal(figures.tax, checkout.tax);
  assert.equal(figures.total, checkout.total);
});

test('CURRENT BEHAVIOUR — checkout applies HSN slabs and SAVE10 to the pre-tax subtotal', function () {
  var items = order().items;
  var totals = pricing.computeTotals(items, 'SAVE10');

  assert.equal(totals.subtotal, 1020);
  assert.equal(totals.discount, 102);
  assert.equal(totals.taxable, 918);
  assert.equal(totals.lines[0].gstPercent, 5);
  assert.equal(totals.lines[0].tax, 28.8);
  assert.equal(totals.lines[1].gstPercent, 5);
  assert.equal(totals.lines[1].tax, 17.1);
  assert.equal(totals.tax, 45.9);
  assert.equal(totals.total, 963.9);
});

test('invoice uses HSN slabs and applies SAVE10 to the pre-tax subtotal', function () {
  var figures = invoice.computeInvoiceFigures(order());

  assert.equal(figures.subtotal, 1020);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.rows[1].gstPercent, 5);
  assert.equal(figures.tax, 45.9);
  assert.equal(figures.discount, 102);
  assert.equal(figures.total, 963.9);
});

test('invoice SAVE10 discount respects the configured maximum discount', function () {
  var largeOrder = order({
    id: 1004,
    items: [
      { id: 5, sku: 'OIL-002', name: 'Cold-Pressed Groundnut Oil 5L', hsn: '1508', price: 1120, qty: 2 }
    ],
    subtotal: 2240,
    discount: 150,
    tax: 104.5,
    total: 2194.5
  });
  var checkout = pricing.computeTotals(largeOrder.items, 'SAVE10');
  var figures = invoice.computeInvoiceFigures(largeOrder);

  assert.equal(checkout.discount, 150);
  assert.equal(checkout.tax, 104.5);
  assert.equal(checkout.total, 2194.5);
  assert.equal(figures.rows[0].gstPercent, 5);
  assert.equal(figures.tax, 104.5);
  assert.equal(figures.discount, 150);
  assert.equal(figures.total, 2194.5);
});

test('invoice applies mixed 12% and 5% HSN slabs without a coupon', function () {
  var items = [
    { id: 6, sku: 'DRY-001', name: 'A2 Gir Cow Ghee 500ml', hsn: '0405', price: 450, qty: 2 },
    { id: 4, sku: 'OIL-001', name: 'Cold-Pressed Sunflower Oil 1L', hsn: '1512', price: 190, qty: 2 }
  ];
  var checkout = pricing.computeTotals(items, '');
  var figures = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(figures.rows[0].gstPercent, 12);
  assert.equal(figures.rows[1].gstPercent, 5);
  assert.equal(figures.tax, checkout.tax);
  assert.equal(figures.total, checkout.total);
});

test('CURRENT BEHAVIOUR — invoice and checkout agree for an 18% HSN order without a coupon', function () {
  var items = [
    { id: 8, sku: 'BEV-001', name: 'Assam CTC Masala Chai 250g', hsn: '0902', price: 140, qty: 1 },
    { id: 12, sku: 'BEV-003', name: 'Kokum Sherbet Concentrate 750ml', hsn: '2106', price: 180, qty: 2 }
  ];
  var checkout = pricing.computeTotals(items, '');
  var figures = invoice.computeInvoiceFigures({ items: items, coupon: '' });

  assert.equal(checkout.tax, 90);
  assert.equal(checkout.total, 590);
  assert.equal(figures.tax, 90);
  assert.equal(figures.total, 590);
});

test('GST reconciliation matches the SAVE10 order and skips cancelled orders', function () {
  var billedOrder = order();
  var cancelledOrder = Object.assign(order({ id: 1009, coupon: '' }), { status: 'cancelled' });
  var result = reports.getGstReconciliation({
    orders: [billedOrder, cancelledOrder],
    products: [],
    customers: []
  });

  assert.equal(result.totalChecked, 1);
  assert.equal(result.mismatchCount, 0);
  assert.equal(result.totalDelta, 0);
  assert.equal(result.rows[0].orderId, 1002);
  assert.equal(result.rows[0].ledgerTax, 45.9);
  assert.equal(result.rows[0].invoiceTax, 45.9);
  assert.equal(result.rows[0].ledgerTotal, 963.9);
  assert.equal(result.rows[0].invoiceTotal, 963.9);
  assert.equal(result.rows[0].matched, true);
});
