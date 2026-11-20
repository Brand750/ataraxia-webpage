// "Try a chain": a small playable copy of the game's processor and air strike.
// Rules follow the game: Processor (5 typed slots: 0, 2, 3 numbers, 1 and 4 operators; a 5-orb Reserve that refills
// matching slots after a cast), ProcessorView (start on a number, alternate number/operator, step back to undo,
// release to cast; a trailing operator is dropped), OperationEvaluator (left to right, rounded down), AirStrike
// (tiers at 1, 20 and 82; lands where it covers the most enemies) and the orb elements (Heat, Wind, Electric; an
// elemental number is 1 to 5; 1 elemental number = a single effect, 2 or 3 = a mix, plain numbers are skipped).
(function () {
  "use strict";

  var arena = document.getElementById("arena");
  if (!arena) return;

  var proc = arena.querySelector(".proc");
  var svg = proc.querySelector("svg");
  var slotEls = proc.querySelectorAll(".slot");
  var reserveEl = arena.querySelector(".reserve-orbs");
  var eqEl = arena.querySelector(".eq");
  var mixEl = arena.querySelector(".mix");
  var fireBtn = arena.querySelector(".fire");
  var foeLayer = arena.querySelector(".foes");
  var fxLayer = arena.querySelector(".fx");
  var fxSvg = arena.querySelector(".fx-svg");
  var hero = arena.querySelector(".oreivax");
  var crystalsEl = arena.querySelector(".crystals b");
  var announce = document.getElementById("announce");
  var NS = "http://www.w3.org/2000/svg";

  // ---------- Rules ----------

  var SLOT_KIND = ["n", "o", "n", "n", "o"];
  var RESERVE_CAP = 5;
  var ELEMENTS = {
    A: { name: "Heat", color: "#ff7a1a", cls: "heat" },
    B: { name: "Wind", color: "#7fe3c4", cls: "wind" },
    C: { name: "Electric", color: "#ffe14d", cls: "electric" }
  };
  var OP_NAMES = { "+": "plus", "×": "times" };
  var TIERS = [1, 20, 82];

  // The game's mix table (EffectDefaults v8), trimmed to what the demo can show
  var MIXES = {
    A: { name: "Ember", blurb: "small burn", burn: 15, burnS: 2.5 },
    B: { name: "Breeze", blurb: "small slow", slow: 25, slowS: 1.5 },
    C: { name: "Static", blurb: "short stun", stun: 0.6 },
    AA: { name: "Scorch", blurb: "burn", burn: 30, burnS: 3 },
    BB: { name: "Gust", blurb: "pull, slow", well: 0.4, wellR: 1, slow: 35, slowS: 1.75 },
    CC: { name: "Jolt", blurb: "stun", stun: 1.4 },
    AAA: { name: "Meltdown", blurb: "huge long burn, burning foes explode", ult: true, burn: 120, burnS: 4, burst: 20, blast: 20, blastR: 1.3 },
    BBB: { name: "Cyclone", blurb: "giant pull, a crushing blast", ult: true, well: 1.2, wellR: 2.6, slow: 85, slowS: 5, blast: 20, blastR: 1.2 },
    CCC: { name: "Overload", blurb: "long stun, big chain", ult: true, stun: 3.5, jumps: 10, range: 1.8, chainPct: 8, chainStun: 2, blast: 20, blastR: 1.3, blastStun: 2 },
    AB: { name: "Fire whirl", blurb: "pull into fire", zone: 1.5, zoneR: 1, zoneBurn: 22 },
    AAB: { name: "Furnace", blurb: "pull into long fire", zone: 3.5, zoneR: 1, zoneBurn: 42 },
    ABB: { name: "Firestorm", blurb: "wide, long pull into fire", zone: 3, zoneR: 1.5, zoneBurn: 22 },
    AC: { name: "Ignite", blurb: "chain, burn", burn: 18, burnS: 3, jumps: 2, chainPct: 5, chainStun: 0.9 },
    AAC: { name: "Arc fire", blurb: "chain, hot burn", burn: 35, burnS: 3, jumps: 3, chainPct: 5, chainStun: 0.9 },
    ACC: { name: "Short circuit", blurb: "long chain, long stun, burn", burn: 18, burnS: 3, stun: 1.6, jumps: 4, chainPct: 5, chainStun: 1.6 },
    BC: { name: "Storm trap", blurb: "pull, then stun", well: 1, wellR: 1, stun: 1.4 },
    BBC: { name: "Gale trap", blurb: "wide pull, then stun", well: 1, wellR: 1.5, stun: 1.4 },
    BCC: { name: "Lockdown", blurb: "pull, long stun, chain", well: 1, wellR: 1, stun: 2, jumps: 3, chainPct: 5, chainStun: 1.4 },
    ABC: { name: "Supernova", blurb: "pull, strike, second blast", well: 1, wellR: 1.2, blast: 10, blastR: 1, blastStun: 1.4, blastBurn: 18 }
  };

  function num(v, el) { return { kind: "n", v: v, el: el || null }; }
  function op(s) { return { kind: "o", v: s, el: null }; }

  function apply(a, o, b) {
    return o === "+" ? a + b : a * b;
  }

  function evaluate(orbs) {
    var t = orbs[0].v;
    for (var i = 1; i < orbs.length - 1; i += 2) t = apply(t, orbs[i].v, orbs[i + 1].v);
    return Math.floor(t);
  }

  function isValid(orbs) {
    if (orbs.length < 3 || orbs.length % 2 === 0) return false;
    for (var i = 0; i < orbs.length; i++) if (orbs[i].kind !== (i % 2 ? "o" : "n")) return false;
    return true;
  }

  function mixKey(orbs) {
    var codes = [];
    orbs.forEach(function (o) { if (o.kind === "n" && o.el) codes.push(o.el); });
    if (codes.length === 0 || codes.length > 3) return "";
    return codes.sort().join("");
  }

  function hitDamage(r, pct) { return Math.max(Math.round(r * pct / 100), 1); }

  function tierOf(r) {
    var t = 1;
    for (var i = 0; i < TIERS.length; i++) if (r >= TIERS[i]) t = i + 1;
    return t;
  }

  function mixColors(key) {
    var seen = [];
    key.split("").forEach(function (c) { if (seen.indexOf(c) < 0) seen.push(c); });
    return seen.map(function (c) { return ELEMENTS[c].color; });
  }

  function leadColor(key) {
    if (!key) return "#73bed3";
    var best = key[0], n = 0;
    "ABC".split("").forEach(function (c) {
      var k = key.split(c).length - 1;
      if (k > n) { n = k; best = c; }
    });
    return ELEMENTS[best].color;
  }

  // ---------- Processor state ----------

  // Opens on a Meltdown in waiting: three Heat numbers
  var slots = [num(3, "A"), op("×"), num(4, "A"), num(5, "A"), op("+")];
  var reserve = [num(6), op("+"), num(2, "B"), op("×"), num(8)];
  var chain = [];
  var dragging = false;
  var pending = null;   // pointer down, not yet a drag
  var live = null;      // the line that follows the finger, in processor %

  function randomOrb(kind) {
    if (kind === "o") {
      var r = Math.random();
      return op(r < 0.5 ? "+" : "×");
    }
    var v = 1 + Math.floor(Math.random() * 9);
    if (Math.random() < 0.38) {
      var el = "ABC"[Math.floor(Math.random() * 3)];
      if (v > 5) v = 1 + Math.floor(Math.random() * 5);   // ElementRules.ElementalNumber: elements trade away big numbers
      return num(v, el);
    }
    return num(v);
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
    var key = mixKey(orbs);
    used.forEach(function (i) { slots[i] = null; });
    refillFromReserve();
    render();
    strike(result, key);
    var mix = MIXES[key];
    say((result < 1 ? "A weak strike" : result + " damage") + (mix ? ", " + mix.name + ": " + mix.blurb : "") + ".");
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
  var ringShadow = ringPath.cloneNode();
  ringShadow.setAttribute("class", "track-shadow");
  var links = document.createElementNS(NS, "polyline");
  links.setAttribute("class", "links");
  var liveLine = document.createElementNS(NS, "line");
  liveLine.setAttribute("class", "links live");
  svg.appendChild(ringShadow);
  svg.appendChild(ringPath);
  svg.appendChild(links);
  svg.appendChild(liveLine);

  slotEls.forEach(function (el, i) {
    el.style.left = CENTERS[i].x + "%";
    el.style.top = CENTERS[i].y + "%";
  });

  function orbLabel(o) {
    if (o.kind === "o") return OP_NAMES[o.v];
    return "number " + o.v + (o.el ? ", " + ELEMENTS[o.el].name : "");
  }

  function paintOrb(el, o, extra) {
    var cls = [extra];
    if (!o) cls.push("empty");
    else {
      cls.push(o.kind === "n" ? "number" : "operator");
      if (o.el) cls.push("el", ELEMENTS[o.el].cls);
    }
    el.className = cls.join(" ");
    el.textContent = o ? o.v : "";
  }

  function render() {
    var orbs = chainOrbs();
    var valid = isValid(orbs);
    var key = valid ? mixKey(orbs) : "";

    slotEls.forEach(function (el, i) {
      var o = slots[i];
      var sel = chain.indexOf(i) >= 0;
      paintOrb(el, o, "slot " + (SLOT_KIND[i] === "n" ? "kind-n" : "kind-o") + (sel ? " sel" : ""));
      if (arrived["s" + i]) { el.classList.add("arrive"); }
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

    // Chain lines: blue, or the mix's lead colour while a mix is held
    var lc = key ? leadColor(key) : "#73bed3";
    links.setAttribute("points", chain.map(function (i) { return CENTERS[i].x + "," + CENTERS[i].y; }).join(" "));
    links.style.stroke = lc;
    if (live && chain.length) {
      var last = CENTERS[chain[chain.length - 1]];
      liveLine.setAttribute("x1", last.x); liveLine.setAttribute("y1", last.y);
      liveLine.setAttribute("x2", live.x); liveLine.setAttribute("y2", live.y);
      liveLine.style.stroke = lc;
      liveLine.style.display = "";
    } else liveLine.style.display = "none";

    // Readout: "3 × 4 + 5 = 17" and the mix it makes
    if (orbs.length) {
      var text = orbs.map(function (o) { return o.v; }).join(" ");
      if (valid) text += " = " + evaluate(orbs);
      eqEl.textContent = text;
    } else eqEl.textContent = "";

    var mix = key && MIXES[key];
    if (mix) {
      var cols = mixColors(key);
      mixEl.innerHTML = "";
      var b = document.createElement("b");
      b.textContent = mix.name;
      b.style.backgroundImage = "linear-gradient(90deg, " + (cols.length > 1 ? cols.join(", ") : cols[0] + ", " + cols[0]) + ")";
      var s = document.createElement("span");
      s.textContent = mix.blurb;
      mixEl.appendChild(b);
      mixEl.appendChild(s);
      proc.style.setProperty("--charge", leadColor(key));
      proc.classList.toggle("ult", !!mix.ult);
    } else {
      mixEl.textContent = "";
      proc.classList.remove("ult");
    }
    proc.classList.toggle("charged", valid);
    if (!valid) proc.style.removeProperty("--charge");

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
    var p = toProc(e);
    var i = slotAt(p);
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
  var zones = [];
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
    var f = { x: x, y: y, hp: 14, el: el, dead: false, orbit: (Math.random() - 0.5) * 2,
              stunUntil: 0, slowUntil: 0, slowPct: 0, pull: null, burn: null, burst: 0, shownStun: false };
    foes.push(f);
    place(f);
    return f;
  }

  function near(a, b, d) { var dx = a.x - b.x, dy = a.y - b.y; return dx * dx + dy * dy < d * d; }

  function place(f) {
    f.el.style.transform = "translate(" + f.x.toFixed(1) + "px," + f.y.toFixed(1) + "px)";
    f.el.style.zIndex = String(Math.round(f.y));
  }

  function now() { return performance.now() / 1000; }

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
    var n = now();
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
      var stunned = n < f.stunUntil;
      f.el.classList.toggle("stunned", stunned);
      f.el.classList.toggle("slowed", !stunned && n < f.slowUntil);
      if (f.pull && n < f.pull.until) {
        var dx = f.pull.x - f.x, dy = f.pull.y - f.y, d = Math.hypot(dx, dy);
        if (d > 3) { var m = Math.min(d, speed * 7 * dt); f.x += dx / d * m; f.y += dy / d * m; }
      } else if (!stunned) {
        f.pull = null;
        var vx = p.x - f.x, vy = p.y - f.y, dist = Math.hypot(vx, vy) || 1;
        var slow = n < f.slowUntil ? 1 - f.slowPct / 100 : 1;
        if (dist > stop) {
          f.x += (vx / dist + (-vy / dist) * f.orbit * 0.35) * speed * slow * dt;
          f.y += (vy / dist + (vx / dist) * f.orbit * 0.35) * speed * slow * dt;
        } else {
          // Circle Oreivax instead of piling onto him
          f.x += (-vy / dist) * f.orbit * speed * 0.4 * slow * dt;
          f.y += (vx / dist) * f.orbit * speed * 0.4 * slow * dt;
        }
      }
      // Fire zones pull and burn
      zones.forEach(function (z) {
        if (n > z.until) return;
        var zx = z.x - f.x, zy = z.y - f.y, zd = Math.hypot(zx, zy);
        if (zd < z.r * 1.6 && zd > 4 && !(f.pull)) { f.x += zx / zd * speed * 2.2 * dt; f.y += zy / zd * speed * 2.2 * dt; }
        if (zd < z.r && z.burned.indexOf(f) < 0) { z.burned.push(f); burn(f, z.dmg, z.burnS); }
      });
      if (f.burn) tickBurn(f, n);
      if (f.dead) return;
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
    zones = zones.filter(function (z) { return n <= z.until; });
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

  // ---------- Damage and effects ----------

  function pop(x, y, text, cls) {
    var el = document.createElement("div");
    el.className = "pop" + (cls ? " " + cls : "");
    el.textContent = text;
    el.style.left = x + "px";
    el.style.top = y + "px";
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function hurt(f, d, cls) {
    if (f.dead) return;
    f.hp -= d;
    pop(f.x + (Math.random() - 0.5) * E * 0.6, f.y - E * 0.45 + (Math.random() - 0.5) * E * 0.4, String(d), cls);
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
    // Meltdown: a burning foe that dies bursts
    if (f.burst && f.burn) {
      var around = foesNear(f, E * 2.2);
      ring(f.x, f.y, E * 2.2, "#ff7a1a", "small");
      setTimeout(function () { around.forEach(function (o) { hurt(o, f.burst, "burn"); }); }, 120);
    }
  }

  function foesNear(c, r) {
    return foes.filter(function (f) { return !f.dead && near(f, c, r); });
  }

  function burn(f, total, seconds, burst) {
    if (f.dead || total <= 0) return;
    var ticks = Math.max(Math.round(seconds / 0.5), 1);
    f.burn = { per: total / ticks, left: ticks, next: now() + 0.5, acc: 0 };
    if (burst) f.burst = burst;
    f.el.classList.add("burning");
  }

  function tickBurn(f, n) {
    if (n < f.burn.next) return;
    f.burn.next += 0.5;
    f.burn.left--;
    f.burn.acc += f.burn.per;
    var whole = Math.floor(f.burn.acc);
    if (whole > 0) { f.burn.acc -= whole; hurt(f, whole, "burn"); }
    if (!f.dead && f.burn && f.burn.left <= 0) { f.burn = null; f.el.classList.remove("burning"); }
  }

  function stun(f, s) {
    if (f.dead || !s) return;
    f.stunUntil = Math.max(f.stunUntil, now() + s);
  }

  function slow(f, pct, s) {
    if (f.dead || !pct) return;
    f.slowPct = Math.max(n0(f.slowUntil) ? 0 : f.slowPct, pct);
    f.slowUntil = Math.max(f.slowUntil, now() + s);
  }
  function n0(until) { return now() > until; }

  function ring(x, y, r, color, size) {
    var el = document.createElement("div");
    el.className = "ring-fx" + (size ? " " + size : "");
    el.style.left = x + "px";
    el.style.top = y + "px";
    el.style.width = el.style.height = (r * 2) + "px";
    el.style.setProperty("--c", color);
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function beam(x, y, r, key, ult) {
    var bw = Math.max(r * 1.25, E * 2);
    var el = document.createElement("div");
    el.className = "beam" + (key ? " tint-" + leadColor(key).slice(1) : "") + (ult ? " ult" : "");
    el.style.setProperty("--bw", bw.toFixed(1) + "px");
    el.style.left = (x - bw / 2) + "px";
    el.style.top = (y - bw * 2 * 0.8) + "px";
    fxLayer.appendChild(el);
    el.addEventListener("animationend", function () { el.remove(); });
  }

  function zigzag(points) {
    var line = document.createElementNS(NS, "polyline");
    var pts = [];
    for (var i = 0; i < points.length - 1; i++) {
      var a = points[i], b = points[i + 1];
      for (var k = 0; k < 4; k++) {
        var t = k / 4;
        var j = k === 0 ? 0 : (Math.random() - 0.5) * E * 0.5;
        pts.push((a.x + (b.x - a.x) * t + j).toFixed(1) + "," + (a.y + (b.y - a.y) * t + j).toFixed(1));
      }
    }
    var last = points[points.length - 1];
    pts.push(last.x.toFixed(1) + "," + last.y.toFixed(1));
    line.setAttribute("points", pts.join(" "));
    fxSvg.appendChild(line);
    line.addEventListener("animationend", function () { line.remove(); });
  }

  function strikeRadius(tier) {
    var base = Math.min(W, H * 2.17);
    return base * [0.085, 0.12, 0.16][tier - 1];
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

  function strike(result, key) {
    var dmg = Math.max(result, 1);
    var tier = tierOf(dmg);
    var mix = MIXES[key] || null;
    var r = strikeRadius(tier);
    var at = pickTarget(r);
    var color = leadColor(key);
    var delay = 0;

    if (mix && mix.well) {
      var wr = r * mix.wellR;
      delay = Math.min(mix.well, 0.9);
      ring(at.x, at.y, wr, ELEMENTS.B.color, "well");
      foesNear(at, wr).forEach(function (f) { f.pull = { x: at.x, y: at.y, until: now() + delay }; });
    }

    setTimeout(function () {
      beam(at.x, at.y, r, key, mix && mix.ult);
      setTimeout(function () { land(at, r, dmg, tier, key, mix, color); }, 230);
    }, delay * 1000);
  }

  function land(at, r, dmg, tier, key, mix, color) {
    ring(at.x, at.y, r, color, tier === 3 ? "big" : "");
    var hits = foesNear(at, r);
    if (mix) pop(at.x, at.y - r * 0.9, mix.name, "mixname " + "c-" + color.slice(1));
    else if (tier > 1) pop(at.x, at.y - r * 0.9, "Tier " + tier, "mixname");

    hits.forEach(function (f) {
      hurt(f, dmg);
      if (!mix) return;
      if (mix.burn) burn(f, dmg * mix.burn / 100, mix.burnS, mix.burst ? hitDamage(dmg, mix.burst) : 0);
      if (mix.stun) stun(f, mix.stun);
      if (mix.slow) slow(f, mix.slow, mix.slowS);
    });
    if (!mix) return;

    if (mix.zone) {
      var zr = r * mix.zoneR;
      var z = { x: at.x, y: at.y, r: zr, until: now() + mix.zone, dmg: dmg * mix.zoneBurn / 100, burnS: 3, burned: [] };
      zones.push(z);
      var el = document.createElement("div");
      el.className = "zone";
      el.style.left = at.x + "px";
      el.style.top = at.y + "px";
      el.style.width = el.style.height = (zr * 2) + "px";
      el.style.animationDuration = "0.4s, " + mix.zone + "s";
      fxLayer.appendChild(el);
      setTimeout(function () { el.remove(); }, mix.zone * 1000 + 50);
    }

    if (mix.jumps) {
      var from = hits.length ? hits[hits.length - 1] : at;
      var range = r * (mix.range || 1.2);
      var path = [{ x: from.x, y: from.y }];
      var touched = hits.slice();
      for (var j = 0; j < mix.jumps; j++) {
        var next = null, nd = Infinity;
        foes.forEach(function (f) {
          if (f.dead || touched.indexOf(f) >= 0) return;
          var d = Math.hypot(f.x - from.x, f.y - from.y);
          if (d < range && d < nd) { nd = d; next = f; }
        });
        if (!next) break;
        touched.push(next);
        path.push({ x: next.x, y: next.y });
        (function (f, k) {
          setTimeout(function () {
            hurt(f, hitDamage(dmg, mix.chainPct), "zap");
            stun(f, mix.chainStun);
            if (mix.burn) burn(f, dmg * mix.burn / 100, mix.burnS);
          }, 60 * (k + 1));
        })(next, j);
        from = next;
      }
      if (path.length > 1) zigzag(path);
    }

    if (mix.blast) {
      setTimeout(function () {
        var br = r * (mix.blastR || 1);
        ring(at.x, at.y, br, color, "blast");
        foesNear(at, br).forEach(function (f) {
          hurt(f, hitDamage(dmg, mix.blast), mix.blastBurn ? "burn" : "");
          if (mix.blastStun) stun(f, mix.blastStun);
          if (mix.blastBurn) burn(f, dmg * mix.blastBurn / 100, 3);
        });
      }, mix.ult ? 500 : 450);
    }
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
