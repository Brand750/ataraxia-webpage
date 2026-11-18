// "Try a chain": the game's own rules (OperationEvaluator, AirStrike): numbers 1 to 9, worked out left to right,
// rounded down; a result under 1 still lands a weak strike; tiers start at 1, 20 and 82.
(function () {
  var chain = document.getElementById("chain");
  var result = document.getElementById("result");
  if (!chain || !result) return;

  var operators = ["+", "−", "×", "÷"];
  var names = { "+": "Plus", "−": "Minus", "×": "Times", "÷": "Divided by" };
  var tiers = [
    { min: 82, text: "A tier 3 strike: the widest blast." },
    { min: 20, text: "A tier 2 strike: a wider blast." },
    { min: 1, text: "A tier 1 strike." }
  ];

  function apply(a, op, b) {
    if (op === "+") return a + b;
    if (op === "−") return a - b;
    if (op === "×") return a * b;
    return b === 0 ? 0 : a / b;
  }

  function update() {
    var orbs = chain.querySelectorAll(".orb");
    var total = Number(orbs[0].dataset.value);
    for (var i = 1; i < orbs.length - 1; i += 2) {
      total = apply(total, orbs[i].dataset.value, Number(orbs[i + 1].dataset.value));
    }
    total = Math.floor(total);
    var line, tier;
    if (total < 1) {
      line = "A weak strike";
      tier = "The answer is under 1, so the strike deals its minimum damage.";
    } else {
      line = total + " damage";
      for (var t = 0; t < tiers.length; t++) {
        if (total >= tiers[t].min) { tier = tiers[t].text; break; }
      }
    }
    result.innerHTML = "";
    result.appendChild(document.createTextNode(line));
    var small = document.createElement("small");
    small.textContent = tier;
    result.appendChild(small);
  }

  chain.addEventListener("click", function (event) {
    var orb = event.target.closest(".orb");
    if (!orb) return;
    if (orb.dataset.kind === "number") {
      var n = Number(orb.dataset.value) % 9 + 1;
      orb.dataset.value = String(n);
      orb.textContent = n;
      orb.setAttribute("aria-label", "Number " + n);
    } else {
      var op = operators[(operators.indexOf(orb.dataset.value) + 1) % operators.length];
      orb.dataset.value = op;
      orb.textContent = op;
      orb.setAttribute("aria-label", names[op]);
    }
    update();
  });

  update();
})();
