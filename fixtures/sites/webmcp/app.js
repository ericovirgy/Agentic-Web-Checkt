// Cart state is kept in localStorage; everything is local to this fixture.
(function () {
  'use strict';
  var KEY = 'northwind-cart';
  function read() { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return []; } }
  function write(items) { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (e) { /* ignore */ } }
  function count(items) { return items.reduce(function (n, i) { return n + i.qty; }, 0); }
  function total(items) { return items.reduce(function (n, i) { return n + i.qty * Number(i.price); }, 0); }
  function money(n) { return '$' + n.toFixed(2); }

  function renderCount() {
    var el = document.getElementById('cart-count');
    if (el) el.textContent = String(count(read()));
  }

  function renderCart() {
    var tbody = document.getElementById('cart-items');
    if (!tbody) return;
    var items = read();
    tbody.innerHTML = '';
    if (items.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4">Your cart is empty.</td></tr>';
    }
    items.forEach(function (item) {
      var tr = document.createElement('tr');
      tr.innerHTML = '<td>' + item.name + '</td><td>' + item.qty + '</td><td>' + money(item.qty * Number(item.price)) + '</td><td></td>';
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = 'Remove ' + item.name;
      btn.addEventListener('click', function () {
        write(read().filter(function (i) { return i.sku !== item.sku; }));
        renderCart(); renderCount();
      });
      tr.lastElementChild.appendChild(btn);
      tbody.appendChild(tr);
    });
    var t = money(total(items));
    document.getElementById('cart-total').textContent = t;
    var ct = document.getElementById('confirm-total');
    if (ct) ct.textContent = t;
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.add-to-cart');
    if (!btn) return;
    var items = read();
    var existing = items.find(function (i) { return i.sku === btn.dataset.sku; });
    if (existing) existing.qty += 1; else items.push({ sku: btn.dataset.sku, name: btn.dataset.name, price: btn.dataset.price, qty: 1 });
    write(items);
    renderCount();
    var msg = document.getElementById('cart-message');
    if (msg) msg.textContent = btn.dataset.name + ' added to cart.';
  });

  var checkout = document.getElementById('checkout');
  var dialog = document.getElementById('confirm-dialog');
  if (checkout && dialog) {
    checkout.addEventListener('click', function () { dialog.showModal(); });
    dialog.addEventListener('close', function () {
      if (dialog.returnValue === 'confirm') {
        write([]);
        renderCart(); renderCount();
        document.getElementById('order-status').textContent = 'Order placed. Thank you!';
      }
    });
  }

  var contact = document.getElementById('contact-form');
  if (contact) {
    contact.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('contact-status').textContent = 'Thanks, your message has been sent. We reply within one working day.';
      contact.reset();
    });
  }

  var login = document.getElementById('login-form');
  if (login) {
    login.addEventListener('submit', function (e) {
      e.preventDefault();
      document.getElementById('login-status').textContent = 'Sign-in is not available in this fixture.';
    });
  }

  renderCount();
  renderCart();
})();
