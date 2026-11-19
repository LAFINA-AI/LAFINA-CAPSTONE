
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var rows = s.rows || [
      { name: 'IT Elective 3', units: 3, grade: 1.75 },
      { name: 'Capstone Project 2', units: 3, grade: 1.5 },
      { name: 'Software Engineering', units: 3, grade: 2.0 },
      { name: 'Ethics', units: 3, grade: 1.25 },
      { name: 'PE 4', units: 2, grade: 1.0 }
    ];
    var units = 0, pts = 0;
    rows.forEach(function (r) { units += r.units; pts += r.units * r.grade; });
    var gwa = units ? pts / units : 0;
    function set(i, g) {
      var n = rows.map(function (r) { return Object.assign({}, r); });
      n[i].grade = Math.min(5, Math.max(1, Math.round(g * 4) / 4));
      self.setState({ rows: n });
    }
    return {
      gwa: gwa.toFixed(2),
      totals: units + ' units · ' + rows.length + ' subjects',
      marker: 'calc(' + ((gwa - 1) / 4 * 100).toFixed(1) + '% - 2px)',
      rows: rows.map(function (r, i) {
        var pass = r.grade <= 3;
        return {
          name: r.name, units: r.units + ' units', grade: r.grade.toFixed(2),
          divider: i ? '1px solid #F0EFF6' : '0',
          bg: pass ? (r.grade <= 1.75 ? '#E5F5EC' : '#F2F1F9') : '#FEF3F2',
          ink: pass ? (r.grade <= 1.75 ? '#1A7550' : '#14142B') : '#B42318',
          downLabel: 'Better grade for ' + r.name,
          upLabel: 'Lower grade for ' + r.name,
          down: function () { set(i, r.grade - 0.25); },
          up: function () { set(i, r.grade + 0.25); }
        };
      }),
      add: function () {
        if (rows.length >= 7) return;
        self.setState({ rows: rows.concat([{ name: 'New subject', units: 3, grade: 1.0 }]) });
      }
    };
  }
}
