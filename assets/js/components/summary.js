/**
 * Summary: totals of food/drink claimed vs unclaimed for the current bill (portion-aware).
 */
(function (global) {
  function render(container, bill, claims) {
    if (!container) return;
    var items = (bill && bill.items) ? bill.items : [];
    var claimMap = ClaimsState.buildClaimMap(claims || []);
    var foodTotal = 0, foodClaimed = 0, drinkTotal = 0, drinkClaimed = 0;
    items.forEach(function (item) {
      var qty = item.quantity || 0;
      var category = (item.category || '').toLowerCase();
      var claimed = 0;
      for (var u = 0; u < qty; u++) {
        var info = ClaimsState.getSlotInfo(claimMap, item.rowIndex, u);
        var taken = Object.keys(info.byIndex || {}).length;
        if (!taken) continue;
        claimed += taken / Math.max(1, info.portionCount || 1);
      }
      if (category === 'food') {
        foodTotal += qty;
        foodClaimed += claimed;
      } else {
        drinkTotal += qty;
        drinkClaimed += claimed;
      }
    });
    function fmt(n) {
      var r = Math.round(n * 1000) / 1000;
      if (Math.abs(r - Math.round(r)) < 0.001) return String(Math.round(r));
      return String(r);
    }
    var foodUnclaimed = foodTotal - foodClaimed;
    var drinkUnclaimed = drinkTotal - drinkClaimed;
    container.innerHTML = '<div class="claims-summary">' +
      '<p class="claims-summary__title">Summary</p>' +
      '<p class="claims-summary__text">Food: ' + fmt(foodClaimed) + ' claimed, ' + fmt(foodUnclaimed) + ' unclaimed</p>' +
      '<p class="claims-summary__text">Drink: ' + fmt(drinkClaimed) + ' claimed, ' + fmt(drinkUnclaimed) + ' unclaimed</p>' +
      '</div>';
  }

  var Summary = {
    render: render
  };
  global.Summary = Summary;
})(typeof window !== 'undefined' ? window : this);
