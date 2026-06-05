(function () {
  if (typeof globalThis.FullCalendar !== 'undefined') return;
  if (typeof FullCalendar !== 'undefined') {
    globalThis.FullCalendar = FullCalendar;
  }
})();
