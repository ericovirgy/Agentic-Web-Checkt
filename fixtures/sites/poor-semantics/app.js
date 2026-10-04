// Fixture: intentionally non-semantic behaviour. No network requests.
function addToCart(name) {
  var c = document.getElementById('cartCount');
  c.textContent = String(Number(c.textContent) + 1);
  var m = document.getElementById('msg');
  if (m) m.textContent = name + ' added';
}
function sendForm() {
  var m = document.getElementById('msg');
  if (m) m.textContent = 'Thanks, we got your message.';
}
function drawContact() {
  var canvas = document.getElementById('contactCanvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  ctx.fillStyle = '#f3f4f6';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#222';
  ctx.font = '16px Arial';
  ctx.fillText('Email: hello@northwind.example', 16, 32);
  ctx.fillText('Phone: +1 555 010 0199', 16, 60);
  ctx.fillText('12 Harbour Lane, Portsmouth NW1 2AB', 16, 88);
}
document.addEventListener('DOMContentLoaded', drawContact);
