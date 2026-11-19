
class Component extends DCLogic {
  componentWillUnmount() { clearInterval(this._iv); }
  renderVals() {
    var self = this;
    var s = this.state || {};
    var MODES = {
      focus: { label: 'Focus · 25', secs: 1500, accent: '#D92D20', soft: '#FEE4E2', glow: 'rgba(217,45,32,.32)', name: 'Focus' },
      short: { label: 'Break · 5', secs: 300, accent: '#0F8A7C', soft: '#DDF3EF', glow: 'rgba(15,138,124,.32)', name: 'Short break' },
      long: { label: 'Long · 15', secs: 900, accent: '#5442E0', soft: '#EEECFD', glow: 'rgba(84,66,224,.32)', name: 'Long break' }
    };
    var mode = s.mode || 'focus';
    var M = MODES[mode];
    var remaining = s.remaining != null ? s.remaining : M.secs;
    var running = !!s.running;
    var sessions = s.sessions != null ? s.sessions : 1;
    var dnd = s.dnd !== false;
    function stop() { clearInterval(self._iv); self._iv = null; }
    function setMode(k) { stop(); self.setState({ mode: k, remaining: MODES[k].secs, running: false }); }
    function finish() {
      stop();
      var st = self.state || {};
      var cur = st.mode || 'focus';
      if (cur === 'focus') {
        var n = (st.sessions != null ? st.sessions : 1) + 1;
        var next = n % 4 === 0 ? 'long' : 'short';
        self.setState({ sessions: n, mode: next, remaining: MODES[next].secs, running: false });
      } else {
        self.setState({ mode: 'focus', remaining: MODES.focus.secs, running: false });
      }
    }
    var mm = Math.floor(remaining / 60), ss = remaining % 60;
    var done = sessions % 4;
    return {
      modes: ['focus', 'short', 'long'].map(function (k) {
        var on = k === mode;
        return { label: MODES[k].label, on: on, bg: on ? '#FFFFFF' : 'transparent', ink: on ? '#14142B' : '#5E5E73', fw: on ? '600' : '400', shadow: on ? '0 2px 8px rgba(38,28,120,.08)' : 'none', pick: function () { setMode(k); } };
      }),
      accent: M.accent, soft: M.soft, glow: M.glow,
      offset: (691.15 * (1 - remaining / M.secs)).toFixed(2),
      clock: (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss,
      status: running ? M.name : (remaining === M.secs ? 'Ready' : 'Paused'),
      running: running, paused: !running,
      playLabel: running ? 'Pause' : 'Start',
      toggle: function () {
        if (running) { stop(); self.setState({ running: false }); return; }
        self.setState({ running: true });
        clearInterval(self._iv);
        self._iv = setInterval(function () {
          var st = self.state || {};
          var r = (st.remaining != null ? st.remaining : MODES[st.mode || 'focus'].secs) - 1;
          if (r <= 0) { finish(); } else { self.setState({ remaining: r }); }
        }, 1000);
      },
      reset: function () { stop(); self.setState({ remaining: M.secs, running: false }); },
      skip: function () { finish(); },
      dots: [0, 1, 2, 3].map(function (i) { return { bg: i < done ? M.accent : '#DCDCE6' }; }),
      sessionText: 'Session ' + (done + 1) + ' of 4 · long break after 4',
      todayText: sessions + (sessions === 1 ? ' session' : ' sessions') + ' · ' + (sessions * 25) + ' min',
      dnd: dnd,
      dndTrack: dnd ? '#5442E0' : '#D9D8E4',
      dndKnob: dnd ? 'translateX(18px)' : 'none',
      toggleDnd: function () { self.setState({ dnd: !dnd }); }
    };
  }
}
