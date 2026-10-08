// Adds "Book a time" and "Give me a call" to the bottom of the report page.
(function () {
  var t = new URLSearchParams(location.search).get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(t)) return;
  var wrap = document.querySelector('.wrap') || document.body;
  var css = document.createElement('style');
  css.textContent = '.j2-next{margin:24px 0;padding:20px;border:1px solid var(--line,#e3e6ea);border-radius:12px;background:var(--panel,#fff)}' +
    '.j2-next h2{margin:0 0 6px;font-size:1.15rem}.j2-next p{margin:0 0 14px;color:var(--fog,#5b6470)}' +
    '.j2-next .row{display:flex;gap:10px;flex-wrap:wrap}.j2-next a{flex:1 1 180px;text-align:center;padding:12px 16px;border-radius:8px;font-weight:600;text-decoration:none}' +
    '.j2-next .p{background:var(--red,#d4232a);color:#fff}.j2-next .s{border:1px solid var(--red,#d4232a);color:var(--red,#d4232a)}' +
    '.j2-next small{display:block;margin-top:12px;color:var(--fog,#5b6470)}';
  document.head.appendChild(css);
  var box = document.createElement('section');
  box.className = 'j2-next';
  var base = '/go.html?t=' + encodeURIComponent(t) + '&a=';
  box.innerHTML = '<h2>Want help with this?</h2>' +
    '<p>Our security specialists can walk you through what this means for your business in 20 minutes. No obligation.</p>' +
    '<div class="row"><a class="p" href="' + base + 'book">Book a time</a><a class="s" href="' + base + 'call">Give me a call to set a time</a></div>' +
    '<small>Prepared by Zoe, J2\u2019s AI assistant, from publicly visible information. Real people on the J2 team run every meeting.</small>';
  wrap.appendChild(box);
})();
