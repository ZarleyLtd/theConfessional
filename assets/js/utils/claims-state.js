/**
 * Claims state helper: given claims array and current userName, answer "is this slot claimed and by whom?"
 */

(function (global) {
  function slotKey(rowIndex, unitIndex) {
    return rowIndex + '_' + unitIndex;
  }

  function buildClaimMap(claims) {
    var map = {};
    if (!Array.isArray(claims)) return map;
    for (var i = 0; i < claims.length; i++) {
      var c = claims[i];
      var k = slotKey(c.rowIndex, c.unitIndex);
      map[k] = c.userName || '';
    }
    return map;
  }

  function getSlotState(claimMap, currentUser, rowIndex, unitIndex) {
    var k = slotKey(rowIndex, unitIndex);
    var claimedBy = claimMap[k];
    if (!claimedBy) return 'available';
    return claimedBy === currentUser ? 'claimed-by-me' : 'claimed-by-other';
  }

  global.ClaimsState = {
    slotKey: slotKey,
    buildClaimMap: buildClaimMap,
    getSlotState: getSlotState
  };
})(typeof window !== 'undefined' ? window : this);
