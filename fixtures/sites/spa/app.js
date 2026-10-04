// Single-page app fixture. Renders after a 300 ms delay, routes by hash, no fetch() calls.
(function () {
  'use strict';
  var DATA = {
    products: [
      { slug: 'trail', name: 'Northwind Trail 29', price: '1299.00', desc: 'A hardtail mountain bike with 29-inch wheels and a 12-speed drivetrain.' },
      { slug: 'city', name: 'Northwind City 7', price: '749.00', desc: 'A commuter bike with a 7-speed internal hub, mudguards and a rear rack.' },
      { slug: 'kids', name: 'Northwind Kids 20', price: '329.00', desc: 'A lightweight 20-inch bike for riders aged six to nine.' }
    ],
    contact: { email: 'hello@northwind.example', phone: '+1 555 010 0199', address: '12 Harbour Lane, Portsmouth NW1 2AB, United Kingdom' }
  };
  var cart = 0;

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  var views = {
    '/': function () {
      return '<h1>Bikes built for every road</h1>' +
        '<p>Northwind Bikes is a small, fictional bike shop. We sell three models, ship within two working days and accept returns within 30 days.</p>' +
        '<h2>Featured products</h2><ul class="cards">' +
        DATA.products.map(function (p) { return '<li class="card"><h3><a href="#/products">' + esc(p.name) + '</a></h3><p>$' + p.price + '</p></li>'; }).join('') +
        '</ul><h2>Need help?</h2><ul><li><a href="#/contact">Contact our team</a></li><li><a href="#/returns">Read the return policy</a></li></ul>' +
        '<p class="ticker" aria-live="off">Visitors online: <span id="ticker">0</span></p>';
    },
    '/products': function () {
      return '<h1>Products</h1><p>Three models, all in stock.</p><ul class="cards">' +
        DATA.products.map(function (p) {
          return '<li class="card"><h2>' + esc(p.name) + '</h2><p>' + esc(p.desc) + '</p><p>$' + p.price + '</p>' +
            '<button type="button" data-add="' + esc(p.name) + '">Add ' + esc(p.name) + ' to cart</button></li>';
        }).join('') + '</ul><p role="status" id="cart-message"></p>';
    },
    '/contact': function () {
      return '<h1>Contact us</h1><address><p>Email: <a href="mailto:' + DATA.contact.email + '">' + DATA.contact.email + '</a></p>' +
        '<p>Phone: ' + DATA.contact.phone + '</p><p>' + esc(DATA.contact.address) + '</p></address>' +
        '<h2>Send us a message</h2><form id="contact-form">' +
        '<p><label for="name">Your name</label> <input type="text" id="name" name="name" required placeholder="Alex Example"></p>' +
        '<p><label for="email">Email address</label> <input type="email" id="email" name="email" required placeholder="alex@example.com"></p>' +
        '<p><label for="message">Message</label> <textarea id="message" name="message" required rows="4"></textarea></p>' +
        '<button type="submit">Send message</button></form><p role="status" id="contact-status"></p>';
    },
    '/returns': function () {
      return '<h1>Return policy</h1><p>You can return any bike or accessory within <strong>30 days</strong> of delivery for a full refund, as long as it is unused and in its original packaging.</p>' +
        '<h2>How to return an item</h2><ol><li>Email ' + DATA.contact.email + ' with your order number.</li><li>We send you a prepaid shipping label.</li><li>Refunds are issued within 5 working days of receipt.</li></ol>';
    }
  };

  var titles = { '/': 'Home', '/products': 'Products', '/contact': 'Contact', '/returns': 'Return policy' };

  function shell(inner) {
    return '<a class="skip-link" href="#main">Skip to main content</a>' +
      '<header><a href="#/"><strong>Northwind Bikes</strong></a><nav aria-label="Main"><ul>' +
      '<li><a href="#/">Home</a></li><li><a href="#/products">Products</a></li><li><a href="#/returns">Returns</a></li><li><a href="#/contact">Contact</a></li>' +
      '<li><span>Cart (<span id="cart-count" aria-live="polite">' + cart + '</span>)</span></li></ul></nav></header>' +
      '<main id="main">' + inner + '</main>' +
      '<footer><p>Northwind Bikes is a fictional company. Email hello@northwind.example or call +1 555 010 0199.</p></footer>';
  }

  function route() {
    var path = (location.hash || '#/').slice(1);
    var view = views[path] || views['/'];
    document.getElementById('app').innerHTML = shell(view());
    document.title = (titles[path] || 'Home') + ' | Northwind Bikes';
    if (path === '/') startTicker();
  }

  function startTicker() {
    var start = Date.now();
    var timer = setInterval(function () {
      var el = document.getElementById('ticker');
      if (!el || Date.now() - start > 3000) { clearInterval(timer); return; }
      el.textContent = String(10 + Math.floor((Date.now() - start) / 200));
    }, 200);
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('button[data-add]');
    if (!btn) return;
    cart += 1;
    document.getElementById('cart-count').textContent = String(cart);
    document.getElementById('cart-message').textContent = btn.dataset.add + ' added to cart.';
  });
  document.addEventListener('submit', function (e) {
    if (e.target.id !== 'contact-form') return;
    e.preventDefault();
    document.getElementById('contact-status').textContent = 'Thanks, your message has been sent.';
  });

  window.addEventListener('hashchange', route);
  setTimeout(route, 300);

  // Layout shift: a promo banner is inserted above the header 800 ms after load.
  setTimeout(function () {
    var banner = document.createElement('div');
    banner.className = 'banner';
    banner.setAttribute('role', 'region');
    banner.setAttribute('aria-label', 'Promotion');
    banner.textContent = 'Free shipping on all orders this month.';
    document.body.insertBefore(banner, document.getElementById('app'));
  }, 800);
})();
