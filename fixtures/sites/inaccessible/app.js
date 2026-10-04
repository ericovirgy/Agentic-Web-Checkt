// Fixture: custom widgets built from divs. No network requests.
document.addEventListener('DOMContentLoaded', function () {
  document.querySelectorAll('.listbox div').forEach(function (opt) {
    opt.addEventListener('click', function () {
      opt.parentElement.querySelectorAll('div').forEach(function (o) { o.classList.remove('selected'); });
      opt.classList.add('selected');
      var out = document.getElementById('listbox-value');
      if (out) out.textContent = 'Selected: ' + opt.textContent;
    });
  });
  document.querySelectorAll('.datepicker .day').forEach(function (d) {
    d.addEventListener('click', function () {
      var out = document.getElementById('date-value');
      if (out) out.textContent = 'Chosen day: ' + d.textContent;
    });
  });
  var thumb = document.querySelector('.slider .thumb');
  if (thumb) {
    thumb.addEventListener('mousedown', function () { thumb.style.left = '60%'; });
  }
  var save = document.getElementById('save-btn');
  if (save) save.addEventListener('click', function () { document.getElementById('status').textContent = 'Saved.'; });
});
function openCart() { document.getElementById('status').textContent = 'Cart opened.'; }
