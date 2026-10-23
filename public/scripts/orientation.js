// Remembers which orientation lessons this browser has opened and shows checkmarks.
(function () {
  // On phones, start with the lesson list collapsed so the lesson is first
  if (window.innerWidth < 900) document.querySelectorAll('.orient-nav details').forEach(function (d) { d.removeAttribute('open'); });
  var KEY = 'tt-orientation-done';
  var done = {};
  try { done = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  var cur = document.querySelector('[data-current]');
  if (cur) { done[cur.getAttribute('data-current')] = 1; try { localStorage.setItem(KEY, JSON.stringify(done)); } catch (e) {} }
  var links = document.querySelectorAll('a[data-lesson]');
  var slugs = {};
  links.forEach(function (a) { var s = a.getAttribute('data-lesson'); slugs[s] = 1; if (done[s]) a.classList.add('is-done'); });
  var total = Object.keys(slugs).length, n = Object.keys(done).filter(function (s) { return slugs[s]; }).length;
  var bar = document.querySelector('[data-orient-bar]');
  if (bar && total) bar.style.width = Math.round((n / total) * 100) + '%';
  var home = document.querySelector('.orient-home [data-orient-progress]');
  if (home && n) home.textContent = n + ' of ' + total + ' lessons viewed';
})();
