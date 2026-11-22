
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var on = s.on || { a1: true, a2: true, a3: false };
    var ALARMS = [
      { id: 'a1', time: '5:30', ampm: 'AM', label: 'Wake up', repeat: 'Mon–Fri', days: [1, 2, 3, 4, 5] },
      { id: 'a2', time: '6:15', ampm: 'AM', label: 'Leave for campus', repeat: 'Face-to-face days', days: [1, 3, 5] },
      { id: 'a3', time: '9:00', ampm: 'PM', label: 'Review flashcards', repeat: 'Every day', days: [0, 1, 2, 3, 4, 5, 6] }
    ];
    var NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    var day = s.day != null ? s.day : 5;
    var list = ALARMS.filter(function (a) { return a.days.indexOf(day) >= 0; });
    var active = ALARMS.filter(function (a) { return on[a.id]; }).length;
    var nextA = ALARMS.filter(function (a) { return on[a.id]; })[0];
    return {
      heroBg: nextA ? '#5442E0' : '#6A6A80',
      nextTime: nextA ? nextA.time + ' ' + nextA.ampm : 'No alarm on',
      nextMeta: nextA ? 'Tomorrow · ' + nextA.label : 'Turn one on below or tap + to add',
      days: NAMES.map(function (n, i) {
        var sel = i === day;
        var has = ALARMS.some(function (a) { return on[a.id] && a.days.indexOf(i) >= 0; });
        return { label: n, on: sel, bg: sel ? '#14142B' : '#FFFFFF', ink: sel ? '#FFFFFF' : '#5E5E73', fw: sel ? '600' : '400', dot: has ? (sel ? '#FFFFFF' : '#5442E0') : 'transparent', pick: function () { self.setState({ day: i }); } };
      }),
      listTitle: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][day],
      activeText: active + ' on',
      alarms: list.map(function (a, i) {
        var isOn = !!on[a.id];
        return {
          time: a.time, ampm: a.ampm, label: a.label, repeat: a.repeat, on: isOn,
          aria: a.time + ' ' + a.ampm + ', ' + a.label,
          divider: i ? '1px solid #F0EFF6' : '0',
          timeInk: isOn ? '#14142B' : '#76768C',
          track: isOn ? '#5442E0' : '#D9D8E4',
          knob: isOn ? 'translateX(20px)' : 'none',
          toggle: function () { var n = Object.assign({}, on); n[a.id] = !isOn; self.setState({ on: n }); }
        };
      })
    };
  }
}
