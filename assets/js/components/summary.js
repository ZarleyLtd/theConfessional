/**
 * Summary: totals of food/drink claimed vs unclaimed for the current bill.
 */
(function (global) {
  function render(container, bill, claims) {
    if (!container) return;
    var items = (bill && bill.items) ? bill.items : [];
    var claimMap = ClaimsState.buildClaimMap(claims || [});
    var foodTotal = 0, foodClaimed = 0, drinkTotal = 0, drinkClaimed = 0;
    items.forEach(function (item) {
      var qty = item.quantity || 0;
      var category = (item.category || '').toLowerCase();
      var claimed = 0;
      for (var u = 0; u < qty; u++) {
        if (claimMap[ClaimsState.slotKey(item.rowIndex, u)]) claimed++;
      }
      if (category === 'food') {
        foodTotal += qty;
        foodClaimed += claimed;
      } else {
        drinkTotal += qty;
        drinkClaimed += claimed;
      }
    });
    var foodUnclaimed = foodTotal - foodClaimed;
    var drinkUnclaimed = drinkTotal - drinkClaimed;
    container.innerHTML = '<div class="claims-summary">' +
      '<p class="claims-summary__title">Summary</p>' +
      '<p class="claims-summary__text">Food: ' + foodClaimed + ' claimed, ' + foodUnclaimed + ' unclaimed</p>' +
      '<p class="claims-summary__text">Drink: ' + drinkClaimed + ' claimed, ' + drinkUnclaimed + ' unclaimed</p>' +
      '</div>';
  }

  var Summary = {
    render: render
  };
  global.Summary = Summary;
})(typeof window !== 'undefined' ? window : this);
