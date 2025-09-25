(function () {
  try {
    var canonicalHost = "hwptjb.com"; // prefer apex domain
    var h = location.hostname;
    // allow local development without redirect
    if (h === "localhost" || h === "127.0.0.1") return;
    // redirect everything else (e.g., *.web.app, www.hwptjb.com) to canonical
    if (h !== canonicalHost) {
      var target = location.protocol + "//" + canonicalHost + location.pathname + location.search + location.hash;
      location.replace(target);
      return;
    }
  } catch (e) {
    // no-op
  }
})();


