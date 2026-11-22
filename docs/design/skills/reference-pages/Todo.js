
class Component extends DCLogic {
  renderVals() {
    var self = this;
    var s = this.state || {};
    var PRI = [
      { label: 'Low', ink: '#0B7468' },
      { label: 'Medium', ink: '#A15C07' },
      { label: 'High', ink: '#B42318' }
    ];
    var items = s.items || [
      { id: 1, title: 'Finish cloud computing slides', due: 'Today, 5:00 PM', tag: 'IT Elective 3', pri: 2, group: 'today', done: false },
      { id: 2, title: 'Review flashcards', due: '6 cards due', tag: 'IT Elective 3', pri: 1, group: 'today', done: false },
      { id: 3, title: 'Revise capstone chapter 3', due: 'Mon, Nov 23', tag: 'From notes', pri: 2, group: 'week', done: false },
      { id: 4, title: 'Submit ethics reflection', due: 'Wed, Nov 25', tag: 'Ethics', pri: 0, group: 'week', done: false },
      { id: 5, title: 'Buy bond paper', due: 'No date', tag: '', pri: 0, group: 'none', done: false }
    ];
    var pri = s.pri != null ? s.pri : 1;
    var draft = s.draft || '';
    var baseDone = 3;
    function addDraft() {
      if (!draft.trim()) return;
      var n = items.concat([{ id: Date.now(), title: draft.trim(), due: 'No date', tag: '', pri: pri, group: 'none', done: false }]);
      self.setState({ items: n, draft: '' });
    }
    var GROUPS = [
      { id: 'today', title: 'Today', ink: '#B42318' },
      { id: 'week', title: 'This week', ink: '#14142B' },
      { id: 'none', title: 'No date', ink: '#14142B' }
    ];
    var doneN = items.filter(function (i) { return i.done; }).length;
    return {
      draft: draft,
      onDraft: function (e) { self.setState({ draft: e.target.value }); },
      onKey: function (e) { if (e.key === 'Enter') addDraft(); },
      addDraft: addDraft,
      priLabel: PRI[pri].label, priInk: PRI[pri].ink,
      priAria: 'Priority: ' + PRI[pri].label + '. Tap to change',
      cyclePri: function () { self.setState({ pri: (pri + 1) % 3 }); },
      openCount: items.length - doneN,
      doneCount: baseDone + doneN,
      groups: GROUPS.map(function (g, gi) {
        var list = items.filter(function (i) { return i.group === g.id; });
        return {
          title: g.title, ink: g.ink, delay: (0.06 + gi * 0.04) + 's',
          items: list.map(function (t, i) {
            var p = PRI[t.pri];
            return {
              title: t.title, due: t.due, tag: t.tag, hasTag: !!t.tag, done: t.done,
              divider: i ? '1px solid #F0EFF6' : '0',
              ring: t.done ? '#1F8A5B' : p.ink,
              fill: t.done ? '#1F8A5B' : 'transparent',
              titleInk: t.done ? '#8A8AA0' : '#14142B',
              strike: t.done ? 'line-through' : 'none',
              dueInk: g.id === 'today' && !t.done ? '#B42318' : '#626277',
              toggle: function () {
                self.setState({ items: items.map(function (x) { return x.id === t.id ? Object.assign({}, x, { done: !x.done }) : x; }) });
              }
            };
          })
        };
      }).filter(function (g) { return g.items.length; })
    };
  }
}
