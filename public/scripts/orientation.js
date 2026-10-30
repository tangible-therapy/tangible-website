// Orientation course progress: lesson checkmarks, the on-page quizzes, and locking later lessons until each quiz is passed.
// Lessons opened are kept in this browser (localStorage tt-orientation-done) AND, when signed in with Google, saved to the
// person's account through /api/onboarding, so they follow them to any device. Quizzes passed (with the answers that
// passed) are kept in tt-orientation-quizzes and saved to the account as well; the server re-checks the answers.
// A quiz lesson only gets its checkmark once its quiz is passed with 100%. Every lesson after a quiz that hasn't been
// passed is locked (greyed out in the menus, and the lesson itself shows "Finish the quiz first"). Staff whose account
// says orientation is already complete are never locked. The lock runs in the browser; the server makes passing every
// quiz part of finishing orientation (see netlify/functions/onboarding.mts).
(function () {
  // On phones, start with the lesson list collapsed so the lesson is first
  if (window.innerWidth < 900) document.querySelectorAll('.orient-nav details').forEach(function (d) { d.removeAttribute('open'); });
  var KEY = 'tt-orientation-done', QKEY = 'tt-orientation-quizzes', XKEY = 'tt-orientation-complete';
  function get(k, d) { try { return JSON.parse(localStorage.getItem(k) || 'null') || d; } catch (e) { return d; } }
  function put(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  var done = get(KEY, {}), passed = get(QKEY, {}), exempt = !!get(XKEY, false);
  function store() { put(KEY, done); put(QKEY, passed); }

  var links = Array.prototype.slice.call(document.querySelectorAll('a[data-lesson]'));
  var slugs = {}, quizzes = {}, titles = {};
  links.forEach(function (a) {
    var s = a.getAttribute('data-lesson');
    slugs[s] = 1;
    if (a.hasAttribute('data-quiz')) quizzes[s] = +a.getAttribute('data-order');
    titles[s] = a.getAttribute('data-title') || a.textContent.trim();
  });
  var art = document.querySelector('[data-current]');
  var cur = art && art.getAttribute('data-current');
  if (cur && !(cur in quizzes)) { done[cur] = 1; store(); }

  // The first quiz (in course order) not passed yet; everything after it is locked.
  function gate() {
    if (exempt) return null;
    var g = null;
    Object.keys(quizzes).forEach(function (s) { if (!passed[s] && (g === null || quizzes[s] < quizzes[g])) g = s; });
    return g;
  }
  function isDone(s) { return s in quizzes ? !!passed[s] : !!done[s]; }

  function render() {
    var g = gate(), limit = g === null ? Infinity : quizzes[g];
    links.concat(Array.prototype.slice.call(document.querySelectorAll('a[data-goto]'))).forEach(function (a) {
      var s = a.getAttribute('data-lesson'), locked = +a.getAttribute('data-order') > limit;
      if (s) a.classList.toggle('is-done', isDone(s));
      a.classList.toggle('is-locked', locked);
      if (locked) { a.setAttribute('aria-disabled', 'true'); a.title = 'Pass the ' + titles[g] + ' first'; }
      else { a.removeAttribute('aria-disabled'); a.removeAttribute('title'); }
    });
    if (art) {
      var lockedHere = +art.getAttribute('data-order') > limit, box = art.querySelector('[data-orient-locked]');
      art.classList.toggle('is-locked', lockedHere);
      if (box) {
        box.hidden = !lockedHere;
        if (lockedHere) {
          box.querySelector('[data-locked-name]').textContent = titles[g];
          box.querySelector('[data-locked-link]').href = '/orientation/' + g;
        }
      }
    }
    var total = Object.keys(slugs).length, n = Object.keys(slugs).filter(isDone).length;
    var bar = document.querySelector('[data-orient-bar]');
    if (bar && total) bar.style.width = Math.round((n / total) * 100) + '%';
    var home = document.querySelector('.orient-home [data-orient-progress]');
    if (home && n) home.textContent = n + ' of ' + total + ' lessons done';
    document.querySelectorAll('[data-quiz-form]').forEach(showPassed);
  }
  // Locked links do nothing (the title says why).
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a.is-locked');
    if (a) e.preventDefault();
  });

  // ----- quizzes -----
  function answersOf(form) {
    var key = JSON.parse(form.getAttribute('data-key'));
    return key.map(function (_, qi) {
      return Array.prototype.slice.call(form.querySelectorAll('input[name="q' + qi + '"]:checked')).map(function (i) { return +i.value; }).sort();
    });
  }
  function nextText(slug) {
    var later = Object.keys(quizzes).filter(function (s) { return quizzes[s] > quizzes[slug]; });
    return later.length ? 'The next section is unlocked.' : 'That was the last quiz. Nice work!';
  }
  function showPassed(form) {
    var slug = form.getAttribute('data-quiz-form'), p = passed[slug];
    if (!p || form.classList.contains('is-passed')) return;
    form.classList.add('is-passed');
    if (p.answers) p.answers.forEach(function (a, qi) {
      a.forEach(function (v) { var i = form.querySelector('input[name="q' + qi + '"][value="' + v + '"]'); if (i) i.checked = true; });
    });
    form.querySelectorAll('input').forEach(function (i) { i.disabled = true; });
    form.querySelectorAll('[data-fb]').forEach(function (f) { f.hidden = true; });
    form.querySelector('.oq-actions').hidden = true;
    form.querySelector('[data-pass-text]').textContent = nextText(slug);
    form.querySelector('[data-pass]').hidden = false;
  }
  document.querySelectorAll('[data-quiz-form]').forEach(function (form) {
    var slug = form.getAttribute('data-quiz-form'), key = JSON.parse(form.getAttribute('data-key'));
    form.addEventListener('change', function (e) {
      var q = e.target.closest('.oq-q');
      if (q) { q.classList.remove('is-wrong'); q.querySelector('[data-fb]').hidden = true; }
    });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ans = answersOf(form), result = form.querySelector('[data-result]');
      var blank = ans.map(function (a, qi) { return a.length ? -1 : qi; }).filter(function (x) { return x >= 0; });
      if (blank.length) {
        result.textContent = 'Please answer every question (' + blank.map(function (x) { return x + 1; }).join(', ') + ' still need an answer).';
        form.querySelector('.oq-q[data-q="' + blank[0] + '"]').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      var wrong = [];
      ans.forEach(function (a, qi) {
        var ok = a.join() === key[qi].slice().sort().join();
        var q = form.querySelector('.oq-q[data-q="' + qi + '"]');
        q.classList.toggle('is-wrong', !ok);
        q.querySelector('[data-fb]').hidden = ok;
        if (!ok) wrong.push(qi);
      });
      if (wrong.length) {
        result.textContent = 'You got ' + (key.length - wrong.length) + ' of ' + key.length + '. Fix the ' + (wrong.length === 1 ? 'one' : wrong.length) + ' marked below and check again.';
        form.querySelector('.oq-q[data-q="' + wrong[0] + '"]').scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      }
      result.textContent = '';
      passed[slug] = { at: new Date().toISOString(), answers: ans };
      done[slug] = 1; store(); render();
      form.querySelector('[data-pass]').scrollIntoView({ behavior: 'smooth', block: 'center' });
      save([slug], [{ slug: slug, answers: ans }]);
    });
  });

  function save(lessons, quizList, skillsReview) {
    if (!lessons.length && !quizList.length && !skillsReview) return;
    fetch('/api/onboarding', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ lessons: lessons, quizzes: quizList, skillsReview: !!skillsReview }) }).catch(function () {});
  }

  render();

  // Sync with the account: pull lessons/quizzes done elsewhere, then save everything this browser knows.
  fetch('/api/onboarding', { credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r.json() : null; })
    .then(function (b) {
      if (!b) return;
      exempt = !!b.orientationComplete; put(XKEY, exempt);
      var server = {}, serverQ = b.quizzes || {};
      (b.lessons || []).forEach(function (s) { server[s] = 1; done[s] = 1; });
      Object.keys(serverQ).forEach(function (s) { if (!passed[s]) passed[s] = { at: serverQ[s] }; });
      store(); render();
      var missing = Object.keys(done).filter(function (s) { return !server[s]; });
      var missingQ = Object.keys(passed).filter(function (s) { return !serverQ[s] && passed[s].answers; }).map(function (s) { return { slug: s, answers: passed[s].answers }; });
      var review = get('spq.progress.v1', null);
      save(missing, missingQ, !!(review && review.finished) && !b.skillsReview);
    })
    .catch(function () {});
})();
