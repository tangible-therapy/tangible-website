// Small progressive-enhancement script: menus, carousels, Netlify form submit.
(function () {
  // Mobile menu
  var menu = document.getElementById('mobile-menu');
  document.querySelectorAll('.menu-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var open = !menu.classList.contains('open');
      menu.classList.toggle('open', open);
      document.body.style.overflow = open ? 'hidden' : '';
      document.querySelectorAll('.menu-toggle:not(.close)').forEach(function (b) { b.setAttribute('aria-expanded', String(open)); });
    });
  });

  // Desktop dropdowns: click/keyboard support (hover handled in CSS)
  document.querySelectorAll('.nav .folder').forEach(function (btn) {
    btn.addEventListener('click', function (e) {
      var item = btn.parentElement;
      var open = !item.classList.contains('open');
      document.querySelectorAll('.nav .item.open').forEach(function (i) { i.classList.remove('open'); });
      item.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      e.stopPropagation();
    });
  });
  document.addEventListener('click', function () {
    document.querySelectorAll('.nav .item.open').forEach(function (i) { i.classList.remove('open'); });
  });

  // Carousels (list sections + summary blocks)
  function wire(track, prev, next) {
    if (!track) return;
    var step = function () { var li = track.querySelector('li'); return li ? li.getBoundingClientRect().width + 24 : track.clientWidth; };
    prev && prev.addEventListener('click', function () { track.scrollBy({ left: -step(), behavior: 'smooth' }); });
    next && next.addEventListener('click', function () { track.scrollBy({ left: step(), behavior: 'smooth' }); });
  }
  document.querySelectorAll('.summary.carousel').forEach(function (s) {
    wire(s.querySelector('.summary-track'), s.querySelector('.prev'), s.querySelector('.next'));
  });
  document.querySelectorAll('.ulist-carousel').forEach(function (ul) {
    var nav = ul.nextElementSibling;
    if (nav && nav.classList.contains('carousel-nav')) wire(ul, nav.querySelector('.prev'), nav.querySelector('.next'));
  });

  // Scaled ("fit to width") headline text, like Squarespace's scaled text
  function fit() {
    document.querySelectorAll('.scaled').forEach(function (box) {
      var inner = box.querySelector('.scaled-in') || box.firstElementChild;
      if (!inner) return;
      var block = box.closest('.b') || box.parentElement;
      inner.style.setProperty('--fit', '100px');
      var w = inner.getBoundingClientRect().width;
      var target = block.getBoundingClientRect().width;
      if (w > 0) inner.style.setProperty('--fit', Math.min(100 * target / w, 400) * 0.98 + 'px');
    });
  }
  fit();
  window.addEventListener('resize', fit);
  document.fonts && document.fonts.ready.then(fit);

  // Netlify forms: submit in place and show the thank-you message
  document.querySelectorAll('form[data-ajax]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type=submit]');
      btn && (btn.disabled = true);
      var data = new FormData(form);
      var isFile = form.enctype === 'multipart/form-data';
      fetch('/', {
        method: 'POST',
        headers: isFile ? undefined : { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: isFile ? data : new URLSearchParams(data).toString(),
      }).then(function (r) {
        if (!r.ok) throw new Error(r.status);
        Array.prototype.forEach.call(form.children, function (c) { if (!c.classList.contains('form-success')) c.hidden = true; });
        var ok = form.querySelector('.form-success'); ok.hidden = false;
        if (window.gtag) gtag('event', 'generate_lead', { form_name: form.getAttribute('name') });
      }).catch(function () {
        btn && (btn.disabled = false);
        var err = form.querySelector('.form-error');
        if (!err) { err = document.createElement('p'); err.className = 'form-error'; form.appendChild(err); }
        err.textContent = 'Sorry, something went wrong. Please call us at 435-260-5406 or email frontdesk@tangiblementalhealth.com.';
      });
    });
  });
})();

// Staff pages: hide menu items and links that aren't part of the signed-in person's role (data-roles="director frontdesk").
// Pages are protected on the server; this only keeps menus tidy. With the old shared password (/api/me unavailable) nothing is hidden.
(function () {
  if (!document.querySelector('.site-header.staff') && !document.querySelector('[data-roles]')) return;
  fetch('/api/me', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (me) {
      if (!me) return;
      window.tangibleStaff = me;
      document.dispatchEvent(new CustomEvent('tangible:staff', { detail: me }));
      if (me.owner) return;
      document.querySelectorAll('[data-roles]').forEach(function (el) {
        var need = el.getAttribute('data-roles').split(/\s+/);
        if (!need.some(function (x) { return me.roles.indexOf(x) >= 0; })) el.remove();
      });
      // Remove menus / cards left empty
      document.querySelectorAll('.nav .item, .mobile-menu details, [data-role-group]').forEach(function (g) {
        if (g.querySelector('.dropdown, a, .staff-btn') === null || (g.matches('.nav .item') && g.querySelector('.dropdown') && !g.querySelector('.dropdown a'))) g.remove();
        else if (g.matches('[data-role-group]') && !g.querySelector('a')) g.remove();
      });
    })
    .catch(function () {});
})();
