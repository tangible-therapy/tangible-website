// Remembers which orientation lessons have been opened and shows checkmarks.
// Progress is kept in this browser (localStorage tt-orientation-done) AND, when signed in with Google, saved to
// the person's account through /api/onboarding, so it follows them to any device. Lessons opened on another
// device show as done here too. With the shared staff password (no account) it works per browser as before.
(function () {
  // On phones, start with the lesson list collapsed so the lesson is first
  if (window.innerWidth < 900) document.querySelectorAll('.orient-nav details').forEach(function (d) { d.removeAttribute('open'); });
  var KEY = 'tt-orientation-done';
  var done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  function store() { try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {} }
  var cur = document.querySelector('[data-current]');
  if (cur) { done[cur.getAttribute('data-current')] = 1; store(); }
  var links = document.querySelectorAll('a[data-lesson]');
  var slugs = {};
  links.forEach(function (a) { slugs[a.getAttribute('data-lesson')] = 1; });

  function render() {
    links.forEach(function (a) { a.classList.toggle('is-done', !!done[a.getAttribute('data-lesson')]); });
    var total = Object.keys(slugs).length, n = Object.keys(done).filter(function (s) { return slugs[s]; }).length;
    var bar = document.querySelector('[data-orient-bar]');
    if (bar && total) bar.style.width = Math.round((n / total) * 100) + '%';
    var home = document.querySelector('.orient-home [data-orient-progress]');
    if (home && n) home.textContent = n + ' of ' + total + ' lessons viewed';
  }
  render();

  // Sync with the account: pull lessons opened elsewhere, then save everything this browser knows.
  fetch('/api/onboarding', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (b) {
      if (!b) return;
      var server = {};
      (b.lessons || []).forEach(function (s) { server[s] = 1; done[s] = 1; });
      store(); render();
      var missing = Object.keys(done).filter(function (s) { return !server[s]; });
      var review = null;
      try { review = JSON.parse(localStorage.getItem('spq.progress.v1') || 'null'); } catch (e) {}
      var passed = !!(review && review.finished) && !b.skillsReview;
      if (!missing.length && !passed) return;
      fetch('/api/onboarding', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessons: missing, skillsReview: passed }) }).catch(function () {});
    })
    .catch(function () {});
})();
