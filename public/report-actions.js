// Adds "Book a time" and "Give me a call" to the bottom of the report page.
(function () {
  var t = new URLSearchParams(location.search).get('t') || '';
  if (!/^[0-9a-f-]{36}$/i.test(t)) return;
  var wrap = document.querySelector('.wrap') || document.body;
  var css = document.createElement('style');
  css.textContent = '.j2-next{margin:24px 0;padding:20px;border:1px solid var(--line,#e3e6ea);border-radius:12px;background:var(--panel,#fff)}' +
    '.j2-next h2{margin:0 0 6px;font-size:1.15rem}.j2-next p{margin:0 0 14px;color:var(--fog,#5b6470)}' +
    '.j2-next .row{display:flex;gap:10px;flex-wrap:wrap}.j2-next a{flex:1 1 180px;text-align:center;padding:12px 16px;border-radius:8px;font-weight:600;text-decoration:none}' +
    '.j2-next .p{background:#D31322;color:#fff}.j2-next .s{border:1px solid #D31322;color:#D31322}' +
    '.j2-next .zoe{display:flex;align-items:center;gap:10px;margin-top:14px}.j2-next .zoe img{width:36px;height:36px;border-radius:50%;flex-shrink:0}'+
    '.j2-next small{display:block;color:var(--fog,#5b6470)}.j2-next h2{font-weight:900}';
  document.head.appendChild(css);
  var box = document.createElement('section');
  box.className = 'j2-next';
  var base = '/go.html?t=' + encodeURIComponent(t) + '&a=';
  box.innerHTML = '<h2>Want help with this?</h2>' +
    '<p>Our security specialists can walk you through what this means for your business in 20 minutes. No obligation.</p>' +
    '<div class="row"><a class="p" href="' + base + 'book">Book a time</a><a class="s" href="' + base + 'call">Give me a call to set a time</a></div>' +
    '<div class="zoe"><img src="/brand/zoe-128.png" alt="Zoe, J2\u2019s AI assistant"><small>Prepared by Zoe, J2\u2019s AI assistant, from publicly visible information. Real people on the J2 team run every meeting.</small></div>';
  // The report draws itself after loading, so keep re-attaching the box for a while.
  var tries = 0;
  var attach = function () {
    var w = document.querySelector('.wrap') || document.body;
    if (!document.querySelector('.j2-next') && !/Loading/.test(w.innerText.slice(0, 200))) w.appendChild(box);
    if (++tries < 40) setTimeout(attach, 500);
  };
  attach();
})();
