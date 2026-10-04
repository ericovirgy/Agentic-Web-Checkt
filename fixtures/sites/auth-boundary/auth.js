// Fixture-only session handling. Nothing leaves the browser.
(function () {
  'use strict';
  function loggedIn() { try { return localStorage.getItem('loggedIn') === '1'; } catch (e) { return false; } }
  var gate = document.body.getAttribute('data-requires-login');
  if (gate === 'redirect' && !loggedIn()) {
    location.replace('login.html?next=' + encodeURIComponent(location.pathname.split('/').pop()));
    return;
  }
  var form = document.getElementById('login-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      try { localStorage.setItem('loggedIn', '1'); } catch (err) { /* ignore */ }
      var next = new URLSearchParams(location.search).get('next') || 'account.html';
      location.href = next;
    });
  }
  var out = document.getElementById('sign-out');
  if (out) out.addEventListener('click', function () {
    try { localStorage.removeItem('loggedIn'); } catch (e) { /* ignore */ }
    location.href = 'index.html';
  });
})();
