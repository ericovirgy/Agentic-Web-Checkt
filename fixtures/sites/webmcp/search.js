// Client-side search over a static product list (no network requests).
(function () {
  'use strict';
  var PRODUCTS = [
  {
    "name": "Northwind Trail 29",
    "url": "product-trail.html",
    "price": "1299.00",
    "desc": "A hardtail mountain bike with 29-inch wheels, hydraulic disc brakes and a 12-speed drivetrain."
  },
  {
    "name": "Northwind City 7",
    "url": "product-city.html",
    "price": "749.00",
    "desc": "A commuter bike with a 7-speed internal hub, mudguards, a rear rack and integrated lights."
  },
  {
    "name": "Northwind Kids 20",
    "url": "product-kids.html",
    "price": "329.00",
    "desc": "A lightweight 20-inch bike for riders aged six to nine, with a low standover height and easy-reach brakes."
  }
];
  var params = new URLSearchParams(location.search);
  var q = (params.get('q') || '').trim();
  var input = document.getElementById('q');
  var results = document.getElementById('results');
  if (!q) return;
  input.value = q;
  var needle = q.toLowerCase();
  var hits = PRODUCTS.filter(function (p) { return (p.name + ' ' + p.desc).toLowerCase().indexOf(needle) !== -1; });
  if (hits.length === 0) {
    results.innerHTML = '<p>No products match "' + q.replace(/[<>&]/g, '') + '".</p>';
    return;
  }
  var ul = document.createElement('ul');
  hits.forEach(function (p) {
    var li = document.createElement('li');
    var a = document.createElement('a');
    a.href = p.url; a.textContent = p.name;
    li.appendChild(a);
    li.appendChild(document.createTextNode(' - $' + p.price + '. ' + p.desc));
    ul.appendChild(li);
  });
  results.innerHTML = '<p>' + hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for "' + q.replace(/[<>&]/g, '') + '".</p>';
  results.appendChild(ul);
})();
