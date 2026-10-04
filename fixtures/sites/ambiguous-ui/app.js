// Fixture: misleading UI behaviours. No network requests.
function say(msg) { document.getElementById('status').textContent = msg; }
function submitSearch() { say('Searched.'); }
function submitNewsletter() { say('Subscribed to newsletter.'); }
function submitDelete() { say('Account deleted'); }
document.addEventListener('DOMContentLoaded', function () {
  var del = document.getElementById('delete-account');
  if (del) del.addEventListener('click', function () { say('Account deleted'); });
  var fake = document.getElementById('fake-disabled');
  if (fake) fake.addEventListener('click', function () { say('Fake disabled button was clicked.'); });
  var buy = document.getElementById('buy-form');
  if (buy) buy.addEventListener('submit', function (e) { e.preventDefault(); say('Order placed immediately.'); });
});
