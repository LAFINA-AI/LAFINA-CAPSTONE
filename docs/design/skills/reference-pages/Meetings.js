
class Component extends DCLogic {
  componentWillUnmount() { clearInterval(this._iv); }
  renderVals() {
    var self = this;
    var s = this.state || {};
    var rec = !!s.rec;
    var t = s.t || 0;
    var LINES = [
      { who: 'Speaker 1', text: 'Let’s split the report into four parts.' },
      { who: 'Speaker 2', text: 'I’ll take the security section.' },
      { who: 'Speaker 1', text: 'Okay. The draft is due on Monday.' }
    ];
    var shown = Math.min(LINES.length, Math.floor(t / 3));
    var H = [14, 22, 30, 18, 38, 26, 44, 32, 20, 40, 48, 34, 24, 42, 30, 18, 36, 26, 16, 22, 12];
    var mm = Math.floor(t / 60), ss = t % 60;
    return {
      idle: !rec, recording: rec,
      panelBg: rec ? '#1B1640' : '#FFFFFF',
      start: function () {
        self.setState({ rec: true, t: 0 });
        clearInterval(self._iv);
        self._iv = setInterval(function () { self.setState({ t: ((self.state || {}).t || 0) + 1 }); }, 1000);
      },
      stop: function () { clearInterval(self._iv); self.setState({ rec: false, t: 0 }); },
      elapsed: (mm < 10 ? '0' : '') + mm + ':' + (ss < 10 ? '0' : '') + ss,
      bars: H.map(function (h, i) { return { h: h + 'px', c: i % 3 === 0 ? '#8B7EF0' : '#C9C2F7', d: ((i * 0.07) % 0.9).toFixed(2) + 's' }; }),
      lines: LINES.slice(Math.max(0, shown - 2), shown),
      todoFound: t >= 11,
      recent: [
        { title: 'Capstone group meeting', meta: 'Nov 18 · 42 min', tag: 'Summary ready', tagBg: '#E5F5EC', tagInk: '#1A7550' },
        { title: 'IT Elective 3 lecture', meta: 'Nov 17 · 1 h 12 min', tag: 'Transcribed', tagBg: '#EEECFD', tagInk: '#3B2CB8' },
        { title: 'Adviser consultation', meta: 'Nov 14 · 18 min', tag: 'Transcribed', tagBg: '#EEECFD', tagInk: '#3B2CB8' }
      ].map(function (r, i) { return Object.assign({ divider: i ? '1px solid #F0EFF6' : '0' }, r); })
    };
  }
}
