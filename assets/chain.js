// "Try a chain": a small playable copy of the game's processor and air strike.
// Processor: 5 slots (0, 2, 3 take numbers; 1 and 4 take operators) and a 5-orb Reserve that refills empty slots
// after a strike. Start on a number, alternate number/operator, step back to undo, let go to strike; a trailing
// operator is dropped. The sum is worked left to right. Strikes grow at 20 and 82 and land on the thickest group.
(function () {
  "use strict";

  var arena = document.getElementById("arena");
  if (!arena) return;

  var proc = arena.querySelector(".proc");
  var svg = proc.querySelector("svg");
  var slotEls = proc.querySelectorAll(".slot");
  var reserveEl = arena.querySelector(".reserve-orbs");
  var eqEl = arena.querySelector(".eq");
  var fireBtn = arena.querySelector(".fire");
  var foeLayer = arena.querySelector(".foes");
  var fxLayer = arena.querySelector(".fx");
  var hero = arena.querySelector(".oreivax");
  var crystalsEl = arena.querySelector(".crystals b");
  var announce = document.getElementById("announce");
  var NS = "http://www.w3.org/2000/svg";

  // ---------- Rules ----------

  var SLOT_KIND = ["n", "o", "n", "n", "o"];
  var RESERVE_CAP = 5;
  var OP_NAMES = { "+": "plus", "×": "times" };
  var TIERS = [1, 20, 82];

  function num(v) { return { kind: "n", v: v }; }
  function op(s) { return { kind: "o", v: s }; }

  function evaluate(orbs) {
    var t = orbs[0].v;
    for (var i = 1; i < orbs.length - 1; i += 2) {
      t = orbs[i].v === "+" ? t + orbs[i + 1].v : t * orbs[i + 1].v;
    }
    return t;
  }

  function isValid(orbs) {
    if (orbs.length < 3 || orbs.length % 2 === 0) return false;
    for (var i = 0; i < orbs.length; i++) if (orbs[i].kind !== (i % 2 ? "o" : "n")) return false;
    return true;
  }

  function tierOf(r) {
    var t = 1;
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i]) t = i + 1;
    return t;
  }

  // ---------- Processor state ----------

  var slots = [num(3), op("×"), num(4), num(5), op("+")];
  var reserve = [num(6), op("+"), num(2), op("×"), num(8)];
  var chain = [];
  var dragging = false;
  var pending = null;   // pointer down, not yet a drag
  var live = null;      // the line that follows the finger, in processor %

  function randomOrb(kind) {
    if (kind === "o") return op(Math.random() < 0.5 ? "+" : "×");
    return num(1 + Math.floor(Math.random() * 9));
  }

  function freeSlot(kind) {
    for (var i = 0; i < 5; i++) if (!slots[i] && SLOT_KIND[i] === kind) return i;
    return -1;
  }

  var arrived = {};

  function pickUp() {
    var needN = freeSlot("n") !== -1, needO = freeSlot("o") !== -1;
    var kind;
    if (needN && needO) kind = Math.random() < 0.6 ? "n" : "o";
    else if (needN) kind = "n";
    else if (needO) kind = "o";
    else if (reserve.length < RESERVE_CAP) {
      // Keep the reserve useful: lean towards the kind it has least of
      var n = reserve.filter(function (o) { return o.kind === "n"; }).length;
      kind = n < reserve.length - n + 1 ? "n" : "o";
    } else return;
    var orb = randomOrb(kind);
    var at = freeSlot(kind);
    if (at !== -1) { slots[at] = orb; arrived["s" + at] = true; }
    else { reserve.push(orb); arrived["r" + (reserve.length - 1)] = true; }
    render();
  }

  function refillFromReserve() {
    for (var i = 0; i < 5; i++) {
      if (slots[i]) continue;
      for (var j = 0; j < reserve.length; j++) {
        if (reserve[j].kind === SLOT_KIND[i]) {
          slots[i] = reserve.splice(j, 1)[0];
          arrived["s" + i] = true;
          break;
        }
      }
    }
  }

  function chainOrbs() { return chain.map(function (i) { return slots[i]; }); }

  function canAppend(i) {
    var o = slots[i];
    if (!o || chain.indexOf(i) >= 0) return false;
    return o.kind === (chain.length % 2 === 0 ? "n" : "o");
  }

  function dragOver(i) {
    if (chain.length >= 2 && chain[chain.length - 2] === i) { chain.pop(); render(); return; }
    if (canAppend(i)) { chain.push(i); render(); }
  }

  function tap(i) {
    var o = slots[i];
    if (!o) return;
    if (chain[chain.length - 1] === i) chain.pop();
    else if (canAppend(i)) chain.push(i);
    else if (o.kind === "n" && chain.indexOf(i) < 0) chain = [i];
    render();
  }

  function cast() {
    if (chain.length >= 4 && slots[chain[chain.length - 1]].kind === "o") chain.pop();
    var orbs = chainOrbs();
    var used = chain.slice();
    chain = [];
    live = null;
    if (!isValid(orbs)) { render(); return; }
    var result = evaluate(orbs);
    used.forEach(function (i) { slots[i] = null; });
    refillFromReserve();
    render();
    strike(result);
    say(result + " damage.");
  }

  function say(text) {
    if (!announce) return;
    announce.textContent = "";
    setTimeout(function () { announce.textContent = text; }, 30);
  }

  // ---------- Processor view ----------

  var ANGLES = [-90, -18, 54, 126, 198];
  var CENTERS = ANGLES.map(function (a) {
    var r = a * Math.PI / 180;
    return { x: 50 + 36 * Math.cos(r), y: 53 + 36 * Math.sin(r) };
  });

  var ringPath = document.createElementNS(NS, "polygon");
  ringPath.setAttribute("class", "track");
  ringPath.setAttribute("points", CENTERS.map(function (c) { return c.x + "," + c.y; }).join(" "));
  var links = document.createElementNS(NS, "polyline");
  links.setAttribute("class", "links");
  var liveLine = document.createElementNS(NS, "line");
  liveLine.setAttribute("class", "links live");
  svg.appendChild(ringPath);
  svg.appendChild(links);
  svg.appendChild(liveLine);

  slotEls.forEach(function (el, i) {
    el.style.left = CENTERS[i].x + "%";
    el.style.top = CENTERS[i].y + "%";
  });

  function orbLabel(o) {
    return o.kind === "o" ? OP_NAMES[o.v] : String(o.v);
  }

  function paintOrb(el, o, extra) {
    el.className = extra + " " + (!o ? "empty" : o.kind === "n" ? "number" : "operator");
    el.textContent = o ? o.v : "";
  }

  function render() {
    var orbs = chainOrbs();
    var valid = isValid(orbs);

    slotEls.forEach(function (el, i) {
      var o = slots[i];
      var sel = chain.indexOf(i) >= 0;
      paintOrb(el, o, "slot " + (SLOT_KIND[i] === "n" ? "kind-n" : "kind-o") + (sel ? " sel" : ""));
      if (arrived["s" + i]) el.classList.add("arrive");
      el.setAttribute("aria-label", o ? orbLabel(o) : "empty " + (SLOT_KIND[i] === "n" ? "number" : "operator") + " slot");
      el.setAttribute("aria-pressed", sel ? "true" : "false");
      el.disabled = !o;
    });

    reserveEl.innerHTML = "";
    for (var r = 0; r < RESERVE_CAP; r++) {
      var span = document.createElement("span");
      paintOrb(span, reserve[r] || null, "r");
      if (arrived["r" + r]) span.classList.add("arrive");
      reserveEl.appendChild(span);
    }
    reserveEl.setAttribute("aria-label", "Reserve: " + (reserve.length ? reserve.map(orbLabel).join(", ") : "empty"));
    arrived = {};

    links.setAttribute("points", chain.map(function (i) { return CENTERS[i].x + "," + CENTERS[i].y; }).join(" "));
    if (live && chain.length) {
      var last = CENTERS[chain[chain.length - 1]];
      liveLine.setAttribute("x1", last.x); liveLine.setAttribute("y1", last.y);
      liveLine.setAttribute("x2", live.x); liveLine.setAttribute("y2", live.y);
      liveLine.style.display = "";
    } else liveLine.style.display = "none";

    // Readout: "3 × 4 + 5 = 17"
    if (orbs.length) {
      var text = orbs.map(function (o) { return o.v; }).join(" ");
      if (valid) text += " = " + evaluate(orbs);
      eqEl.textContent = text;
    } else eqEl.textContent = "";

    fireBtn.hidden = dragging || chain.length === 0;
    fireBtn.disabled = !valid;
  }

  // ---------- Processor input: drag like the game, or tap orbs one by one ----------

  function toProc(e) {
    var r = proc.getBoundingClientRect();
    return { x: (e.clientX - r.left) / r.width * 100, y: (e.clientY - r.top) / r.height * 100 };
  }

  function slotAt(p) {
    for (var i = 0; i < 5; i++) {
      var dx = p.x - CENTERS[i].x, dy = p.y - CENTERS[i].y;
      if (dx * dx + dy * dy < 15 * 15) return i;
    }
    return -1;
  }

  proc.addEventListener("pointerdown", function (e) {
    if (e.button > 0 || pending || dragging) return;
    var i = slotAt(toProc(e));
    if (i < 0 || !slots[i]) return;
    e.preventDefault();
    pending = { id: e.pointerId, i: i, x: e.clientX, y: e.clientY };
    try { proc.setPointerCapture(e.pointerId); } catch (err) { /* older browsers */ }
  });

  proc.addEventListener("pointermove", function (e) {
    if (!pending || e.pointerId !== pending.id) return;
    var p = toProc(e);
    if (!dragging) {
      var moved = Math.abs(e.clientX - pending.x) + Math.abs(e.clientY - pending.y) > 8;
      var other = slotAt(p);
      if (!moved && (other === pending.i || other < 0)) return;
      if (slots[pending.i].kind !== "n") return;   // a drag starts on a number
      dragging = true;
      chain = [pending.i];
    }
    var i = slotAt(p);
    if (i >= 0) dragOver(i);
    live = p;
    render();
  });

  function endPointer(e, cancelled) {
    if (!pending || e.pointerId !== pending.id) return;
    var start = pending.i;
    pending = null;
    if (dragging) {
      dragging = false;
      if (cancelled) { chain = []; live = null; render(); }
      else cast();
    } else if (!cancelled) tap(start);
  }

  proc.addEventListener("pointerup", function (e) { endPointer(e, false); });
  proc.addEventListener("pointercancel", function (e) { endPointer(e, true); });

  // Keyboard and switch access: Enter or Space on a slot adds it to the chain, like a tap
  proc.addEventListener("click", function (e) {
    if (e.detail !== 0) return;
    var el = e.target.closest(".slot");
    if (el) tap(Number(el.dataset.i));
  });

  fireBtn.addEventListener("click", function () { if (!dragging) cast(); });

  // ---------- The arena ----------

  var W = 0, H = 0, E = 40;
  var foes = [];
  var crystals = 0;
  var running = false;
  var lastT = 0;
  var spawnClock = 0, pickClock = 0;
  var portrait = false;

  function player() {
    return portrait ? { x: W * 0.5, y: H * 0.3 } : { x: W * 0.36, y: H * 0.5 };
  }

  function foeTarget() { return portrait ? 7 : 11; }

  function inProcessorCorner(x, y) {
    var pr = proc.getBoundingClientRect(), ar = arena.getBoundingClientRect();
    return x > pr.left - ar.left - E && y > pr.top - ar.top - E * 2.5;
  }

  function near(a, b, d) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < d * d; }

  function spawnFoe(anywhere) {
    var x, y, tries = 0;
    do {
      if (anywhere) { x = W * (0.05 + Math.random() * 0.6); y = H * (0.08 + Math.random() * 0.84); }
      else {
        var side = Math.floor(Math.random() * 3);   // left, top, bottom: the processor sits on the right
        if (side === 0) { x = -E; y = Math.random() * H; }
        else if (side === 1) { x = Math.random() * W * 0.7; y = -E; }
        else { x = Math.random() * W * 0.55; y = H + E; }
      }
      tries++;
    } while (tries < 12 && (inProcessorCorner(x, y) || near(player(), { x: x, y: y }, E * 2.2)));
    var el = document.createElement("div");
    el.className = "foe";
    el.style.animationDelay = (-Math.random()).toFixed(2) + "s";
    foeLayer.appendChild(el);
    var f = { x: x, y: y, hp: 14, el: el, dead: false, orbit: (Math.random() - 0.5) * 2 };
    foes.push(f);
    place(f);
    return f;
  }

  function place(f) {
    f.el.style.transform = "translate(" + f.x.toFixed(1) + "px," + f.y.toFixed(1) + "px)";
    f.el.style.zIndex = String(Math.round(f.y));
  }

  function resize() {
    var r = arena.getBoundingClientRect();
    if (!r.width) return;
    if (W) {
      var sx = r.width / W, sy = r.height / H;
      foes.forEach(function (f) { f.x *= sx; f.y *= sy; place(f); });
    }
    W = r.width; H = r.height;
    portrait = H > W;
    E = Math.max(26, Math.min(56, Math.min(W, H * 2.17) * 0.05));
    arena.style.setProperty("--e", E.toFixed(1) + "px");
    var p = player();
    hero.style.transform = "translate(" + p.x.toFixed(1) + "px," + p.y.toFixed(1) + "px)";
    hero.style.zIndex = String(Math.round(p.y));
  }

  function step(t) {
    if (!running) return;
    var dt = Math.min((t - lastT) / 1000, 0.05);
    lastT = t;
    var p = player();
    var speed = Math.min(W, H * 2.17) * 0.028;
    var stop = E * 1.3;

    spawnClock += dt;
    var alive = foes.filter(function (f) { return !f.dead; }).length;
    if (alive < foeTarget() && spawnClock > 0.55) { spawnClock = 0; spawnFoe(false); }

    pickClock += dt;
    if (pickClock > 1.5) { pickClock = 0; pickUp(); }

    foes.forEach(function (f) {
      if (f.dead) return;
      var vx = p.x - f.x, vy = p.y - f.y, dist = Math.hypot(vx, vy) || 1;
      if (dist > stop) {
        f.x += (vx / dist + (-vy / dist) * f.orbit * 0.35) * speed * dt;
        f.y += (vy / dist + (vx / dist) * f.orbit * 0.35) * speed * dt;
      } else {
        // Circle Oreivax instead of piling onto him
        f.x += (-vy / dist) * f.orbit * speed * 0.4 * dt;
        f.y += (vx / dist) * f.orbit * speed * 0.4 * dt;
      }
      place(f);
    });

    // Keep foes from stacking into one sprite
    for (var i = 0; i < foes.length; i++) {
      for (var j = i + 1; j < foes.length; j++) {
        var a = foes[i], b = foes[j];
        if (a.dead || b.dead) continue;
        var ddx = b.x - a.x, ddy = b.y - a.y, dd = Math.hypot(ddx, ddy), min = E * 0.7;
        if (dd > 0 && dd < min) {
          var push = (min - dd) / 2;
          a.x -= ddx / dd * push; a.y -= ddy / dd * push;
          b.x += ddx / dd * push; b.y += ddy / dd * push;
        }
      }
    }
    foes = foes.filter(function (f) { return !f.dead; });
    requestAnimationFrame(step);
  }

  function start() {
    if (running) return;
    running = true;
    lastT = performance.now();
    requestAnimationFrame(step);
  }
  function stop() { running = false; }

  // ---------- Damage ----------

  function pop(x, y, text) {
    var el = document.createElement("div");
    el.className = "pop";
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function hurt(f, d) {
    if (f.dead) return;
    f.hp -= d;
    pop(f.x + (Math.random() - 0.5) * E * 0.6, f.y - E * 0.45 + (Math.random() - 0.5) * E * 0.4, String(d));
    if (f.hp <= 0) kill(f);
    else {
      f.el.classList.remove("hit");
      void f.el.offsetWidth;
      f.el.classList.add("hit");
    }
  }

  function kill(f) {
    f.dead = true;
    f.el.classList.add("dead");
    setTimeout(function () { f.el.remove(); }, 400);
    crystals += 1 + Math.floor(Math.random() * 3);
    crystalsEl.textContent = crystals;
  }

  function foesNear(c, r) {
    return foes.filter(function (f) { return !f.dead && near(f, c, r); });
  }

  function ring(x, y, r, big) {
    var el = document.createElement("div");
    el.className = "ring-fx" + (big ? " big" : "");
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = el.style.height = (r * 2) + "px";
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function beam(x, y, r) {
    var bw = Math.max(r * 1.25, E * 2);
    var el = document.createElement("div");
    el.className = "beam";
    el.style.setProperty("--bw", bw.toFixed(1) + "px");
    el.style.left = (x - bw / 2) + "px";
    el.style.top = (y - bw * 2 * 0.8) + "px";
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function strikeRadius(tier) {
    return Math.min(W, H * 2.17) * [0.085, 0.12, 0.16][tier - 1];
  }

  // AirStrike: the spot that covers the most enemies, else in front of Oreivax
  function pickTarget(r) {
    var best = null, bestN = 0;
    foes.forEach(function (f) {
      if (f.dead) return;
      var group = foesNear(f, r);
      if (group.length > bestN) {
        bestN = group.length;
        var cx = 0, cy = 0;
        group.forEach(function (g) { cx += g.x; cy += g.y; });
        best = { x: cx / group.length, y: cy / group.length };
      }
    });
    if (best) return best;
    var p = player();
    return { x: p.x + E * 2.5, y: p.y };
  }

  function strike(result) {
    var dmg = Math.max(result, 1);
    var tier = tierOf(dmg);
    var r = strikeRadius(tier);
    var at = pickTarget(r);
    beam(at.x, at.y, r);
    setTimeout(function () {
      ring(at.x, at.y, r, tier === 3);
      foesNear(at, r).forEach(function (f) { hurt(f, dmg); });
    }, 230);
  }

  // ---------- Start ----------

  render();
  resize();
  for (var s = 0; s < foeTarget(); s++) spawnFoe(true);

  if (window.ResizeObserver) new ResizeObserver(resize).observe(arena);
  else window.addEventListener("resize", resize);

  var onScreen = true;
  if (window.IntersectionObserver) {
    new IntersectionObserver(function (entries) {
      onScreen = entries[0].isIntersecting;
      if (onScreen && !document.hidden) start(); else stop();
    }).observe(arena);
  }
  document.addEventListener("visibilitychange", function () {
    if (document.hidden) stop(); else if (onScreen) start();
  });
  start();
})();
